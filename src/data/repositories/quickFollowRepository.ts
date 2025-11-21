import { nanoid } from 'nanoid'
import { z } from 'zod'

import {
  QUICK_FOLLOW_PLACEHOLDER,
  type QuickFollowPrompt,
  type QuickFollowPromptCreateInput,
  type QuickFollowPromptUpdateInput,
  type QuickFollowSettings,
  type QuickFollowSettingsUpdateInput
} from '@/domain/quick-follow/types'
import {
  QUICK_FOLLOW_ICON_KEYS,
  type QuickFollowIconKey
} from '@/domain/quick-follow/iconKeys'
import { browser } from 'wxt/browser'

import {
  type QuickFollowPromptRow,
  type QuickFollowSettingsRow
} from '../db'
import { localDexieDataSource } from '../sources'

const IconKeySchema = z.enum(QUICK_FOLLOW_ICON_KEYS as [QuickFollowIconKey, ...QuickFollowIconKey[]])

const PromptTemplateSchema = z
  .string()
  .min(1, 'template cannot be empty')
  .refine(value => value.includes(QUICK_FOLLOW_PLACEHOLDER), {
    message: `template must contain ${QUICK_FOLLOW_PLACEHOLDER}`
  })

const PromptBaseSchema = z.object({
  name: z
    .string()
    .max(120)
    .optional()
    .transform(value => (value?.trim() ? value.trim() : undefined)),
  template: PromptTemplateSchema,
  iconKey: IconKeySchema,
  enabled: z.boolean().optional()
})

const PromptUpdateSchema = PromptBaseSchema.partial()

type PromptBaseInput = z.infer<typeof PromptBaseSchema>

function pruneUndefinedKeys<T extends Record<string, unknown>>(input: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined)
  ) as Partial<T>
}

function rowToDomain(row: QuickFollowPromptRow): QuickFollowPrompt {
  return {
    id: row.id,
    name: row.name,
    template: row.template,
    iconKey: row.iconKey,
    enabled: row.enabled,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }
}

function domainToRow(prompt: QuickFollowPrompt): QuickFollowPromptRow {
  return {
    id: prompt.id,
    name: prompt.name,
    template: prompt.template,
    iconKey: prompt.iconKey,
    enabled: prompt.enabled,
    createdAt: prompt.createdAt,
    updatedAt: prompt.updatedAt
  }
}

function settingsRowToDomain(row: QuickFollowSettingsRow): QuickFollowSettings {
  return {
    orderedIds: row.orderedIds,
    enabled: row.enabled
  }
}

function ensureSettingsRow(row?: QuickFollowSettingsRow): QuickFollowSettingsRow {
  if (!row) {
    return {
      id: 'default',
      orderedIds: [],
      enabled: true
    }
  }

  return {
    id: 'default',
    orderedIds: row.orderedIds ?? [],
    enabled: row.enabled ?? true
  }
}

export interface IQuickFollowRepository {
  list(): Promise<QuickFollowPrompt[]>
  getById(id: string): Promise<QuickFollowPrompt | undefined>
  create(data: QuickFollowPromptCreateInput): Promise<QuickFollowPrompt>
  update(id: string, patch: QuickFollowPromptUpdateInput): Promise<QuickFollowPrompt>
  delete(id: string): Promise<void>
  reorder(idsInOrder: string[]): Promise<QuickFollowPrompt[]>
  getSettings(): Promise<QuickFollowSettings>
  updateSettings(patch: QuickFollowSettingsUpdateInput): Promise<QuickFollowSettings>
  setEnabled(enabled: boolean): Promise<QuickFollowSettings>
}

class QuickFollowRepository implements IQuickFollowRepository {
  async list(): Promise<QuickFollowPrompt[]> {
    const [rows, settingsRow] = await Promise.all([
      localDexieDataSource.getAllQuickFollowPrompts(),
      localDexieDataSource.getQuickFollowSettings()
    ])

    const settings = ensureSettingsRow(settingsRow)
    const prompts = rows.map(rowToDomain)
    const orderMap = new Map(settings.orderedIds.map((id, index) => [id, index]))

    return prompts
      .slice()
      .sort((a, b) => {
        const orderA = orderMap.get(a.id)
        const orderB = orderMap.get(b.id)

        if (orderA === undefined && orderB === undefined) {
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        }
        if (orderA === undefined) return 1
        if (orderB === undefined) return -1
        return orderA - orderB
      })
  }

  async getById(id: string): Promise<QuickFollowPrompt | undefined> {
    const row = await localDexieDataSource.getQuickFollowPromptById(id)
    return row ? rowToDomain(row) : undefined
  }

  async create(data: QuickFollowPromptCreateInput): Promise<QuickFollowPrompt> {
    const payload = this.parsePromptInput(data)
    const now = new Date().toISOString()
    const prompt: QuickFollowPrompt = {
      id: nanoid(),
      name: payload.name,
      template: payload.template,
      iconKey: payload.iconKey,
      enabled: payload.enabled ?? true,
      createdAt: now,
      updatedAt: now
    }

    const row = domainToRow(prompt)
    await localDexieDataSource.createQuickFollowPrompt(row)

    const settingsRow = ensureSettingsRow(await localDexieDataSource.getQuickFollowSettings())
    await localDexieDataSource.updateQuickFollowSettings({
      orderedIds: [...settingsRow.orderedIds.filter(id => id !== prompt.id), prompt.id]
    })

    return prompt
  }

  async update(id: string, patch: QuickFollowPromptUpdateInput): Promise<QuickFollowPrompt> {
    const existing = await this.getById(id)
    if (!existing) {
      throw new Error('Quick follow prompt not found')
    }

    const parsed = this.parsePromptUpdate(patch)
    const updated: QuickFollowPrompt = {
      ...existing,
      ...parsed,
      updatedAt: new Date().toISOString()
    }

    await localDexieDataSource.updateQuickFollowPrompt(id, {
      ...domainToRow(updated)
    })

    return updated
  }

  async delete(id: string): Promise<void> {
    await localDexieDataSource.deleteQuickFollowPrompt(id)

    const settingsRow = ensureSettingsRow(await localDexieDataSource.getQuickFollowSettings())
    await localDexieDataSource.updateQuickFollowSettings({
      orderedIds: settingsRow.orderedIds.filter(existingId => existingId !== id)
    })
  }

  async reorder(idsInOrder: string[]): Promise<QuickFollowPrompt[]> {
    const rows = await localDexieDataSource.getAllQuickFollowPrompts()
    const existingIds = new Set(rows.map(row => row.id))

    const deduped = idsInOrder.filter((id, index, arr) => arr.indexOf(id) === index && existingIds.has(id))
    const missing = [...existingIds].filter(id => !deduped.includes(id))
    const mergedOrder = [...deduped, ...missing]

    await localDexieDataSource.updateQuickFollowSettings({ orderedIds: mergedOrder })
    return this.list()
  }

  async getSettings(): Promise<QuickFollowSettings> {
    const settingsRow = ensureSettingsRow(await localDexieDataSource.getQuickFollowSettings())
    return settingsRowToDomain(settingsRow)
  }

  async updateSettings(patch: QuickFollowSettingsUpdateInput): Promise<QuickFollowSettings> {
    const parsed = QuickFollowSettingsSchema.parse(patch)
    const settingsRow = await localDexieDataSource.updateQuickFollowSettings(parsed)
    return settingsRowToDomain(settingsRow)
  }

  async setEnabled(enabled: boolean): Promise<QuickFollowSettings> {
    const settingsRow = await localDexieDataSource.updateQuickFollowSettings({ enabled })
    try {
      await browser.storage.sync.set({ enableQuickQuote: enabled })
    } catch (error) {
      console.error('Failed to sync quick follow toggle to storage:', error)
    }
    return settingsRowToDomain(settingsRow)
  }

  private parsePromptInput(data: QuickFollowPromptCreateInput): PromptBaseInput {
    return PromptBaseSchema.parse(data)
  }

  private parsePromptUpdate(data: QuickFollowPromptUpdateInput): QuickFollowPromptUpdateInput {
    const parsed = PromptUpdateSchema.parse(data)
    return pruneUndefinedKeys(parsed) as QuickFollowPromptUpdateInput
  }
}

const QuickFollowSettingsSchema = z.object({
  orderedIds: z.array(z.string()).optional(),
  enabled: z.boolean().optional()
})

export const quickFollowRepository = new QuickFollowRepository()

