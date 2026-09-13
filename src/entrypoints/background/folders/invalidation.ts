import { browser } from 'wxt/browser'

export interface FolderDataChangedMessage {
  type: 'folders:data-changed'
  accountScopeId: string
  dataRevision: string
  affected: { folderIds?: string[]; chatIds?: string[]; settings?: boolean; syncStatus?: boolean }
}

/** Broadcast is best-effort; active content scripts re-read on focus/startup. */
export async function publishFolderInvalidation(
  message: FolderDataChangedMessage,
  options?: { excludeTabId?: number },
): Promise<void> {
  const tabs = await browser.tabs.query({})
  await Promise.allSettled(tabs
    .filter((tab) => tab.id !== undefined && tab.id !== options?.excludeTabId)
    .map((tab) => browser.tabs.sendMessage(tab.id!, message)))
}
