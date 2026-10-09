import { browser } from 'wxt/browser'
import type { SettingsEntryStatus } from '@/types/runtime-messages'

export const SETTINGS_ENTRY_STATUS_KEY = 'settingsEntryStatus'
export function isSettingsEntryStatus(value: unknown): value is SettingsEntryStatus {
  if (!value || typeof value !== 'object') return false
  const status = value as Partial<SettingsEntryStatus>
  return Number.isInteger(status.sourceTabId) && (status.sourceTabId ?? -1) >= 0
    && (status.targetTabId === undefined || (Number.isInteger(status.targetTabId) && status.targetTabId >= 0))
    && ['opening', 'opened', 'failed'].includes(status.phase ?? '')
    && typeof status.expiresAt === 'number' && Number.isFinite(status.expiresAt)
    && (status.error === undefined || ['timeout', 'target-closed', 'target-left', 'start-failed'].includes(status.error))
}
export async function writeSettingsEntryStatus(status: SettingsEntryStatus): Promise<void> {
  await browser.storage.session.set({ [SETTINGS_ENTRY_STATUS_KEY]: status })
}
export async function readSettingsEntryStatus(): Promise<SettingsEntryStatus | null> {
  const stored = await browser.storage.session.get(SETTINGS_ENTRY_STATUS_KEY)
  const value = stored[SETTINGS_ENTRY_STATUS_KEY]
  if (isSettingsEntryStatus(value) && value.expiresAt > Date.now()) return value
  if (value !== undefined) await browser.storage.session.remove(SETTINGS_ENTRY_STATUS_KEY)
  return null
}
export function isGeminiSettingsUrl(value?: string): boolean {
  if (!value) return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.hostname === 'gemini.google.com'
  } catch { return false }
}
