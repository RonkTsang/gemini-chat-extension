/**
 * Local Dexie Data Source
 * 封装对 IndexedDB 的 CRUD 操作
 */

import { db, type ChainPromptRow } from '../db'

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
}

export const localDexieDataSource = new LocalDexieDataSource()


