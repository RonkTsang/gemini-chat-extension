export const FOLDER_TITLE_DOUBLE_CLICK_DELAY_MS = 250

export interface FolderTitleClickController {
  scheduleSingleClick: (onSingleClick: () => void) => void
  handleDoubleClick: (onDoubleClick: () => void) => void
  cancel: () => void
}

/**
 * Defers a title's single-click action just long enough to distinguish it
 * from the double-click that opens the shared Folder editor.
 */
export function createFolderTitleClickController(): FolderTitleClickController {
  let pendingTimeout: ReturnType<typeof setTimeout> | undefined

  const cancel = () => {
    if (pendingTimeout === undefined) return
    clearTimeout(pendingTimeout)
    pendingTimeout = undefined
  }

  return {
    scheduleSingleClick(onSingleClick) {
      cancel()
      pendingTimeout = setTimeout(() => {
        pendingTimeout = undefined
        onSingleClick()
      }, FOLDER_TITLE_DOUBLE_CLICK_DELAY_MS)
    },
    handleDoubleClick(onDoubleClick) {
      cancel()
      onDoubleClick()
    },
    cancel,
  }
}
