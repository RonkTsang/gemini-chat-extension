import { folderSyncKeyScope } from '@/services/folder-sync/providers/browser-sync'
import { nanoid } from 'nanoid'
import { browser } from 'wxt/browser'

import { createFolderRpcHandler } from './rpc-handler'
import { createFolderAccountHistoryHandler } from './account-history'
import { folderRepository } from '@/data/repositories/folderRepository'
import { FolderRecoveryRunner } from '@/services/folder-recovery/runner'
import { FolderSyncCoordinator } from '@/services/folder-sync/coordinator'
import { FolderSyncScheduler } from '@/services/folder-sync/scheduler'
import { logDevError, logDevEvent } from '@/utils/devLogger'
import { pruneRecoveryHistory } from '@/services/folder-recovery/storage'

let started = false

async function schedulePersistedFolderSyncWork(scheduler: FolderSyncScheduler): Promise<void> {
  const scopes = await folderRepository.listBrowserSyncWakeScopes()
  scopes.forEach((accountScopeId) => scheduler.requestRun(accountScopeId, 'background-resume'))
}

export function createFolderSyncResume(scheduler: FolderSyncScheduler, recover: () => void): () => Promise<void> {
  let resumeTask: Promise<void> | undefined
  return () => {
    if (resumeTask) return resumeTask
    // Either source can fail independently. The coordinator re-reads the current
    // replica rather than trusting this discovery scan.
    resumeTask = Promise.allSettled([
      browser.storage.sync.get(null).then((values) => {
        const scopes = new Set(Object.keys(values).map(folderSyncKeyScope).filter((scope): scope is string => !!scope))
        logDevEvent('debug', '[Folders][sync]', 'browser-sync.startup.discovered', { accountCount: scopes.size })
        scopes.forEach((scope) => scheduler.requestRun(scope, 'background-resume'))
      }).catch((error) => logDevError('[Folders]', 'sync.replica-resume-failed', error)),
      schedulePersistedFolderSyncWork(scheduler).catch((error) => logDevError('[Folders]', 'sync.resume-failed', error)),
    ]).then(() => undefined).finally(() => { resumeTask = undefined })
    recover()
    return resumeTask
  }
}

export function startFoldersBackground(): void {
  if (started) return
  started = true
  const recovery = new FolderRecoveryRunner()
  const scheduler = new FolderSyncScheduler(new FolderSyncCoordinator(undefined, undefined, (scope) => recovery.requestRun(scope)))
  browser.runtime.onMessage.addListener(createFolderRpcHandler(scheduler, recovery))
  browser.runtime.onMessage.addListener(createFolderAccountHistoryHandler())
  browser.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'sync') return
    const storageEventId = import.meta.env.DEV ? nanoid() : undefined
    logDevEvent('debug', '[Folders][sync]', 'browser-sync.storage.changed', () => ({
      storageEventId,
      areaName,
      changedKeyCount: Object.keys(changes).length,
      changes: Object.entries(changes).map(([key, change]) => ({
        key,
        hadOldValue: Object.hasOwn(change, 'oldValue'),
        hasNewValue: Object.hasOwn(change, 'newValue'),
      })),
    }))
    scheduler.requestStorageChanges(changes, storageEventId)
  })
  browser.alarms.onAlarm.addListener((alarm) => scheduler.handleAlarm(alarm.name))
  // Listeners are ready before the first asynchronous discovery begins.
  const resume = createFolderSyncResume(scheduler, () => recovery.requestRun())
  browser.runtime.onStartup.addListener(resume)
  void pruneRecoveryHistory().catch((error) => logDevError('[Folders]', 'recovery.history-prune-failed', error))
  resume()
}
