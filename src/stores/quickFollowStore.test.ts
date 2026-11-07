import { beforeEach, expect, it, vi } from 'vitest'

const updateSettings = vi.hoisted(() => vi.fn())
vi.mock('@/data/repositories', () => ({ quickFollowRepository: { updateSettings } }))
vi.mock('wxt/browser', () => ({ browser: {} }))

import { useQuickFollowStore } from './quickFollowStore'

beforeEach(() => {
  updateSettings.mockReset()
  useQuickFollowStore.setState({
    settings: { enabled: true, orderedIds: [], selectionDisplayMode: 'cards' },
  })
})

it('publishes the selected mode only after persistence succeeds', async () => {
  let finish: (value: { enabled: boolean; orderedIds: string[]; selectionDisplayMode: 'compact' }) => void = () => undefined
  updateSettings.mockReturnValue(new Promise(resolve => { finish = resolve }))
  const saving = useQuickFollowStore.getState().setSelectionDisplayMode('compact')
  expect(useQuickFollowStore.getState().settings.selectionDisplayMode).toBe('cards')
  finish({ enabled: true, orderedIds: [], selectionDisplayMode: 'compact' })
  await saving
  expect(useQuickFollowStore.getState().settings.selectionDisplayMode).toBe('compact')
})

it('keeps the selected mode when saving fails', async () => {
  updateSettings.mockRejectedValue(new Error('write failed'))
  await expect(useQuickFollowStore.getState().setSelectionDisplayMode('compact')).rejects.toThrow('write failed')
  expect(useQuickFollowStore.getState().settings.selectionDisplayMode).toBe('cards')
})
