import { create } from 'zustand'
import type { NavigationSection } from '../components/setting-panel/config'
import type { SettingRoute } from '../components/setting-panel/types'

export interface SettingState {
  route: SettingRoute<NavigationSection>
}

export interface SettingActions {
  setRoute: (route: SettingRoute<NavigationSection>) => void
  setActiveSection: (section: NavigationSection) => void
  navigateToView: (section: NavigationSection, viewId: string, params?: Record<string, unknown>) => void
  goBack: () => void
}

export type SettingStore = SettingState & SettingActions

const useSettingStore = create<SettingStore>((set, get) => ({
  // Initial state
  route: { sectionId: 'chainPrompt', viewId: 'index' },

  // Actions
  setRoute: (route: SettingRoute<NavigationSection>) => {
    set({ route })
  },

  setActiveSection: (section: NavigationSection) => {
    set({
      route: {
        sectionId: section,
        viewId: 'index'
      }
    })
  },

  navigateToView: (section: NavigationSection, viewId: string, params?: Record<string, unknown>) => {
    set({
      route: { sectionId: section, viewId, params }
    })
  },

  goBack: () => {
    const { route } = get()
    if (route.viewId === 'index') {
      return
    }
    set({ route: { sectionId: route.sectionId, viewId: 'index' } })
  }
}))

// Export the store and its methods for use in non-React environments
export default useSettingStore

// Export individual methods for direct access
export const getSettingState = () => useSettingStore.getState()
export const setRoute = (route: SettingRoute<NavigationSection>) => useSettingStore.getState().setRoute(route)
export const setActiveSection = (section: NavigationSection) => 
  useSettingStore.getState().setActiveSection(section)
export const navigateToView = (section: NavigationSection, viewId: string, params?: Record<string, unknown>) =>
  useSettingStore.getState().navigateToView(section, viewId, params)
export const goBack = () => useSettingStore.getState().goBack()
