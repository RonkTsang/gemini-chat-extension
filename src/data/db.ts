/**
 * IndexedDB Database Setup using Dexie
 * 统一的扩展数据库，支持多业务表
 */

import Dexie, { type Table } from 'dexie'

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

  constructor() {
    super('gemini_extension')
    this.version(1).stores({
      chain_prompts: 'id, name, createdAt, updatedAt'
    })
  }
}

export const db = new GeminiExtensionDB()


