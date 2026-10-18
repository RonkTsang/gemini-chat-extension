import { browser } from 'wxt/browser'
import type { FolderAffected } from '@/domain/folder/changes'

export interface FolderDataChangedMessage {
  type: 'folders:data-changed'
  accountScopeId: string
  dataRevision: string
  baseRevision?: string
  requestId?: string
  affected: FolderAffected
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
