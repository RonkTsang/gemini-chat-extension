import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { QuickFollowSettingsRow } from '../db'

const storage = vi.hoisted(() => ({
  row: undefined as QuickFollowSettingsRow | undefined,
  put: vi.fn(),
  syncGet: vi.fn(),
  syncSet: vi.fn(),
}))

vi.mock('../db', () => ({
  db: {
    quick_follow_settings: {
      get: async () => storage.row,
      put: async (row: QuickFollowSettingsRow) => {
        storage.put(row)
        storage.row = structuredClone(row)
      },
    },
    quick_follow_prompts: { toArray: async () => [] },
  },
}))
vi.mock('wxt/browser', () => ({
  browser: { storage: { sync: { get: storage.syncGet, set: storage.syncSet } } },
}))

import { quickFollowRepository } from './quickFollowRepository'

beforeEach(() => {
  storage.row = undefined
  storage.put.mockClear()
  storage.syncGet.mockReset().mockResolvedValue({})
  storage.syncSet.mockReset().mockImplementation(async values => {
    if ('quickFollowSelectionDisplayMode' in values) storage.syncGet.mockResolvedValue(values)
  })
})

describe('quick follow settings persistence', () => {
  it.each([undefined, { id: 'default', orderedIds: ['one'], enabled: false }] as const)(
    'defaults a missing display mode to auto for %j', async row => {
      storage.row = row ? { ...row, orderedIds: [...row.orderedIds] } : undefined
      expect((await quickFollowRepository.getSettings()).selectionDisplayMode).toBe('auto')
    },
  )

  it.each(['cards', 'compact', 'auto'] as const)('round-trips %s and preserves other settings', async selectionDisplayMode => {
    storage.row = { id: 'default', orderedIds: ['one'], enabled: false }
    await quickFollowRepository.setSelectionDisplayMode(selectionDisplayMode)
    expect(await quickFollowRepository.getSettings()).toEqual({
      orderedIds: ['one'], enabled: false, selectionDisplayMode,
    })
    expect(storage.syncSet).toHaveBeenCalledWith({ quickFollowSelectionDisplayMode: selectionDisplayMode })
    expect(storage.put).not.toHaveBeenCalled()
    await quickFollowRepository.setEnabled(true)
    await quickFollowRepository.reorder([])
    expect(await quickFollowRepository.getSettings()).toEqual({
      orderedIds: [], enabled: true, selectionDisplayMode,
    })
    expect(storage.syncSet.mock.calls).toEqual([
      [{ quickFollowSelectionDisplayMode: selectionDisplayMode }],
      [{ enableQuickQuote: true }],
    ])
  })

  it('honors valid synced preferences and ignores unsupported values', async () => {
    storage.syncGet.mockResolvedValueOnce({ quickFollowSelectionDisplayMode: 'cards' })
    expect((await quickFollowRepository.getSettings()).selectionDisplayMode).toBe('cards')
    storage.syncGet.mockResolvedValueOnce({ quickFollowSelectionDisplayMode: 'future-mode' })
    expect((await quickFollowRepository.getSettings()).selectionDisplayMode).toBe('auto')
    expect(storage.syncSet).not.toHaveBeenCalled()
  })

  it('rejects a failed sync save without changing the synced preference', async () => {
    storage.syncGet.mockResolvedValue({ quickFollowSelectionDisplayMode: 'cards' })
    storage.syncSet.mockRejectedValueOnce(new Error('sync write failed'))
    await expect(quickFollowRepository.setSelectionDisplayMode('compact')).rejects.toThrow('sync write failed')
    expect((await quickFollowRepository.getSettings()).selectionDisplayMode).toBe('cards')
    expect(storage.put).not.toHaveBeenCalled()
  })

  it('rejects an invalid mode before writing', async () => {
    const mode = JSON.parse('"unknown"')
    await expect(quickFollowRepository.setSelectionDisplayMode(mode)).rejects.toThrow()
    expect(storage.put).not.toHaveBeenCalled()
    expect(storage.syncSet).not.toHaveBeenCalled()
  })
})
