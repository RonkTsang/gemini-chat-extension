import { browser } from 'wxt/browser'

import { FolderSyncCoordinator } from '@/services/folder-sync/coordinator'
import {
  isFoldersSyncAccountMessage,
  type FoldersSyncAccountResponse,
} from '@/types/runtime-messages'
import { logFolderTrace, logFolderTraceError } from '@/utils/folderTrace'

let started = false
const coordinator = new FolderSyncCoordinator()

/** Registers a background-only, short-lived Browser Sync request handler. */
export function startFolderSyncCoordinator(): void {
  if (started) return
  started = true
  browser.runtime.onMessage.addListener((message): Promise<FoldersSyncAccountResponse> | undefined => {
    if (!isFoldersSyncAccountMessage(message)) return undefined
    if (message.traceId) {
      logFolderTrace(message.traceId, 'background.sync-received', {
        accountScopeId: message.accountScopeId,
      })
    }
    return coordinator.sync(message.accountScopeId, message.traceId)
      .then(() => {
        if (message.traceId) {
          logFolderTrace(message.traceId, 'background.sync-finished', {
            accountScopeId: message.accountScopeId,
          })
        }
        return { ok: true }
      })
      .catch((error) => {
        if (message.traceId) {
          logFolderTraceError(message.traceId, 'background.sync-failed', error, {
            accountScopeId: message.accountScopeId,
          })
        }
        return { ok: false, error: error instanceof Error ? error.message : 'Browser Sync failed' }
      })
  })
  browser.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'sync') return
    for (const key of Object.keys(changes)) {
      const match = key.match(/^folders:([A-Za-z0-9_-]{16,128}):manifest$/u)
      if (!match) continue
      void coordinator.sync(match[1]).catch((error) => {
        // The coordinator records the failure in account-local sync state; do
        // not turn a browser storage event into an unhandled background error.
        console.warn('[Folders] Browser Sync change could not be applied', error)
      })
    }
  })
}
