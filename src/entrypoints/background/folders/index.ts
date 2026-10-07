import { browser } from 'wxt/browser'

import { createFolderRpcHandler } from './rpc-handler'
import { createFolderAccountHistoryHandler } from './account-history'
import { folderRepository } from '@/data/repositories/folderRepository'
import { FolderSyncScheduler } from '@/services/folder-sync/scheduler'
import { logDevError, logDevEvent } from '@/utils/devLogger'
import { pruneRecoveryHistory } from '@/services/folder-recovery/storage'

let started = false

async function removeLegacyFolderSyncKeys(): Promise<void> {
  try {
    const values = await browser.storage.sync.get(null)
    const legacyKeys = Object.keys(values).filter((key) => key.startsWith('folders:') && !key.startsWith('folders:v3:'))
    if (!legacyKeys.length) return
    await browser.storage.sync.remove(legacyKeys)
    logDevEvent('info', '[Folders][sync]', 'browser-sync.legacy-namespace-removed', { removedKeys: legacyKeys.length })
  } catch (error) {
    // Cleanup is intentionally best-effort. It cannot make the V3 protocol
    // unavailable, and a future worker activation retries it.
    logDevError('[Folders][sync]', 'browser-sync.legacy-namespace-remove-failed', error)
  }
}

async function schedulePersistedFolderSyncWork(scheduler: FolderSyncScheduler): Promise<void> {
  const scopes = await folderRepository.listBrowserSyncWakeScopes()
  scopes.forEach((accountScopeId) => scheduler.requestRun(accountScopeId, 'background-resume'))
}

export function startFoldersBackground(): void {
  if (started) return
  started = true
  const scheduler = new FolderSyncScheduler()
  void pruneRecoveryHistory().catch((error) => logDevError('[Folders]', 'recovery.history-prune-failed', error))
  void removeLegacyFolderSyncKeys()
  void schedulePersistedFolderSyncWork(scheduler)
  browser.runtime.onMessage.addListener(createFolderRpcHandler(scheduler))
  browser.runtime.onMessage.addListener(createFolderAccountHistoryHandler())
  browser.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'sync') return
    for (const key of Object.keys(changes)) {
      const match = key.match(/^folders:v3:([A-Za-z0-9_-]{16,128}):(manifest|generation:[^:]+:chunk:\d+)$/u)
      if (match) scheduler.requestRun(match[1], 'browser-sync-area-changed')
    }
  })
  browser.alarms.onAlarm.addListener((alarm) => scheduler.handleAlarm(alarm.name))
  browser.runtime.onStartup.addListener(() => {
    // The coordinator re-reads persistent outbox and replica facts. It does
    // not rely on content scripts remaining alive across restarts.
    void browser.storage.sync.get(null).then((values) => {
      Object.keys(values).forEach((key) => {
        const match = key.match(/^folders:v3:([A-Za-z0-9_-]{16,128}):(manifest|generation:[^:]+:chunk:\d+)$/u)
        if (match) scheduler.requestRun(match[1], 'background-resume')
      })
    })
    void schedulePersistedFolderSyncWork(scheduler)
  })
}
