/**
 * Chain Prompt Repository
 * 业务层数据访问接口，负责领域模型转换、ID生成、时间戳维护
 */

import { nanoid } from 'nanoid'
import { z } from 'zod'
import type { ChainPrompt, ChainVariable, ChainStep } from '@/domain/chain-prompt/types'
import { localDexieDataSource } from '../sources'
import type { ChainPromptRow } from '../db'

// Zod 校验 Schema
const ChainVariableSchema = z.object({
  key: z.string().min(1),
  defaultValue: z.string().optional()
})

const ChainStepSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  prompt: z.string().min(1)
})

const ChainPromptSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  variables: z.array(ChainVariableSchema),
  steps: z.array(ChainStepSchema).min(1)
})

// Row ↔ Domain 转换
function rowToDomain(row: ChainPromptRow): ChainPrompt {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    variables: row.variables,
    steps: row.steps
  }
}

function domainToRow(domain: ChainPrompt): ChainPromptRow {
  return {
    id: domain.id,
    name: domain.name,
    description: domain.description,
    createdAt: domain.createdAt,
    updatedAt: domain.updatedAt,
    variables: domain.variables,
    steps: domain.steps
  }
}

export interface IChainPromptRepository {
  list(params?: { search?: string }): Promise<ChainPrompt[]>
  getById(id: string): Promise<ChainPrompt | undefined>
  create(data: Omit<ChainPrompt, 'id' | 'createdAt' | 'updatedAt'>): Promise<ChainPrompt>
  update(id: string, patch: Partial<Omit<ChainPrompt, 'id' | 'createdAt'>>): Promise<ChainPrompt>
  duplicate(id: string): Promise<ChainPrompt>
  delete(id: string): Promise<void>
}

class ChainPromptRepository implements IChainPromptRepository {
  async list(params?: { search?: string }): Promise<ChainPrompt[]> {
    try {
      let rows: ChainPromptRow[]
      
      if (params?.search) {
        rows = await localDexieDataSource.searchChainPrompts(params.search)
      } else {
        rows = await localDexieDataSource.getAllChainPrompts()
      }
      
      // 按更新时间倒序排列
      return rows
        .map(rowToDomain)
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    } catch (error) {
      console.error('Failed to list chain prompts:', error)
      throw new Error('Failed to list chain prompts')
    }
  }

  async getById(id: string): Promise<ChainPrompt | undefined> {
    try {
      const row = await localDexieDataSource.getChainPromptById(id)
      return row ? rowToDomain(row) : undefined
    } catch (error) {
      console.error(`Failed to get chain prompt ${id}:`, error)
      throw new Error('Failed to get chain prompt')
    }
  }

  async create(data: Omit<ChainPrompt, 'id' | 'createdAt' | 'updatedAt'>): Promise<ChainPrompt> {
    try {
      // 校验
      ChainPromptSchema.parse(data)
      
      const now = new Date().toISOString()
      const chainPrompt: ChainPrompt = {
        id: nanoid(),
        ...data,
        createdAt: now,
        updatedAt: now
      }
      
      const row = domainToRow(chainPrompt)
      await localDexieDataSource.createChainPrompt(row)
      
      return chainPrompt
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error('Validation error:', error.issues)
        throw new Error('Invalid chain prompt data')
      }
      console.error('Failed to create chain prompt:', error)
      throw new Error('Failed to create chain prompt')
    }
  }

  async update(id: string, patch: Partial<Omit<ChainPrompt, 'id' | 'createdAt'>>): Promise<ChainPrompt> {
    try {
      const existing = await this.getById(id)
      if (!existing) {
        throw new Error('Chain prompt not found')
      }
      
      const updated: ChainPrompt = {
        ...existing,
        ...patch,
        updatedAt: new Date().toISOString()
      }
      
      // 校验更新后的数据
      ChainPromptSchema.parse({
        name: updated.name,
        description: updated.description,
        variables: updated.variables,
        steps: updated.steps
      })
      
      const row = domainToRow(updated)
      await localDexieDataSource.updateChainPrompt(id, row)
      
      return updated
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error('Validation error:', error.issues)
        throw new Error('Invalid chain prompt data')
      }
      console.error(`Failed to update chain prompt ${id}:`, error)
      throw new Error('Failed to update chain prompt')
    }
  }

  async duplicate(id: string): Promise<ChainPrompt> {
    try {
      const original = await this.getById(id)
      if (!original) {
        throw new Error('Chain prompt not found')
      }
      
      const duplicated = await this.create({
        name: `${original.name} Copy`,
        description: original.description,
        variables: [...original.variables],
        steps: original.steps.map(step => ({
          ...step,
          id: nanoid() // 生成新的 step ID
        }))
      })
      
      return duplicated
    } catch (error) {
      console.error(`Failed to duplicate chain prompt ${id}:`, error)
      throw new Error('Failed to duplicate chain prompt')
    }
  }

  async delete(id: string): Promise<void> {
    try {
      await localDexieDataSource.deleteChainPrompt(id)
    } catch (error) {
      console.error(`Failed to delete chain prompt ${id}:`, error)
      throw new Error('Failed to delete chain prompt')
    }
  }
}

export const chainPromptRepository = new ChainPromptRepository()


