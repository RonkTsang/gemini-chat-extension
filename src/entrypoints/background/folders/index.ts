import { browser } from 'wxt/browser'

import { createFolderRpcHandler } from './rpc-handler'
import { FolderSyncScheduler } from '@/services/folder-sync/scheduler'

let started = false

export function startFoldersBackground(): void {
  if (started) return
  started = true
  const scheduler = new FolderSyncScheduler()
  browser.runtime.onMessage.addListener(createFolderRpcHandler(scheduler))
  browser.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'sync') return
    for (const key of Object.keys(changes)) {
      const match = key.match(/^folders:([A-Za-z0-9_-]{16,128}):manifest$/u)
      if (match) scheduler.requestRun(match[1], 'browser-sync-area-changed')
    }
  })
  browser.alarms.onAlarm.addListener((alarm) => scheduler.handleAlarm(alarm.name))
  browser.runtime.onStartup.addListener(() => {
    // The coordinator re-reads persistent outbox and replica facts. It does
    // not rely on content scripts remaining alive across restarts.
    void browser.storage.sync.get(null).then((values) => {
      Object.keys(values).forEach((key) => {
        const match = key.match(/^folders:([A-Za-z0-9_-]{16,128}):manifest$/u)
        if (match) scheduler.requestRun(match[1], 'background-resume')
      })
    })
  })
}
