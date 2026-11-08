import { create } from 'zustand'

import {
  DEFAULT_QUICK_FOLLOW_TEMPLATE_FALLBACK,
  DEFAULT_QUICK_FOLLOW_TEMPLATE_KEY,
  DEFAULT_SELECTION_DISPLAY_MODE,
  QUICK_FOLLOW_PLACEHOLDER,
  type QuickFollowPrompt,
  type QuickFollowPromptCreateInput,
  type QuickFollowPromptUpdateInput,
  type QuickFollowSettings,
  type SelectionDisplayMode
} from '@/domain/quick-follow/types'
import { DEFAULT_QUICK_FOLLOW_ICON_KEY } from '@/domain/quick-follow/iconKeys'
import { quickFollowRepository } from '@/data/repositories'
import { t } from '@/utils/i18n'
import { browser } from 'wxt/browser'

interface QuickFollowState {
  prompts: QuickFollowPrompt[]
  settings: QuickFollowSettings
  isHydrated: boolean
  isHydrating: boolean
  error?: string
}

interface QuickFollowActions {
  hydrate: () => Promise<void>
  addPrompt: (data?: Partial<QuickFollowPromptCreateInput>) => Promise<QuickFollowPrompt>
  updatePrompt: (id: string, patch: QuickFollowPromptUpdateInput) => Promise<QuickFollowPrompt>
  deletePrompt: (id: string) => Promise<void>
  reorder: (idsInOrder: string[]) => Promise<void>
  setEnabled: (enabled: boolean) => Promise<void>
  setSelectionDisplayMode: (mode: SelectionDisplayMode) => Promise<void>
}

export type QuickFollowStore = QuickFollowState & QuickFollowActions

const DEFAULT_SETTINGS: QuickFollowSettings = {
  orderedIds: [],
  enabled: true,
  selectionDisplayMode: DEFAULT_SELECTION_DISPLAY_MODE
}

const DEFAULT_ICON_KEY = DEFAULT_QUICK_FOLLOW_ICON_KEY
let hydrationRequest = 0

async function fetchLatest(): Promise<Pick<QuickFollowStore, 'prompts' | 'settings'>> {
  const [prompts, settings] = await Promise.all([
    quickFollowRepository.list(),
    quickFollowRepository.getSettings()
  ])
  return { prompts, settings }
}

export const useQuickFollowStore = create<QuickFollowStore>((set) => ({
  prompts: [],
  settings: DEFAULT_SETTINGS,
  isHydrated: false,
  isHydrating: false,
  error: undefined,

  async hydrate() {
    const request = ++hydrationRequest
    set({ isHydrating: true })

    try {
      const data = await fetchLatest()

      let settings = data.settings
      try {
        const storageResult = await browser.storage.sync.get('enableQuickQuote')
        if (request !== hydrationRequest) return
        const storageEnabled = storageResult?.enableQuickQuote
        if (typeof storageEnabled === 'boolean' && storageEnabled !== settings.enabled) {
          settings = await quickFollowRepository.setEnabled(storageEnabled)
        }
      } catch (error) {
        console.warn('Failed to read quick follow toggle from storage:', error)
      }

      if (request !== hydrationRequest) return
      set({
        prompts: data.prompts,
        settings,
        isHydrated: true,
        isHydrating: false,
        error: undefined
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to hydrate quick follow store'
      if (request === hydrationRequest) set({ isHydrating: false, error: message })
      throw error
    }
  },

  async addPrompt(data) {
    const translatedTemplate = t(DEFAULT_QUICK_FOLLOW_TEMPLATE_KEY)
    const template =
      typeof translatedTemplate === 'string' &&
      translatedTemplate.includes(QUICK_FOLLOW_PLACEHOLDER)
        ? translatedTemplate
        : DEFAULT_QUICK_FOLLOW_TEMPLATE_FALLBACK

    const payload: QuickFollowPromptCreateInput = {
      template,
      iconKey: DEFAULT_ICON_KEY,
      enabled: true,
      ...data
    }

    const prompt = await quickFollowRepository.create(payload)
    const latest = await fetchLatest()

    // Place new prompt at the beginning of orderedIds
    const newOrderedIds = [prompt.id, ...latest.settings.orderedIds.filter(id => id !== prompt.id)]
    await quickFollowRepository.reorder(newOrderedIds)

    set(state => ({
      prompts: latest.prompts,
      settings: { ...state.settings, orderedIds: newOrderedIds },
      isHydrated: true
    }))
    return prompt
  },

  async updatePrompt(id, patch) {
    const prompt = await quickFollowRepository.update(id, patch)
    set(state => ({
      prompts: state.prompts.map(existing => (existing.id === id ? prompt : existing)),
      settings: state.settings,
      isHydrated: true
    }))
    return prompt
  },

  async deletePrompt(id) {
    await quickFollowRepository.delete(id)
    const latest = await fetchLatest()
    set(state => ({
      prompts: latest.prompts,
      settings: { ...state.settings, orderedIds: latest.settings.orderedIds },
      isHydrated: true
    }))
  },

  async reorder(idsInOrder) {
    // Optimistic update: immediately update local state for smooth UI
    set(state => ({
      ...state,
      settings: { ...state.settings, orderedIds: idsInOrder }
    }))

    // Then persist to database
    try {
      await quickFollowRepository.reorder(idsInOrder)
      // Optionally sync with latest from DB (usually not needed if reorder succeeds)
    } catch (error) {
      // Rollback on error: refetch latest state
      const latest = await fetchLatest()
      set(state => ({
        prompts: latest.prompts,
        settings: { ...state.settings, orderedIds: latest.settings.orderedIds },
        isHydrated: true
      }))
      throw error
    }
  },

  async setEnabled(enabled) {
    const settings = await quickFollowRepository.setEnabled(enabled)
    set(state => ({
      settings: { ...state.settings, enabled: settings.enabled },
      isHydrated: true
    }))
  },

  async setSelectionDisplayMode(selectionDisplayMode) {
    await quickFollowRepository.setSelectionDisplayMode(selectionDisplayMode)
    set(state => ({
      settings: { ...state.settings, selectionDisplayMode },
      isHydrated: true
    }))
  }
}))

export const quickFollowStore = {
  getState: () => useQuickFollowStore.getState(),
  subscribe: useQuickFollowStore.subscribe
}

