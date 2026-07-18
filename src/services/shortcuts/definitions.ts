import type { Options } from 'react-hotkeys-hook'

export const shortcutActions = [
  'openSettings',
  'toggleBulkDelete',
  'openNewChat',
  'openTemporaryChat',
  'openLibrary',
  'openGems',
  'focusInput',
  'toggleSidebar',
  'cycleModel',
  'createImage',
  'createMusic',
  'openCanvas',
  'openDeepResearch',
  'uploadFiles',
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
    id: 'prompt',
    labelKey: 'settingPanel.shortcut.categories.prompt',
  },
] as const

export type ShortcutCategory = typeof shortcutCategories[number]['id']

export interface ShortcutDefinition {
  action: ShortcutAction
  category: ShortcutCategory
  labelKey: string
  defaultShortcut: string | null
  enableOnFormTags: Options['enableOnFormTags']
  enableOnContentEditable: boolean
  ignoreEventWhen?: Options['ignoreEventWhen']
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
    action: 'toggleBulkDelete',
    category: 'geminiPowerKit',
    labelKey: 'settingPanel.shortcut.actions.toggleBulkDelete',
    defaultShortcut: null,
    enableOnFormTags: ['input'],
    enableOnContentEditable: false,
    ignoreEventWhen: (event) => (
      event.target instanceof HTMLInputElement && event.target.type !== 'checkbox'
    ),
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
    category: 'prompt',
    labelKey: 'settingPanel.shortcut.actions.focusInput',
    defaultShortcut: 'slash',
    enableOnFormTags: false,
    enableOnContentEditable: false,
  },
  {
    action: 'cycleModel',
    category: 'prompt',
    labelKey: 'settingPanel.shortcut.actions.cycleModel',
    defaultShortcut: 'ctrl+shift+m',
    enableOnFormTags: ['textbox'],
    enableOnContentEditable: true,
  },
  {
    action: 'uploadFiles',
    category: 'prompt',
    labelKey: 'settingPanel.shortcut.actions.uploadFiles',
    defaultShortcut: 'mod+u',
    enableOnFormTags: ['textbox'],
    enableOnContentEditable: true,
  },
  {
    action: 'createImage',
    category: 'prompt',
    labelKey: 'settingPanel.shortcut.actions.createImage',
    defaultShortcut: null,
    enableOnFormTags: ['textbox'],
    enableOnContentEditable: true,
  },
  {
    action: 'createMusic',
    category: 'prompt',
    labelKey: 'settingPanel.shortcut.actions.createMusic',
    defaultShortcut: null,
    enableOnFormTags: ['textbox'],
    enableOnContentEditable: true,
  },
  {
    action: 'openCanvas',
    category: 'prompt',
    labelKey: 'settingPanel.shortcut.actions.openCanvas',
    defaultShortcut: null,
    enableOnFormTags: ['textbox'],
    enableOnContentEditable: true,
  },
  {
    action: 'openDeepResearch',
    category: 'prompt',
    labelKey: 'settingPanel.shortcut.actions.openDeepResearch',
    defaultShortcut: null,
    enableOnFormTags: ['textbox'],
    enableOnContentEditable: true,
  },
]

export const shortcutDefinitionsByCategory = shortcutCategories.map((category) => ({
  ...category,
  definitions: shortcutDefinitions.filter((definition) => definition.category === category.id),
}))

export const defaultShortcutBindings: Record<ShortcutAction, string | null> = shortcutDefinitions.reduce(
  (bindings, definition) => {
    bindings[definition.action] = definition.defaultShortcut
    return bindings
  },
  {} as Record<ShortcutAction, string | null>,
)
