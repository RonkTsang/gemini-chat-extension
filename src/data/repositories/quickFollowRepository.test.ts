import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { QuickFollowSettingsRow } from '../db'

const storage = vi.hoisted(() => ({
  row: undefined as QuickFollowSettingsRow | undefined,
  put: vi.fn(),
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
vi.mock('wxt/browser', () => ({ browser: { storage: { sync: { set: vi.fn() } } } }))

import { quickFollowRepository } from './quickFollowRepository'

beforeEach(() => {
  storage.row = undefined
  storage.put.mockClear()
})

describe('quick follow settings persistence', () => {
  it.each([undefined, { id: 'default', orderedIds: ['one'], enabled: false }] as const)(
    'defaults a missing display mode to cards for %j', async row => {
      storage.row = row ? { ...row, orderedIds: [...row.orderedIds] } : undefined
      expect((await quickFollowRepository.getSettings()).selectionDisplayMode).toBe('cards')
    },
  )

  it.each(['compact', 'auto'] as const)('round-trips %s and preserves other settings', async selectionDisplayMode => {
    storage.row = { id: 'default', orderedIds: ['one'], enabled: false }
    expect(await quickFollowRepository.updateSettings({ selectionDisplayMode })).toEqual({
      orderedIds: ['one'], enabled: false, selectionDisplayMode,
    })
    expect((await quickFollowRepository.getSettings()).selectionDisplayMode).toBe(selectionDisplayMode)
    await quickFollowRepository.setEnabled(true)
    await quickFollowRepository.reorder([])
    expect(await quickFollowRepository.getSettings()).toEqual({
      orderedIds: [], enabled: true, selectionDisplayMode,
    })
  })

  it('rejects an invalid mode before writing', async () => {
    const patch = JSON.parse('{"selectionDisplayMode":"unknown"}')
    await expect(quickFollowRepository.updateSettings(patch)).rejects.toThrow()
    expect(storage.put).not.toHaveBeenCalled()
  })
})
