/**
 * Local Dexie Data Source
 * Encapsulates CRUD operations for IndexedDB
 */

import {
  db,
  type ChainPromptRow,
  type QuickFollowPromptRow,
  type QuickFollowSettingsRow
} from '../db'

export class LocalDexieDataSource {
  async getAllChainPrompts(): Promise<ChainPromptRow[]> {
    return await db.chain_prompts.toArray()
  }

  async getChainPromptById(id: string): Promise<ChainPromptRow | undefined> {
    return await db.chain_prompts.get(id)
  }

  async createChainPrompt(data: ChainPromptRow): Promise<ChainPromptRow> {
    await db.chain_prompts.add(data)
    return data
  }

  async updateChainPrompt(id: string, data: Partial<ChainPromptRow>): Promise<ChainPromptRow | undefined> {
    await db.chain_prompts.update(id, data)
    return await this.getChainPromptById(id)
  }

  async deleteChainPrompt(id: string): Promise<void> {
    await db.chain_prompts.delete(id)
  }

  async searchChainPrompts(query: string): Promise<ChainPromptRow[]> {
    const lowerQuery = query.toLowerCase()
    return await db.chain_prompts
      .filter(prompt => 
        prompt.name.toLowerCase().includes(lowerQuery) ||
        (prompt.description?.toLowerCase().includes(lowerQuery) ?? false)
      )
      .toArray()
  }

  async getAllQuickFollowPrompts(): Promise<QuickFollowPromptRow[]> {
    return await db.quick_follow_prompts.toArray()
  }

  async getQuickFollowPromptById(id: string): Promise<QuickFollowPromptRow | undefined> {
    return await db.quick_follow_prompts.get(id)
  }

  async createQuickFollowPrompt(data: QuickFollowPromptRow): Promise<QuickFollowPromptRow> {
    await db.quick_follow_prompts.add(data)
    return data
  }

  async updateQuickFollowPrompt(
    id: string,
    patch: Partial<QuickFollowPromptRow>
  ): Promise<QuickFollowPromptRow | undefined> {
    await db.quick_follow_prompts.update(id, patch)
    return await this.getQuickFollowPromptById(id)
  }

  async deleteQuickFollowPrompt(id: string): Promise<void> {
    await db.quick_follow_prompts.delete(id)
  }

  async getQuickFollowSettings(): Promise<QuickFollowSettingsRow | undefined> {
    const row = await db.quick_follow_settings.get('default')
    if (!row) {
      return undefined
    }
    return {
      id: 'default',
      orderedIds: row.orderedIds ?? [],
      enabled: row.enabled ?? true
    }
  }

  async updateQuickFollowSettings(
    patch: Partial<QuickFollowSettingsRow>
  ): Promise<QuickFollowSettingsRow> {
    const current = (await this.getQuickFollowSettings()) ?? {
      id: 'default',
      orderedIds: [],
      enabled: true
    }
    const next: QuickFollowSettingsRow = {
      ...current,
      ...patch,
      id: 'default',
      orderedIds: patch.orderedIds ?? current.orderedIds,
      enabled: patch.enabled ?? current.enabled
    }
    await db.quick_follow_settings.put(next)
    return next
  }
}

export const localDexieDataSource = new LocalDexieDataSource()


