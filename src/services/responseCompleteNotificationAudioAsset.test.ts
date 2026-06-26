import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  dbGetMock,
  dbPutMock,
  dbDeleteMock,
} = vi.hoisted(() => ({
  dbGetMock: vi.fn(),
  dbPutMock: vi.fn(),
  dbDeleteMock: vi.fn(),
}))

vi.mock('@/data/db', () => ({
  db: {
    notification_audio_assets: {
      get: dbGetMock,
      put: dbPutMock,
      delete: dbDeleteMock,
    },
  },
}))

import {
  deleteResponseCompleteNotificationAudioAsset,
  getResponseCompleteNotificationAudioAssetMetadata,
  RESPONSE_COMPLETE_NOTIFICATION_AUDIO_ASSET_ID,
  RESPONSE_COMPLETE_NOTIFICATION_AUDIO_FILE_SIZE_LIMIT,
  ResponseCompleteNotificationAudioAssetError,
  saveResponseCompleteNotificationAudioAsset,
  validateResponseCompleteNotificationAudioFile,
} from './responseCompleteNotificationAudioAsset'

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

function createAudioFile(size = 1024): File {
  return new File([new Uint8Array(size)], 'notify.mp3', { type: 'audio/mpeg' })
}

describe('responseCompleteNotificationAudioAsset', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    shouldDecodeAudio = true
    dbGetMock.mockResolvedValue(undefined)
    dbPutMock.mockResolvedValue(undefined)
    dbDeleteMock.mockResolvedValue(undefined)
    vi.stubGlobal('Audio', MockAudio)
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:notify')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
  })

  it('saves a valid browser-playable audio file', async () => {
    const file = createAudioFile()

    const metadata = await saveResponseCompleteNotificationAudioAsset(file)

    expect(dbPutMock).toHaveBeenCalledWith(expect.objectContaining({
      id: RESPONSE_COMPLETE_NOTIFICATION_AUDIO_ASSET_ID,
      fileName: 'notify.mp3',
      mimeType: 'audio/mpeg',
      size: file.size,
      blob: file,
    }))
    expect(metadata.fileName).toBe('notify.mp3')
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:notify')
  })

  it('rejects files at the 2MB limit', async () => {
    const file = createAudioFile(RESPONSE_COMPLETE_NOTIFICATION_AUDIO_FILE_SIZE_LIMIT)

    await expect(validateResponseCompleteNotificationAudioFile(file)).rejects.toMatchObject({
      code: 'file-too-large',
    } satisfies Partial<ResponseCompleteNotificationAudioAssetError>)
    expect(dbPutMock).not.toHaveBeenCalled()
  })

  it('rejects non-audio files', async () => {
    const file = new File(['not audio'], 'note.txt', { type: 'text/plain' })

    await expect(validateResponseCompleteNotificationAudioFile(file)).rejects.toMatchObject({
      code: 'unsupported-type',
    } satisfies Partial<ResponseCompleteNotificationAudioAssetError>)
    expect(URL.createObjectURL).not.toHaveBeenCalled()
  })

  it('rejects audio files this browser cannot decode and revokes the probe URL', async () => {
    shouldDecodeAudio = false

    await expect(validateResponseCompleteNotificationAudioFile(createAudioFile())).rejects.toMatchObject({
      code: 'decode-failed',
    } satisfies Partial<ResponseCompleteNotificationAudioAssetError>)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:notify')
  })

  it('returns metadata without the stored blob', async () => {
    dbGetMock.mockResolvedValue({
      id: RESPONSE_COMPLETE_NOTIFICATION_AUDIO_ASSET_ID,
      fileName: 'custom.wav',
      mimeType: 'audio/wav',
      size: 512,
      blob: new Blob(['audio'], { type: 'audio/wav' }),
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })

    await expect(getResponseCompleteNotificationAudioAssetMetadata()).resolves.toEqual({
      id: RESPONSE_COMPLETE_NOTIFICATION_AUDIO_ASSET_ID,
      fileName: 'custom.wav',
      mimeType: 'audio/wav',
      size: 512,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })
  })

  it('deletes the custom audio asset', async () => {
    await deleteResponseCompleteNotificationAudioAsset()

    expect(dbDeleteMock).toHaveBeenCalledWith(RESPONSE_COMPLETE_NOTIFICATION_AUDIO_ASSET_ID)
  })
})
