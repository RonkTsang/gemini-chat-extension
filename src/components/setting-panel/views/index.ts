import { registerView, type NavigationSection } from '../config'
import type { SettingViewComponent } from '../types'
import { DefaultIndexView } from './default/index'
import { DefaultDetailView } from './default/detail'
import { ChainPromptListView } from './chain-prompt/index'
import { ChainPromptEditorView } from './chain-prompt/editor'
import { QuickFollowSettingsView } from './quick-follow-up/index'
import { EnhancementsSettingsView } from './enhancements/index'
import { NotificationSettingsView } from './notification/index'
import { ThemeSettingsView } from './theme/index'
import { AboutView } from './about/index'

const defaultIndexView = DefaultIndexView as SettingViewComponent<NavigationSection>
const defaultDetailView = DefaultDetailView as SettingViewComponent<NavigationSection>
const chainPromptListView = ChainPromptListView as SettingViewComponent<NavigationSection>
const chainPromptEditorView = ChainPromptEditorView as SettingViewComponent<NavigationSection>
const quickFollowSettingsView = QuickFollowSettingsView as SettingViewComponent<NavigationSection>
const enhancementsSettingsView = EnhancementsSettingsView as SettingViewComponent<NavigationSection>
const notificationSettingsView = NotificationSettingsView as SettingViewComponent<NavigationSection>
const themeSettingsView = ThemeSettingsView as SettingViewComponent<NavigationSection>
const aboutView = AboutView as SettingViewComponent<NavigationSection>

export function registerDefaultViews() {
  registerView('default/index', defaultIndexView)
  registerView('default/detail', defaultDetailView)
  registerView('chain-prompt/index', chainPromptListView)
  registerView('chain-prompt/editor', chainPromptEditorView)
  registerView('quick-follow-up/index', quickFollowSettingsView)
  registerView('enhancements/index', enhancementsSettingsView)
  registerView('notification/index', notificationSettingsView)
  registerView('theme/index', themeSettingsView)
  registerView('about/index', aboutView)
}
