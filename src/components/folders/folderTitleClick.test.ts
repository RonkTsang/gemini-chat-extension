import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  createFolderTitleClickController,
  FOLDER_TITLE_DOUBLE_CLICK_DELAY_MS,
} from './folderTitleClick'

describe('createFolderTitleClickController', () => {
  afterEach(() => vi.useRealTimers())

  it('runs a single-click action after the double-click window', () => {
    vi.useFakeTimers()
    const onSingleClick = vi.fn()
    const controller = createFolderTitleClickController()

    controller.scheduleSingleClick(onSingleClick)
    vi.advanceTimersByTime(FOLDER_TITLE_DOUBLE_CLICK_DELAY_MS - 1)
    expect(onSingleClick).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(onSingleClick).toHaveBeenCalledOnce()
  })

  it('opens the editor instead of running the pending single-click action', () => {
    vi.useFakeTimers()
    const onSingleClick = vi.fn()
    const onDoubleClick = vi.fn()
    const controller = createFolderTitleClickController()

    controller.scheduleSingleClick(onSingleClick)
    controller.handleDoubleClick(onDoubleClick)
    vi.runAllTimers()

    expect(onSingleClick).not.toHaveBeenCalled()
    expect(onDoubleClick).toHaveBeenCalledOnce()
  })
})
