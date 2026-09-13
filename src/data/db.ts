/**
 * IndexedDB Database Setup using Dexie
 * Unified extension database, supports multiple business tables
 */

import Dexie, { type Table } from 'dexie'

import type { GemAvatarAssetRow } from '@/domain/gem-avatar/types'
import type { QuickFollowIconKey } from '@/domain/quick-follow/iconKeys'
import {
  DEFAULT_FOLDER_COLOR_VALUE,
  DEFAULT_FOLDER_ICON_KEY,
  type FolderColorValue,
  type FolderIconKey,
  isFolderIconKey,
  normalizeFolderColorValue,
} from '@/domain/folder/appearance'
import type { ThemeAssetRow } from '@/entrypoints/content/gemini-theme/background/types'
import type {
  ChatReferenceRow,
  FolderCoordinatorLeaseRow,
  FolderMembershipRow,
  FolderOperationRow,
  FolderRow,
  FolderSettingsRow,
  FolderSnapshotRow,
  FolderSyncStateRow,
  FolderSyncGenerationRow,
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

interface LegacyFolderAppearanceRow {
  iconKey?: string
  colorKey?: string
  colorValue?: FolderColorValue
  fieldVersions?: Record<string, string>
}

const LEGACY_FOLDER_ICON_KEYS: Record<string, FolderIconKey> = {
  briefcase: 'work',
  heart: 'favorites',
  star: 'favorites',
}

const LEGACY_FOLDER_COLOR_KEYS: Record<string, FolderColorValue> = {
  amber: 'yellow',
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
  folder_operations!: Table<FolderOperationRow, string>
  folder_sync_states!: Table<FolderSyncStateRow, string>
  folder_sync_generations!: Table<FolderSyncGenerationRow, string>
  folder_snapshots!: Table<FolderSnapshotRow, string>
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
    this.version(6)
      .stores({
        chain_prompts: 'id, name, createdAt, updatedAt',
        quick_follow_prompts: 'id, updatedAt',
        quick_follow_settings: 'id',
        theme_assets: 'id, feature, updatedAt',
        notification_audio_assets: 'id, updatedAt',
        gem_avatar_assets: 'gemId, updatedAt',
        folders: 'id, accountScopeId, [accountScopeId+parentFolderId], [accountScopeId+deletedAt], [accountScopeId+parentFolderId+orderKey]',
        folder_memberships: 'id, accountScopeId, [accountScopeId+folderId], [accountScopeId+chatId], [accountScopeId+folderId+chatId], [accountScopeId+deletedAt]',
        folder_chat_references: '[accountScopeId+chatId], accountScopeId, updatedAt',
        folder_settings: 'accountScopeId, updatedAt',
        folder_operations: 'id, accountScopeId, [accountScopeId+createdAt]',
        folder_sync_states: 'accountScopeId, updatedAt',
        folder_snapshots: 'id, accountScopeId, [accountScopeId+createdAt]',
        folder_coordinator_leases: 'accountScopeId, expiresAt',
      })
      .upgrade(() => {
        // Folders is an additive schema; existing product tables remain untouched.
      })
    this.version(7)
      .stores({
        folder_memberships: 'id, accountScopeId, [accountScopeId+folderId], [accountScopeId+folderId+orderKey], [accountScopeId+chatId], &[accountScopeId+folderId+chatId], [accountScopeId+deletedAt]',
      })
      .upgrade(() => {
        // The compound unique key enforces one active relationship identity per
        // Folder/chat pair even when data arrives from an external provider.
      })
    this.version(8)
      .stores({})
      .upgrade(async (transaction) => {
        await transaction.table('folders').toCollection().modify((row: LegacyFolderAppearanceRow) => {
          const iconKey = row.iconKey ?? DEFAULT_FOLDER_ICON_KEY
          row.iconKey = isFolderIconKey(iconKey)
            ? iconKey
            : LEGACY_FOLDER_ICON_KEYS[iconKey] ?? DEFAULT_FOLDER_ICON_KEY

          const legacyColor = row.colorValue ?? row.colorKey ?? DEFAULT_FOLDER_COLOR_VALUE
          row.colorValue = normalizeFolderColorValue(legacyColor)
            ?? LEGACY_FOLDER_COLOR_KEYS[legacyColor]
            ?? DEFAULT_FOLDER_COLOR_VALUE

          if (row.fieldVersions && !row.fieldVersions.colorValue) {
            row.fieldVersions.colorValue = row.fieldVersions.colorKey ?? row.fieldVersions.iconKey
            delete row.fieldVersions.colorKey
          }
          delete row.colorKey
        })
      })
    this.version(9)
      .stores({
        folder_sync_generations: 'id, accountScopeId, [accountScopeId+dataRevision], [accountScopeId+createdAt], [accountScopeId+state]',
      })
      .upgrade(() => {
        // Folders has not shipped; this only adds the background-owned
        // generation table and intentionally does not import host-page data.
      })
  }
}

export const db = new GeminiExtensionDB()
