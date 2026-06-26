import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  getAudioAssetMock,
  runtimeAddListenerMock,
} = vi.hoisted(() => ({
  getAudioAssetMock: vi.fn(),
  runtimeAddListenerMock: vi.fn(),
}))

vi.mock('@/assets/sound/notification.mp3?url', () => ({
  default: 'chrome-extension://extension-id/assets/default-notification.mp3',
}))

vi.mock('@/services/responseCompleteNotificationAudioAsset', () => ({
  getResponseCompleteNotificationAudioAsset: getAudioAssetMock,
}))

vi.mock('@/utils/devLogger', () => ({
  logDevMessage: vi.fn(),
}))

vi.mock('wxt/browser', () => ({
  browser: {
    runtime: {
      onMessage: {
        addListener: runtimeAddListenerMock,
      },
    },
  },
}))

class MockAudio {
  static instances: MockAudio[] = []

  currentTime = 0
  preload = ''
  src = ''
  play = vi.fn(() => Promise.resolve())
  load = vi.fn()

  constructor() {
    MockAudio.instances.push(this)
  }

  removeAttribute(attribute: string) {
    if (attribute === 'src') {
      this.src = ''
    }
  }
}

function createAudioAsset(updatedAt: string, blob = new Blob(['audio'], { type: 'audio/mpeg' })) {
  return {
    id: 'response-complete-notification',
    fileName: 'custom.mp3',
    mimeType: 'audio/mpeg',
    size: 5,
    blob,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt,
  }
}

async function loadModule() {
  return await import('./main')
}

describe('notification audio offscreen', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    MockAudio.instances = []
    getAudioAssetMock.mockResolvedValue(null)
    vi.stubGlobal('Audio', MockAudio)
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:custom-audio')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
  })

  it('plays the bundled default sound without a custom asset', async () => {
    const { playResponseCompleteNotificationAudioFromOffscreen } = await loadModule()

    await playResponseCompleteNotificationAudioFromOffscreen()

    const audio = MockAudio.instances[0]
    expect(audio.src).toBe('chrome-extension://extension-id/assets/default-notification.mp3')
    expect(audio.play).toHaveBeenCalledTimes(1)
    expect(URL.createObjectURL).not.toHaveBeenCalled()
  })

  it('plays a custom audio blob when one is stored', async () => {
    getAudioAssetMock.mockResolvedValue(createAudioAsset('2026-01-01T00:00:00.000Z'))
    const { playResponseCompleteNotificationAudioFromOffscreen } = await loadModule()

    await playResponseCompleteNotificationAudioFromOffscreen()

    const audio = MockAudio.instances[0]
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1)
    expect(audio.src).toBe('blob:custom-audio')
    expect(audio.play).toHaveBeenCalledTimes(1)
  })

  it('falls back to the bundled sound when custom audio cannot be read', async () => {
    getAudioAssetMock.mockRejectedValue(new Error('db unavailable'))
    const { playResponseCompleteNotificationAudioFromOffscreen } = await loadModule()

    await playResponseCompleteNotificationAudioFromOffscreen()

    const audio = MockAudio.instances[0]
    expect(audio.src).toBe('chrome-extension://extension-id/assets/default-notification.mp3')
    expect(audio.play).toHaveBeenCalledTimes(1)
  })

  it('revokes the previous custom object URL when the asset changes', async () => {
    getAudioAssetMock
      .mockResolvedValueOnce(createAudioAsset('2026-01-01T00:00:00.000Z'))
      .mockResolvedValueOnce(createAudioAsset('2026-01-01T00:00:01.000Z'))
    vi.mocked(URL.createObjectURL)
      .mockReturnValueOnce('blob:first-audio')
      .mockReturnValueOnce('blob:second-audio')
    const { playResponseCompleteNotificationAudioFromOffscreen } = await loadModule()

    await playResponseCompleteNotificationAudioFromOffscreen()
    await playResponseCompleteNotificationAudioFromOffscreen()

    const audio = MockAudio.instances[0]
    expect(audio.src).toBe('blob:second-audio')
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:first-audio')
  })

  it('registers the runtime playback listener', async () => {
    await loadModule()

    expect(runtimeAddListenerMock).toHaveBeenCalledTimes(1)
    const listener = runtimeAddListenerMock.mock.calls[0]?.[0]
    expect(listener({
      type: 'response-complete-notification-audio:play',
      target: 'offscreen',
    })).toBeInstanceOf(Promise)
  })
})
