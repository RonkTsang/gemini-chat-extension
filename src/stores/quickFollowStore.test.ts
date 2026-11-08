import { beforeEach, expect, it, vi } from 'vitest'

const setSelectionDisplayMode = vi.hoisted(() => vi.fn())
vi.mock('@/data/repositories', () => ({ quickFollowRepository: { setSelectionDisplayMode } }))
vi.mock('wxt/browser', () => ({ browser: {} }))

import { useQuickFollowStore } from './quickFollowStore'

beforeEach(() => {
  setSelectionDisplayMode.mockReset()
  useQuickFollowStore.setState({
    settings: { enabled: true, orderedIds: [], selectionDisplayMode: 'cards' },
  })
})

it('publishes the selected mode only after persistence succeeds', async () => {
  let finish: () => void = () => undefined
  setSelectionDisplayMode.mockReturnValue(new Promise<void>(resolve => { finish = resolve }))
  const saving = useQuickFollowStore.getState().setSelectionDisplayMode('compact')
  expect(useQuickFollowStore.getState().settings.selectionDisplayMode).toBe('cards')
  finish()
  await saving
  expect(useQuickFollowStore.getState().settings.selectionDisplayMode).toBe('compact')
})

it('keeps the selected mode when saving fails', async () => {
  setSelectionDisplayMode.mockRejectedValue(new Error('write failed'))
  await expect(useQuickFollowStore.getState().setSelectionDisplayMode('compact')).rejects.toThrow('write failed')
  expect(useQuickFollowStore.getState().settings.selectionDisplayMode).toBe('cards')
})
