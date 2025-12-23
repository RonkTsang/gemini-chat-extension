/**
 * IndexedDB Database Setup using Dexie
 * Unified extension database, supports multiple business tables
 */

import Dexie, { type Table } from 'dexie'

import type { QuickFollowIconKey } from '@/domain/quick-follow/iconKeys'

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

export class GeminiExtensionDB extends Dexie {
  chain_prompts!: Table<ChainPromptRow, string>
  quick_follow_prompts!: Table<QuickFollowPromptRow, string>
  quick_follow_settings!: Table<QuickFollowSettingsRow, string>

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
  }
}

export const db = new GeminiExtensionDB()


