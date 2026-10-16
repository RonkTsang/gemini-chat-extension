import { browser } from 'wxt/browser'
import { sleep } from '@/utils/async'
import { isGeminiSettingsUrl, readSettingsEntryStatus, writeSettingsEntryStatus } from '@/services/settingsEntryStatus'
import {
  isSettingsOpenFromPopupMessage, SETTINGS_OPEN_PANEL_MESSAGE,
  type SettingsOpenFromPopupMessage, type SettingsEntryStartResult,
  type SettingsEntryStatus, type SettingsEntryError,
} from '@/types/runtime-messages'

const OPEN_TIMEOUT_MS = 10_000
let inFlight: { deadline: number } | undefined

class EntryFailure extends Error {
  constructor(readonly reason: SettingsEntryError) { super(reason) }
}
async function withinDeadline<T>(operation: Promise<T>, deadline: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new EntryFailure('timeout')), Math.max(0, deadline - Date.now()))
      }),
    ])
  } finally { clearTimeout(timer) }
}

async function reloadGeminiTab(tabId: number, deadline: number): Promise<void> {
  let loading = false
  let complete!: () => void
  const reloaded = new Promise<void>(resolve => { complete = resolve })
  const listener: Parameters<typeof browser.tabs.onUpdated.addListener>[0] = (id, change) => {
    if (id !== tabId) return
    if (change.status === 'loading') loading = true
    if (loading && change.status === 'complete') complete()
  }
  // Subscribe before reload; its promise only confirms that navigation started.
  browser.tabs.onUpdated.addListener(listener)
  try {
    await withinDeadline(browser.tabs.reload(tabId), deadline)
    await withinDeadline(reloaded, deadline)
  } finally {
    browser.tabs.onUpdated.removeListener(listener)
  }
}

export function startSettingsEntryBackground(): void {
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!isSettingsOpenFromPopupMessage(message)
      || sender.id !== browser.runtime.id
      || sender.tab
      || sender.url?.split('?')[0] !== browser.runtime.getURL('/popup.html')) return
    void startSettingsEntry(message).then(sendResponse)
    return true
  })
}

export async function startSettingsEntry(message: SettingsOpenFromPopupMessage): Promise<SettingsEntryStartResult> {
  if (inFlight && inFlight.deadline > Date.now()) return { accepted: false, error: 'busy' }
  const operation = { deadline: Date.now() + OPEN_TIMEOUT_MS }
  inFlight = operation
  const { deadline } = operation
  let status: SettingsEntryStatus = { sourceTabId: message.tabId, phase: 'opening', expiresAt: deadline }
  const finish = async (phase: 'opened' | 'failed', error?: SettingsEntryError) => {
    if (inFlight !== operation) return
    await writeSettingsEntryStatus({ ...status, phase, error, expiresAt: Date.now() + 60_000 })
  }
  try {
    const source = await withinDeadline(browser.tabs.get(message.tabId), deadline)
    const [active] = await withinDeadline(browser.tabs.query({ active: true, windowId: source.windowId }), deadline)
    let target = source
    let reuseTarget = false
    if (message.action === 'open') {
      if (active?.id !== source.id) throw new EntryFailure('start-failed')
    } else {
      const previous = await withinDeadline(readSettingsEntryStatus(), deadline)
      if (!previous || previous.phase !== 'failed'
        || (active?.id !== previous.sourceTabId && active?.id !== previous.targetTabId)) throw new EntryFailure('start-failed')
      if (message.action === 'reload') {
        if (previous.targetTabId !== source.id || !isGeminiSettingsUrl(source.pendingUrl || source.url)) throw new EntryFailure('start-failed')
        reuseTarget = true
      } else {
        if (active?.id !== source.id) throw new EntryFailure('start-failed')
        if (previous.targetTabId !== undefined) {
          try {
            const existing = await withinDeadline(browser.tabs.get(previous.targetTabId), deadline)
            const destination = existing.pendingUrl || existing.url
            if (existing.windowId === source.windowId && (!destination || isGeminiSettingsUrl(destination))) {
              target = existing
              reuseTarget = true
            }
          } catch (error) {
            if (error instanceof EntryFailure) throw error
            // A closed Gemini tab is recreated by the normal opening path.
          }
        }
      }
      status.sourceTabId = active.id!
    }
    await withinDeadline(writeSettingsEntryStatus(status), deadline)
    void (async () => {
      try {
        if (!reuseTarget && !isGeminiSettingsUrl(source.pendingUrl || source.url)) {
          target = await withinDeadline(browser.tabs.create({ url: 'https://gemini.google.com/app', active: true, windowId: source.windowId }), deadline)
        }
        if (target.id === undefined) throw new EntryFailure('start-failed')
        status = { ...status, targetTabId: target.id }
        await withinDeadline(writeSettingsEntryStatus(status), deadline)
        if (message.action === 'reload') await reloadGeminiTab(target.id, deadline)
        while (Date.now() < deadline && inFlight === operation) {
          let current
          try { current = await withinDeadline(browser.tabs.get(target.id), deadline) }
          catch (error) {
            if (error instanceof EntryFailure) throw error
            throw new EntryFailure('target-closed')
          }
          const destination = current.pendingUrl || current.url
          if (destination && !isGeminiSettingsUrl(destination)) throw new EntryFailure('target-left')
          // URL visibility and content-script readiness have separate permission checks.
          // Attempt the known target even when its URL is hidden.
          try {
            const reply: unknown = await withinDeadline(browser.tabs.sendMessage(target.id, {
              type: SETTINGS_OPEN_PANEL_MESSAGE, expiresAt: deadline,
            }, { frameId: 0 }), Math.min(deadline, Date.now() + 1000))
            if (reply && typeof reply === 'object' && 'opened' in reply && reply.opened === true && Date.now() < deadline) {
              await finish('opened')
              return
            }
          } catch { /* Missing receivers and individual timeouts are retried until the deadline. */ }
          if (Date.now() >= deadline) break
          await sleep(Math.min(800, deadline - Date.now()))
        }
        await finish('failed', 'timeout')
      } catch (error) {
        await finish('failed', error instanceof EntryFailure ? error.reason : 'start-failed')
      } finally {
        if (inFlight === operation) inFlight = undefined
      }
    })().catch(error => console.error('[SettingsEntry] Failed to save result:', error))
    return { accepted: true }
  } catch (error) {
    try { await finish('failed', error instanceof EntryFailure ? error.reason : 'start-failed') }
    catch (storageError) { console.error('[SettingsEntry] Failed to save start failure:', storageError) }
    finally { if (inFlight === operation) inFlight = undefined }
    return { accepted: false, error: 'start-failed' }
  }
}
