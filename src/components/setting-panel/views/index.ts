import { registerView, type NavigationSection } from '../config'
import type { SettingViewComponent } from '../types'
import { DefaultIndexView } from './default/index'
import { DefaultDetailView } from './default/detail'
import { ChainPromptListView } from './chain-prompt/index'
import { ChainPromptEditorView } from './chain-prompt/editor'

const defaultIndexView = DefaultIndexView as SettingViewComponent<NavigationSection>
const defaultDetailView = DefaultDetailView as SettingViewComponent<NavigationSection>
const chainPromptListView = ChainPromptListView as SettingViewComponent<NavigationSection>
const chainPromptEditorView = ChainPromptEditorView as SettingViewComponent<NavigationSection>

export function registerDefaultViews() {
  registerView('default/index', defaultIndexView)
  registerView('default/detail', defaultDetailView)
  registerView('chain-prompt/index', chainPromptListView)
  registerView('chain-prompt/editor', chainPromptEditorView)
}
