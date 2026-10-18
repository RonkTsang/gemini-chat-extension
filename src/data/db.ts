/**
 * IndexedDB Database Setup using Dexie
 * Unified extension database, supports multiple business tables
 */

import Dexie, { type Table } from 'dexie'

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

  constructor() {
    super('gemini_extension')
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
    // Folder has not shipped. Its schema is defined once, without protocol migrations.
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
  }
}

export const db = new GeminiExtensionDB()
