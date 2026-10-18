/**
 * IndexedDB Database Setup using Dexie
 * Unified extension database, supports multiple business tables
 */

import Dexie, { type Table } from 'dexie'
import { folderAccessMiddleware } from './folder-access'
import { folderNameKey, membershipDisplayOrderKey } from '@/domain/folder/local-indexes'
import { rebuildFolderSummary, type FolderOrganizationSummaryRow } from './folder-summary'

import type { GemAvatarAssetRow } from '@/domain/gem-avatar/types'
import type { QuickFollowIconKey } from '@/domain/quick-follow/iconKeys'
import type { ThemeAssetRow } from '@/entrypoints/content/gemini-theme/background/types'
import type {
  ChatReferenceRow,
  FolderCoordinatorLeaseRow,
  FolderMembershipRow,
  FolderRow,
  FolderSettingsRow,
  FolderSnapshotRow,
  FolderRecoveryStateRow,
  FolderSyncStateRow,
  FolderSyncPublicationRow,
  FolderSyncConflictRow,
} from '@/domain/folder/types'

export interface QuickFollowPromptRow {
  id: string
  name?: string
  template: string
  iconKey: QuickFollowIconKey
  enabled: boolean
  createdAt: string
  updatedAt: string
}

export interface QuickFollowSettingsRow {
  id: 'default'
  orderedIds: string[]
  enabled: boolean
}

export interface ChainPromptRow {
  id: string
  name: string
  description?: string
  createdAt: string
  updatedAt: string
  variables: { key: string; defaultValue?: string }[]
  steps: { id: string; name?: string; prompt: string }[]
}

export interface NotificationAudioAssetRow {
  id: 'response-complete-notification'
  fileName: string
  mimeType: string
  size: number
  blob: Blob
  createdAt: string
  updatedAt: string
}

export class GeminiExtensionDB extends Dexie {
  chain_prompts!: Table<ChainPromptRow, string>
  quick_follow_prompts!: Table<QuickFollowPromptRow, string>
  quick_follow_settings!: Table<QuickFollowSettingsRow, string>
  theme_assets!: Table<ThemeAssetRow, string>
  notification_audio_assets!: Table<NotificationAudioAssetRow, string>
  gem_avatar_assets!: Table<GemAvatarAssetRow, string>
  folders!: Table<FolderRow, string>
  folder_memberships!: Table<FolderMembershipRow, string>
  folder_chat_references!: Table<ChatReferenceRow, [string, string]>
  folder_settings!: Table<FolderSettingsRow, string>
  folder_sync_states!: Table<FolderSyncStateRow, string>
  folder_sync_publications!: Table<FolderSyncPublicationRow, string>
  folder_sync_conflicts!: Table<FolderSyncConflictRow, string>
  folder_snapshots!: Table<FolderSnapshotRow, string>
  folder_recovery_states!: Table<FolderRecoveryStateRow, string>
  folder_coordinator_leases!: Table<FolderCoordinatorLeaseRow, string>
  folder_organization_summaries!: Table<FolderOrganizationSummaryRow, string>

  constructor() {
    super('gemini_extension')
    if (import.meta.env.DEV) this.use(folderAccessMiddleware)
    this.version(1).stores({
      chain_prompts: 'id, name, createdAt, updatedAt'
    })
    this.version(2)
      .stores({
        chain_prompts: 'id, name, createdAt, updatedAt',
        quick_follow_prompts: 'id, updatedAt',
        quick_follow_settings: 'id'
      })
      .upgrade(() => {
        // no-op: existing installations do not require data migration
      })
    this.version(3)
      .stores({
        chain_prompts: 'id, name, createdAt, updatedAt',
        quick_follow_prompts: 'id, updatedAt',
        quick_follow_settings: 'id',
        theme_assets: 'id, feature, updatedAt'
      })
      .upgrade(() => {
        // no-op: existing installations do not require data migration
      })
    this.version(4)
      .stores({
        chain_prompts: 'id, name, createdAt, updatedAt',
        quick_follow_prompts: 'id, updatedAt',
        quick_follow_settings: 'id',
        theme_assets: 'id, feature, updatedAt',
        notification_audio_assets: 'id, updatedAt'
      })
      .upgrade(() => {
        // no-op: existing installations do not require data migration
      })
    this.version(5)
      .stores({
        chain_prompts: 'id, name, createdAt, updatedAt',
        quick_follow_prompts: 'id, updatedAt',
        quick_follow_settings: 'id',
        theme_assets: 'id, feature, updatedAt',
        notification_audio_assets: 'id, updatedAt',
        gem_avatar_assets: 'gemId, updatedAt'
      })
      .upgrade(() => {
        // no-op: existing installations do not require data migration
      })
    // Retain v13 so existing development databases upgrade without data loss.
    this.version(13).stores({
      folders: 'id, accountScopeId, [accountScopeId+parentFolderId], [accountScopeId+parentFolderId+orderKey]',
      folder_memberships: 'id, accountScopeId, [accountScopeId+folderId], [accountScopeId+folderId+orderKey], [accountScopeId+chatId], &[accountScopeId+folderId+chatId]',
      folder_chat_references: '[accountScopeId+chatId], accountScopeId, updatedAt',
      folder_settings: 'accountScopeId, updatedAt',
      folder_sync_states: 'accountScopeId, updatedAt',
      folder_sync_publications: 'accountScopeId',
      folder_sync_conflicts: 'accountScopeId',
      folder_snapshots: 'id, accountScopeId, [accountScopeId+createdAt]',
      folder_coordinator_leases: 'accountScopeId, expiresAt',
      folder_recovery_states: 'accountScopeId, updatedAt',
    })
    this.version(14).stores({
      folders: 'id, accountScopeId, [accountScopeId+nameKey], [accountScopeId+parentFolderId], [accountScopeId+parentFolderId+orderKey], [accountScopeId+parentFolderId+orderKey+id]',
      folder_memberships: 'id, accountScopeId, [accountScopeId+folderId], [accountScopeId+folderId+orderKey], [accountScopeId+folderId+orderKey+id], [accountScopeId+folderId+displayOrderKey+id], [accountScopeId+chatId], &[accountScopeId+folderId+chatId]',
      folder_organization_summaries: 'accountScopeId',
      folder_chat_usage: '[accountScopeId+chatId], accountScopeId',
    }).upgrade(async (transaction) => {
      await transaction.table<FolderRow>('folders').toCollection().modify((row) => { row.nameKey = folderNameKey(row.name) })
      await transaction.table<FolderMembershipRow>('folder_memberships').toCollection().modify((row) => { row.displayOrderKey = membershipDisplayOrderKey(row) })
      for (const conflict of await transaction.table<FolderSyncConflictRow>('folder_sync_conflicts').toArray()) {
        await transaction.table('folder_sync_states').update(conflict.accountScopeId, {
          conflictSummary: { snapshotId: conflict.manifest.snapshotId, localRevision: conflict.localRevision },
        })
      }
    })
    this.version(15).stores({
      folders: 'id, accountScopeId, [accountScopeId+nameKey], [accountScopeId+parentFolderId], [accountScopeId+parentFolderId+orderKey+id]',
      folder_memberships: 'id, accountScopeId, [accountScopeId+folderId], [accountScopeId+folderId+orderKey+id], [accountScopeId+folderId+displayOrderKey+id], [accountScopeId+chatId], [accountScopeId+chatId+folderId], &[accountScopeId+folderId+chatId]',
      folder_chat_usage: null,
    }).upgrade(async (transaction) => {
      const folders = await transaction.table<FolderRow>('folders').toArray()
      const memberships = await transaction.table<FolderMembershipRow>('folder_memberships').toArray()
      const scopes = new Set([...folders, ...memberships].map((row) => row.accountScopeId))
      await transaction.table('folder_organization_summaries').clear()
      for (const accountScopeId of scopes) {
        await rebuildFolderSummary(transaction, { accountScopeId, folders: folders.filter((row) => row.accountScopeId === accountScopeId),
          memberships: memberships.filter((row) => row.accountScopeId === accountScopeId), chatReferences: [] })
      }
    })
  }
}

export const db = new GeminiExtensionDB()
