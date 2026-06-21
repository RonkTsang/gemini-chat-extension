import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockDeleteGemAvatarAsset,
  mockGetGemAvatarByGemId,
  mockPutGemAvatarAsset,
} = vi.hoisted(() => ({
  mockDeleteGemAvatarAsset: vi.fn(),
  mockGetGemAvatarByGemId: vi.fn(),
  mockPutGemAvatarAsset: vi.fn(),
}))

vi.mock('../sources', () => ({
  localDexieDataSource: {
    deleteGemAvatarAsset: mockDeleteGemAvatarAsset,
    getGemAvatarByGemId: mockGetGemAvatarByGemId,
    putGemAvatarAsset: mockPutGemAvatarAsset,
  },
}))

import {
  gemAvatarRepository,
  GemAvatarError,
  validateGemAvatarFile,
} from './gemAvatarRepository'
import { GEM_AVATAR_FILE_SIZE_LIMIT } from '@/domain/gem-avatar/types'

describe('gemAvatarRepository', () => {
  const createObjectURLMock = vi.fn()
  const revokeObjectURLMock = vi.fn()

  beforeEach(() => {
    mockDeleteGemAvatarAsset.mockReset()
    mockGetGemAvatarByGemId.mockReset()
    mockPutGemAvatarAsset.mockReset()
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
    gemAvatarRepository.revokeActiveObjectUrl()
  })

  it('validates file type and size', () => {
    const invalidType = new File(['x'], 'a.gif', { type: 'image/gif' })
    expect(() => validateGemAvatarFile(invalidType)).toThrow(GemAvatarError)

    const oversized = new File(
      [new Uint8Array(GEM_AVATAR_FILE_SIZE_LIMIT + 1)],
      'a.png',
      { type: 'image/png' },
    )
    expect(() => validateGemAvatarFile(oversized)).toThrow(GemAvatarError)

    const valid = new File(['ok'], 'a.webp', { type: 'image/webp' })
    expect(() => validateGemAvatarFile(valid)).not.toThrow()
  })

  it('saves a prepared avatar by Gem ID', async () => {
    mockGetGemAvatarByGemId.mockResolvedValue(undefined)
    mockPutGemAvatarAsset.mockImplementation(async (row) => row)

    await gemAvatarRepository.savePrepared('gem-1', {
      mimeType: 'image/webp',
      size: 10,
      blob: new Blob(['avatar'], { type: 'image/webp' }),
      width: 256,
      height: 256,
    })

    expect(mockPutGemAvatarAsset).toHaveBeenCalledWith(expect.objectContaining({
      gemId: 'gem-1',
      mimeType: 'image/webp',
      size: 10,
      width: 256,
      height: 256,
    }))
  })

  it('reuses and revokes the active object URL', async () => {
    mockGetGemAvatarByGemId.mockResolvedValue({
      gemId: 'gem-1',
      mimeType: 'image/webp',
      size: 10,
      blob: new Blob(['avatar'], { type: 'image/webp' }),
      width: 256,
      height: 256,
      createdAt: '2026-06-20T00:00:00.000Z',
      updatedAt: '2026-06-20T00:00:00.000Z',
    })
    createObjectURLMock.mockReturnValueOnce('blob:gem-1')

    const first = await gemAvatarRepository.resolveObjectUrl('gem-1')
    const second = await gemAvatarRepository.resolveObjectUrl('gem-1')

    expect(first).toBe('blob:gem-1')
    expect(second).toBe('blob:gem-1')
    expect(createObjectURLMock).toHaveBeenCalledTimes(1)

    gemAvatarRepository.revokeActiveObjectUrl()
    expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:gem-1')
  })

  it('deletes an avatar and revokes the matching active object URL', async () => {
    mockGetGemAvatarByGemId.mockResolvedValue({
      gemId: 'gem-1',
      mimeType: 'image/webp',
      size: 10,
      blob: new Blob(['avatar'], { type: 'image/webp' }),
      width: 256,
      height: 256,
      createdAt: '2026-06-20T00:00:00.000Z',
      updatedAt: '2026-06-20T00:00:00.000Z',
    })
    createObjectURLMock.mockReturnValueOnce('blob:gem-1')

    await gemAvatarRepository.resolveObjectUrl('gem-1')
    await gemAvatarRepository.deleteByGemId('gem-1')

    expect(mockDeleteGemAvatarAsset).toHaveBeenCalledWith('gem-1')
    expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:gem-1')
  })
})
