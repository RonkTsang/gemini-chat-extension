import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  sendMessageMock,
  toasterCreateMock,
} = vi.hoisted(() => ({
  sendMessageMock: vi.fn(),
  toasterCreateMock: vi.fn(),
}))

vi.mock('@/services/responseCompleteNotificationAudioAsset', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/services/responseCompleteNotificationAudioAsset')>()
  return {
    ...original,
  }
})

vi.mock('wxt/browser', () => ({
  browser: {
    runtime: {
      sendMessage: sendMessageMock,
    },
  },
}))

vi.mock('@/components/ui/toaster', () => ({
  toaster: {
    create: toasterCreateMock,
  },
}))

vi.mock('@/utils/i18n', () => ({
  t: (id: string) => id,
}))

vi.mock('#i18n', () => ({
  i18n: {
    t: (id: string) => id,
  },
}))

type HookResult = {
  metadata: ReturnType<typeof createMetadata> | null
  fileSizeLabel: string | null
  isLoading: boolean
  isPending: boolean
  uploadAudio: (file: File) => Promise<void>
  restoreDefault: () => Promise<void>
}

let root: Root
let container: HTMLDivElement
let latestResult: HookResult | null = null
let useNotificationAudioAsset: (enabled: boolean) => HookResult
let shouldDecodeAudio = true

class MockAudio {
  listeners = new Map<string, Set<() => void>>()
  preload = ''
  src = ''

  addEventListener(event: string, callback: () => void) {
    const listeners = this.listeners.get(event) ?? new Set<() => void>()
    listeners.add(callback)
    this.listeners.set(event, listeners)
  }

  removeEventListener(event: string, callback: () => void) {
    this.listeners.get(event)?.delete(callback)
  }

  removeAttribute(attribute: string) {
    if (attribute === 'src') {
      this.src = ''
    }
  }

  load() {
    const event = shouldDecodeAudio ? 'loadedmetadata' : 'error'
    this.listeners.get(event)?.forEach(callback => callback())
  }
}

function HookHarness({ enabled }: { enabled: boolean }) {
  latestResult = useNotificationAudioAsset(enabled)
  return null
}

async function renderHook(enabled: boolean) {
  await act(async () => {
    root.render(<HookHarness enabled={enabled} />)
  })
}

function getLatestResult(): HookResult {
  if (!latestResult) {
    throw new Error('hook did not render')
  }
  return latestResult
}

function createMetadata(fileName = 'custom.mp3') {
  return {
    id: 'response-complete-notification' as const,
    fileName,
    mimeType: 'audio/mpeg',
    size: 1024,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

describe('useNotificationAudioAsset', () => {
  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.doMock('@/utils/i18n', () => ({
      t: (id: string) => id,
    }))
    vi.doMock('#i18n', () => ({
      i18n: {
        t: (id: string) => id,
      },
    }))
    vi.doMock('@/components/ui/toaster', () => ({
      toaster: {
        create: toasterCreateMock,
      },
    }))
    ;(globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean
    }).IS_REACT_ACT_ENVIRONMENT = true
    shouldDecodeAudio = true
    vi.stubGlobal('Audio', MockAudio)
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:audio-probe')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    latestResult = null
    sendMessageMock.mockImplementation((message: { type: string }) => {
      if (message.type === 'response-complete-notification-audio-asset:get-metadata') {
        return Promise.resolve({ ok: true, audioAsset: null })
      }
      if (message.type === 'response-complete-notification-audio-asset:save') {
        return Promise.resolve({ ok: true, audioAsset: createMetadata() })
      }
      if (message.type === 'response-complete-notification-audio-asset:delete') {
        return Promise.resolve({ ok: true, audioAsset: null })
      }
      return Promise.resolve({ ok: false })
    })
    useNotificationAudioAsset = (await import('./useNotificationAudioAsset')).useNotificationAudioAsset
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  it('does not load metadata while disabled', async () => {
    await renderHook(false)

    expect(sendMessageMock).not.toHaveBeenCalled()
    expect(getLatestResult().metadata).toBeNull()
  })

  it('loads default empty metadata while enabled', async () => {
    await renderHook(true)

    expect(sendMessageMock).toHaveBeenCalledWith({
      type: 'response-complete-notification-audio-asset:get-metadata',
    })
    expect(getLatestResult().metadata).toBeNull()
  })

  it('updates metadata after upload', async () => {
    await renderHook(true)
    const file = new File(['audio'], 'custom.mp3', { type: 'audio/mpeg' })

    await act(async () => {
      await getLatestResult().uploadAudio(file)
    })

    expect(sendMessageMock).toHaveBeenCalledWith(expect.objectContaining({
      type: 'response-complete-notification-audio-asset:save',
      payload: expect.objectContaining({
        fileName: 'custom.mp3',
        mimeType: 'audio/mpeg',
        size: file.size,
      }),
    }))
    expect(getLatestResult().metadata?.fileName).toBe('custom.mp3')
  })

  it('clears metadata after restoring the default sound', async () => {
    sendMessageMock.mockImplementation((message: { type: string }) => {
      if (message.type === 'response-complete-notification-audio-asset:get-metadata') {
        return Promise.resolve({ ok: true, audioAsset: createMetadata() })
      }
      if (message.type === 'response-complete-notification-audio-asset:delete') {
        return Promise.resolve({ ok: true, audioAsset: null })
      }
      return Promise.resolve({ ok: false })
    })
    await renderHook(true)

    await act(async () => {
      await getLatestResult().restoreDefault()
    })

    expect(sendMessageMock).toHaveBeenCalledWith({
      type: 'response-complete-notification-audio-asset:delete',
    })
    expect(getLatestResult().metadata).toBeNull()
  })

  it('shows a toast when upload fails', async () => {
    sendMessageMock.mockImplementation((message: { type: string }) => {
      if (message.type === 'response-complete-notification-audio-asset:get-metadata') {
        return Promise.resolve({ ok: true, audioAsset: null })
      }
      if (message.type === 'response-complete-notification-audio-asset:save') {
        return Promise.resolve({ ok: false })
      }
      return Promise.resolve({ ok: false })
    })
    await renderHook(true)
    const file = new File(['audio'], 'custom.mp3', { type: 'audio/mpeg' })
    let thrownError: unknown

    await act(async () => {
      try {
        await getLatestResult().uploadAudio(file)
      } catch (error) {
        thrownError = error
      }
    })

    expect(thrownError).toBeInstanceOf(Error)
    expect((thrownError as Error).message).toContain('Could not save notification sound')
    expect(toasterCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      type: 'error',
    }))
  })
})
