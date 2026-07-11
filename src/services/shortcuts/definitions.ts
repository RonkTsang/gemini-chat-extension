import type { Options } from 'react-hotkeys-hook'

export const shortcutActions = [
  'openSettings',
  'openNewChat',
  'openTemporaryChat',
  'openLibrary',
  'openGems',
  'focusInput',
  'toggleSidebar',
  'cycleModel',
] as const

export type ShortcutAction = typeof shortcutActions[number]

export const shortcutCategories = [
  {
    id: 'geminiPowerKit',
    labelKey: 'settingPanel.shortcut.categories.geminiPowerKit',
  },
  {
    id: 'app',
    labelKey: 'settingPanel.shortcut.categories.app',
  },
  {
    id: 'message',
    labelKey: 'settingPanel.shortcut.categories.message',
  },
] as const

export type ShortcutCategory = typeof shortcutCategories[number]['id']

export interface ShortcutDefinition {
  action: ShortcutAction
  category: ShortcutCategory
  labelKey: string
  defaultShortcut: string
  enableOnFormTags: Options['enableOnFormTags']
  enableOnContentEditable: boolean
}

export const shortcutDefinitions: ShortcutDefinition[] = [
  {
    action: 'openSettings',
    category: 'geminiPowerKit',
    labelKey: 'settingPanel.shortcut.actions.openSettings',
    defaultShortcut: 'alt+comma',
    enableOnFormTags: false,
    enableOnContentEditable: false,
  },
  {
    action: 'toggleSidebar',
    category: 'app',
    labelKey: 'settingPanel.shortcut.actions.toggleSidebar',
    defaultShortcut: 'alt+q',
    enableOnFormTags: false,
    enableOnContentEditable: false,
  },
  {
    action: 'openNewChat',
    category: 'app',
    labelKey: 'settingPanel.shortcut.actions.openNewChat',
    defaultShortcut: 'alt+n',
    enableOnFormTags: false,
    enableOnContentEditable: false,
  },
  {
    action: 'openTemporaryChat',
    category: 'app',
    labelKey: 'settingPanel.shortcut.actions.openTemporaryChat',
    defaultShortcut: 'alt+t',
    enableOnFormTags: false,
    enableOnContentEditable: false,
  },
  {
    action: 'openLibrary',
    category: 'app',
    labelKey: 'settingPanel.shortcut.actions.openLibrary',
    defaultShortcut: 'alt+l',
    enableOnFormTags: false,
    enableOnContentEditable: false,
  },
  {
    action: 'openGems',
    category: 'app',
    labelKey: 'settingPanel.shortcut.actions.openGems',
    defaultShortcut: 'alt+g',
    enableOnFormTags: false,
    enableOnContentEditable: false,
  },
  {
    action: 'focusInput',
    category: 'message',
    labelKey: 'settingPanel.shortcut.actions.focusInput',
    defaultShortcut: 'slash',
    enableOnFormTags: false,
    enableOnContentEditable: false,
  },
  {
    action: 'cycleModel',
    category: 'message',
    labelKey: 'settingPanel.shortcut.actions.cycleModel',
    defaultShortcut: 'ctrl+shift+m',
    enableOnFormTags: ['textbox'],
    enableOnContentEditable: true,
  },
]

export const shortcutDefinitionsByCategory = shortcutCategories.map((category) => ({
  ...category,
  definitions: shortcutDefinitions.filter((definition) => definition.category === category.id),
}))

export const defaultShortcutBindings: Record<ShortcutAction, string> = shortcutDefinitions.reduce(
  (bindings, definition) => {
    bindings[definition.action] = definition.defaultShortcut
    return bindings
  },
  {} as Record<ShortcutAction, string>,
)
