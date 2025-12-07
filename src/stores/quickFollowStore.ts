import { create } from 'zustand'

import {
  QUICK_FOLLOW_PLACEHOLDER,
  type QuickFollowPrompt,
  type QuickFollowPromptCreateInput,
  type QuickFollowPromptUpdateInput,
  type QuickFollowSettings
} from '@/domain/quick-follow/types'
import { DEFAULT_QUICK_FOLLOW_ICON_KEY } from '@/domain/quick-follow/iconKeys'
import { quickFollowRepository } from '@/data/repositories'
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
}

export type QuickFollowStore = QuickFollowState & QuickFollowActions

const DEFAULT_SETTINGS: QuickFollowSettings = {
  orderedIds: [],
  enabled: true
}

const DEFAULT_ICON_KEY = DEFAULT_QUICK_FOLLOW_ICON_KEY

async function fetchLatest(): Promise<Pick<QuickFollowStore, 'prompts' | 'settings'>> {
  const [prompts, settings] = await Promise.all([
    quickFollowRepository.list(),
    quickFollowRepository.getSettings()
  ])
  return { prompts, settings }
}

export const useQuickFollowStore = create<QuickFollowStore>((set, get) => ({
  prompts: [],
  settings: DEFAULT_SETTINGS,
  isHydrated: false,
  isHydrating: false,
  error: undefined,

  async hydrate() {
    if (get().isHydrating && get().isHydrated) {
      return
    }

    set({ isHydrating: true })

    try {
      const data = await fetchLatest()

      let settings = data.settings
      try {
        const storageResult = await browser.storage.sync.get('enableQuickQuote')
        const storageEnabled = storageResult?.enableQuickQuote
        if (typeof storageEnabled === 'boolean' && storageEnabled !== settings.enabled) {
          settings = await quickFollowRepository.setEnabled(storageEnabled)
        }
      } catch (error) {
        console.warn('Failed to read quick follow toggle from storage:', error)
      }

      set({
        prompts: data.prompts,
        settings,
        isHydrated: true,
        isHydrating: false,
        error: undefined
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to hydrate quick follow store'
      set({ isHydrating: false, error: message })
      throw error
    }
  },

  async addPrompt(data) {
    const payload: QuickFollowPromptCreateInput = {
      template: QUICK_FOLLOW_PLACEHOLDER,
      iconKey: DEFAULT_ICON_KEY,
      enabled: true,
      ...data
    }

    const prompt = await quickFollowRepository.create(payload)
    const latest = await fetchLatest()
    set({ ...latest, isHydrated: true })
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
    set({ ...latest, isHydrated: true })
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
      set({ ...latest, isHydrated: true })
      throw error
    }
  },

  async setEnabled(enabled) {
    const settings = await quickFollowRepository.setEnabled(enabled)
    set(state => ({ prompts: state.prompts, settings, isHydrated: true }))
  }
}))

export const quickFollowStore = {
  getState: () => useQuickFollowStore.getState(),
  subscribe: useQuickFollowStore.subscribe
}

