import 'fake-indexeddb/auto'
import { vi } from 'vitest'

const storage = vi.hoisted(() => ({
  values: new Map<string, unknown>(),
  quotaBytes: 100 * 1024, perItemBytes: 8192, maxItems: 512,
  failAfterItems: undefined as number | undefined,
  onSet: undefined as (() => Promise<void>) | undefined,
  onChanged: undefined as ((changes: Record<string, unknown>) => void) | undefined,
  startup: undefined as (() => void) | undefined,
}))

vi.mock('wxt/browser', () => ({ browser: {
  runtime: { onMessage: { addListener: vi.fn() }, onStartup: { addListener: vi.fn((listener: () => void) => { storage.startup = listener }) } },
  permissions: { contains: vi.fn(async () => true) },
  storage: {
    onChanged: { addListener: vi.fn((listener: (changes: Record<string, unknown>, area: string) => void) => {
      storage.onChanged = (changes) => listener(changes, 'sync')
    }) },
    local: { get: vi.fn(async () => ({ 'gpk.folders.device-id.v1': 'test-device' })), set: vi.fn() },
    sync: {
      get: vi.fn(async (keys: string | string[] | null) => keys === null ? Object.fromEntries(storage.values)
        : Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map((key) => [key, storage.values.get(key)]))),
      set: vi.fn(async (entries: Record<string, unknown>) => {
        if (storage.onSet) await storage.onSet()
        const projected = new Map(storage.values)
        Object.entries(entries).forEach(([key, value]) => projected.set(key, value))
        const bytes = (key: string, value: unknown) => new TextEncoder().encode(key + JSON.stringify(value)).byteLength
        if (projected.size > storage.maxItems || [...projected].reduce((total, [key, value]) => total + bytes(key, value), 0) > storage.quotaBytes
          || Object.entries(entries).some(([key, value]) => bytes(key, value) > storage.perItemBytes)) throw new Error('Browser quota exceeded')
        let count = 0
        for (const [key, value] of Object.entries(entries)) {
          if (storage.failAfterItems !== undefined && count >= storage.failAfterItems) throw new Error('Interrupted storage write')
          storage.values.set(key, structuredClone(value)); count += 1
          storage.onChanged?.({ [key]: { newValue: value } })
        }
      }),
      remove: vi.fn(async (keys: string[]) => {
        for (const key of keys) { const oldValue = storage.values.get(key); storage.values.delete(key); storage.onChanged?.({ [key]: { oldValue } }) }
      }),
      get QUOTA_BYTES() { return storage.quotaBytes },
      get QUOTA_BYTES_PER_ITEM() { return storage.perItemBytes },
      get MAX_ITEMS() { return storage.maxItems },
    },
  },
  alarms: { onAlarm: { addListener: vi.fn() }, clear: vi.fn(async () => true), create: vi.fn(async () => undefined), get: vi.fn(async () => undefined) },
} }))
vi.mock('@/entrypoints/background/folders/invalidation', () => ({ publishFolderInvalidation: vi.fn(async () => undefined) }))

export { storage }

import { db } from '@/data/db'
import { browser } from 'wxt/browser'
import { encodeLzStringBase64, sha256Hex } from './codec'
import { ROOT_FOLDER_ID, type FolderOrganizationData, type FolderSyncPublicationRow } from '@/domain/folder/types'

export const scopeA = 'account-scope-0001'
export const scopeB = 'account-scope-0002'
export const emptyData: FolderOrganizationData = { folders: [], memberships: [], chatReferences: [] }

export function data(name: string, id = 'folder-1'): FolderOrganizationData {
  return { folders: [{ id, parentFolderId: ROOT_FOLDER_ID, name, iconKey: 'folder', colorValue: 'neutral',
    orderKey: 'U'.repeat(32), createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }], memberships: [], chatReferences: [] }
}

export async function publication(id: string, organization = emptyData, accountScopeId = scopeA, baseSnapshotId?: string): Promise<FolderSyncPublicationRow> {
  const payload = encodeLzStringBase64(organization)
  return { accountScopeId, id, baseSnapshotId, dataRevision: `revision:${id}`, payload,
    payloadHash: await sha256Hex(payload), settings: { enabled: true, hideOrganizedChats: false }, createdAt: new Date().toISOString(), state: 'prepared' }
}

export async function resetStorage(): Promise<void> {
  vi.restoreAllMocks()
  // Spying on an existing vi.fn replaces its implementation in place.
  vi.mocked(browser.storage.sync.get).mockReset().mockImplementation(async (keys) => keys === null || keys === undefined
    ? Object.fromEntries(storage.values)
    : Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map((key) => [key, storage.values.get(key as string)])))
  storage.values.clear(); storage.quotaBytes = 100 * 1024; storage.perItemBytes = 8192; storage.maxItems = 512
  storage.failAfterItems = undefined; storage.onSet = undefined; storage.onChanged = undefined
  storage.startup = undefined
  await Promise.all([db.folders, db.folder_memberships, db.folder_chat_references, db.folder_settings, db.folder_sync_states,
    db.folder_sync_publications, db.folder_sync_conflicts, db.folder_snapshots, db.folder_recovery_states, db.folder_coordinator_leases].map((table) => table.clear()))
}
