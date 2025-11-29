import { registerView, type NavigationSection } from '../config'
import type { SettingViewComponent } from '../types'
import { DefaultIndexView } from './default/index'
import { DefaultDetailView } from './default/detail'
import { ChainPromptListView } from './chain-prompt/index'
import { ChainPromptEditorView } from './chain-prompt/editor'
import { QuickFollowSettingsView } from './quick-follow-up/index'
import { ChatOutlineSettingsView } from './chat-outline/index'

const defaultIndexView = DefaultIndexView as SettingViewComponent<NavigationSection>
const defaultDetailView = DefaultDetailView as SettingViewComponent<NavigationSection>
const chainPromptListView = ChainPromptListView as SettingViewComponent<NavigationSection>
const chainPromptEditorView = ChainPromptEditorView as SettingViewComponent<NavigationSection>
const quickFollowSettingsView = QuickFollowSettingsView as SettingViewComponent<NavigationSection>
const chatOutlineSettingsView = ChatOutlineSettingsView as SettingViewComponent<NavigationSection>

export function registerDefaultViews() {
  registerView('default/index', defaultIndexView)
  registerView('default/detail', defaultDetailView)
  registerView('chain-prompt/index', chainPromptListView)
  registerView('chain-prompt/editor', chainPromptEditorView)
  registerView('quick-follow-up/index', quickFollowSettingsView)
  registerView('chat-outline/index', chatOutlineSettingsView)
}
