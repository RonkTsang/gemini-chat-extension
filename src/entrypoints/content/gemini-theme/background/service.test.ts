import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ThemeBackgroundSettings } from './types'

const {
  mockGet,
  mockPut,
  mockDelete,
  mockGetStored,
  mockSetStored,
  mockApplyStyle,
  mockClearStyle,
} = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPut: vi.fn(),
  mockDelete: vi.fn(),
  mockGetStored: vi.fn(),
  mockSetStored: vi.fn(),
  mockApplyStyle: vi.fn(),
  mockClearStyle: vi.fn(),
}))

vi.mock('@/data/db', () => ({
  db: {
    theme_assets: {
      get: mockGet,
      put: mockPut,
      delete: mockDelete,
    },
  },
}))

vi.mock('#imports', () => ({
  storage: {
    defineItem: () => ({
      getValue: mockGetStored,
      setValue: mockSetStored,
    }),
  },
}))

vi.mock('./storage', () => ({
  getStoredThemeBackgroundSettings: mockGetStored,
  setStoredThemeBackgroundSettings: mockSetStored,
}))

vi.mock('./styleController', () => ({
  applyThemeBackgroundStyle: mockApplyStyle,
  clearThemeBackgroundStyle: mockClearStyle,
}))

import {
  __resetThemeBackgroundServiceForTests,
  getThemeBackgroundSettings,
  resolveThemeBackgroundPreviewUrl,
  ThemeBackgroundError,
  uploadThemeBackground,
  validateThemeBackgroundFile,
} from './service'
import { BACKGROUND_FILE_SIZE_LIMIT } from './types'

function createSettings(overrides: Partial<ThemeBackgroundSettings> = {}): ThemeBackgroundSettings {
  return {
    version: 1,
    backgroundImageEnabled: false,
    backgroundBlurPx: 5,
    messageGlassEnabled: false,
    imageRef: { kind: 'none' },
    updatedAt: '2026-02-20T00:00:00.000Z',
    ...overrides,
  }
}

describe('theme background service', () => {
  const createObjectURLMock = vi.fn()
  const revokeObjectURLMock = vi.fn()

  beforeEach(() => {
    mockGet.mockReset()
    mockPut.mockReset()
    mockDelete.mockReset()
    mockGetStored.mockReset()
    mockSetStored.mockReset()
    mockApplyStyle.mockReset()
    mockClearStyle.mockReset()
    mockGetStored.mockResolvedValue(createSettings())
    mockSetStored.mockImplementation(async (next) => next)

    createObjectURLMock.mockReset()
    revokeObjectURLMock.mockReset()

    Object.defineProperty(URL, 'createObjectURL', {
      value: createObjectURLMock,
      configurable: true,
      writable: true,
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      value: revokeObjectURLMock,
      configurable: true,
      writable: true,
    })
    class MockImage {
      naturalWidth = 1920
      naturalHeight = 1080
      onload: null | ((event: Event) => void) = null
      onerror: null | ((event: Event) => void) = null

      set src(_: string) {
        this.onload?.(new Event('load'))
      }
    }
    Object.defineProperty(globalThis, 'Image', {
      value: MockImage,
      configurable: true,
      writable: true,
    })

    __resetThemeBackgroundServiceForTests()
  })

  it('validates file type and size', () => {
    const invalidType = new File(['x'], 'a.gif', { type: 'image/gif' })
    expect(() => validateThemeBackgroundFile(invalidType)).toThrow(ThemeBackgroundError)

    const oversized = new File(
      [new Uint8Array(BACKGROUND_FILE_SIZE_LIMIT + 1)],
      'a.png',
      { type: 'image/png' },
    )
    expect(() => validateThemeBackgroundFile(oversized)).toThrow(ThemeBackgroundError)

    const valid = new File(['ok'], 'a.webp', { type: 'image/webp' })
    expect(() => validateThemeBackgroundFile(valid)).not.toThrow()
  })

  it('repairs settings when referenced asset is missing', async () => {
    mockGetStored.mockResolvedValue(
      createSettings({
        backgroundImageEnabled: true,
        imageRef: { kind: 'asset', assetId: 'missing-id' },
      }),
    )
    mockGet.mockResolvedValue(undefined)
    mockSetStored.mockImplementation(async (next) => next)

    const result = await getThemeBackgroundSettings()

    expect(result.imageRef).toEqual({ kind: 'none' })
    expect(result.backgroundImageEnabled).toBe(false)
    expect(mockSetStored).toHaveBeenCalledTimes(1)
  })

  it('reuses object URL for same asset and revokes when switching asset', async () => {
    mockGet.mockImplementation(async (assetId: string) => {
      if (assetId === 'asset-1') {
        return {
          id: 'asset-1',
          feature: 'background-image',
          mimeType: 'image/png',
          size: 10,
          blob: new Blob(['1'], { type: 'image/png' }),
          createdAt: '2026-02-20T00:00:00.000Z',
          updatedAt: '2026-02-20T00:00:00.000Z',
        }
      }
      if (assetId === 'asset-2') {
        return {
          id: 'asset-2',
          feature: 'background-image',
          mimeType: 'image/png',
          size: 10,
          blob: new Blob(['2'], { type: 'image/png' }),
          createdAt: '2026-02-20T00:00:00.000Z',
          updatedAt: '2026-02-20T00:00:00.000Z',
        }
      }
      return undefined
    })
    createObjectURLMock
      .mockReturnValueOnce('blob:asset-1')
      .mockReturnValueOnce('blob:asset-2')

    const first = await resolveThemeBackgroundPreviewUrl(
      createSettings({
        backgroundImageEnabled: true,
        imageRef: { kind: 'asset', assetId: 'asset-1' },
      }),
    )
    const second = await resolveThemeBackgroundPreviewUrl(
      createSettings({
        backgroundImageEnabled: true,
        imageRef: { kind: 'asset', assetId: 'asset-1' },
      }),
    )
    const third = await resolveThemeBackgroundPreviewUrl(
      createSettings({
        backgroundImageEnabled: true,
        imageRef: { kind: 'asset', assetId: 'asset-2' },
      }),
    )

    expect(first).toBe('blob:asset-1')
    expect(second).toBe('blob:asset-1')
    expect(third).toBe('blob:asset-2')
    expect(createObjectURLMock).toHaveBeenCalledTimes(2)
    expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:asset-1')
  })

  it('does not rollback new asset when deleting old asset fails', async () => {
    let objectUrlCounter = 0
    createObjectURLMock.mockImplementation(() => `blob:test-${++objectUrlCounter}`)

    mockGetStored.mockResolvedValue(
      createSettings({
        backgroundImageEnabled: true,
        imageRef: { kind: 'asset', assetId: 'old-asset' },
      }),
    )
    mockGet.mockImplementation(async (assetId: string) => ({
      id: assetId,
      feature: 'background-image',
      mimeType: 'image/png',
      size: 10,
      blob: new Blob([assetId], { type: 'image/png' }),
      createdAt: '2026-02-20T00:00:00.000Z',
      updatedAt: '2026-02-20T00:00:00.000Z',
    }))
    mockDelete.mockImplementation(async (assetId: string) => {
      if (assetId === 'old-asset') {
        throw new Error('failed to delete old asset')
      }
    })

    const result = await uploadThemeBackground(
      new File(['new-image'], 'new.png', { type: 'image/png' }),
    )

    expect(result.settings.imageRef.kind).toBe('asset')
    expect(result.settings.backgroundImageEnabled).toBe(true)
    if (result.settings.imageRef.kind === 'asset') {
      expect(mockDelete).not.toHaveBeenCalledWith(result.settings.imageRef.assetId)
    }
    expect(mockDelete).toHaveBeenCalledWith('old-asset')
  })

  it('rolls back new asset when persisting settings fails', async () => {
    let objectUrlCounter = 0
    createObjectURLMock.mockImplementation(() => `blob:test-${++objectUrlCounter}`)

    mockSetStored.mockRejectedValueOnce(new Error('persist failed'))

    await expect(
      uploadThemeBackground(new File(['new-image'], 'new.png', { type: 'image/png' })),
    ).rejects.toThrow('persist failed')

    const insertedAsset = mockPut.mock.calls[0]?.[0] as { id?: string } | undefined
    expect(insertedAsset?.id).toBeTruthy()
    expect(mockDelete).toHaveBeenCalledWith(insertedAsset?.id)
  })
})
