import type { Options } from 'react-hotkeys-hook'

export const shortcutActions = [
  'openSettings',
  'toggleBulkDelete',
  'openNewChat',
  'deleteCurrentChat',
  'openTemporaryChat',
  'openLibrary',
  'openGems',
  'focusInput',
  'toggleSpeechDictation',
  'toggleSidebar',
  'cycleModel',
  'createImage',
  'createVideo',
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

export interface ShortcutDefault {
  default: string | null
  mac?: string | null
}

export interface ShortcutDefinition {
  action: ShortcutAction
  category: ShortcutCategory
  labelKey: string
  defaultShortcut: ShortcutDefault
  enableOnFormTags: Options['enableOnFormTags']
  enableOnContentEditable: boolean
  ignoreEventWhen?: Options['ignoreEventWhen']
}

function withPlatformModifier(defaultKeys: string, macKeys = defaultKeys): ShortcutDefault {
  return {
    default: `alt+${defaultKeys}`,
    mac: `ctrl+${macKeys}`,
  }
}

const promptEditorFormTags = ['textbox'] as const

export const shortcutDefinitions: ShortcutDefinition[] = [
  {
    action: 'openSettings',
    category: 'geminiPowerKit',
    labelKey: 'settingPanel.shortcut.actions.openSettings',
    defaultShortcut: withPlatformModifier('comma'),
    enableOnFormTags: promptEditorFormTags,
    enableOnContentEditable: true,
  },
  {
    action: 'toggleBulkDelete',
    category: 'geminiPowerKit',
    labelKey: 'settingPanel.shortcut.actions.toggleBulkDelete',
    defaultShortcut: withPlatformModifier('shift+d'),
    enableOnFormTags: ['input', ...promptEditorFormTags],
    enableOnContentEditable: true,
    ignoreEventWhen: (event) => (
      event.target instanceof HTMLInputElement && event.target.type !== 'checkbox'
    ),
  },
  {
    action: 'toggleSidebar',
    category: 'app',
    labelKey: 'settingPanel.shortcut.actions.toggleSidebar',
    defaultShortcut: withPlatformModifier('b'),
    enableOnFormTags: promptEditorFormTags,
    enableOnContentEditable: true,
  },
  {
    action: 'openNewChat',
    category: 'app',
    labelKey: 'settingPanel.shortcut.actions.openNewChat',
    defaultShortcut: withPlatformModifier('n'),
    enableOnFormTags: promptEditorFormTags,
    enableOnContentEditable: true,
  },
  {
    action: 'deleteCurrentChat',
    category: 'app',
    labelKey: 'settingPanel.shortcut.actions.deleteCurrentChat',
    defaultShortcut: { default: null },
    enableOnFormTags: promptEditorFormTags,
    enableOnContentEditable: true,
  },
  {
    action: 'openTemporaryChat',
    category: 'app',
    labelKey: 'settingPanel.shortcut.actions.openTemporaryChat',
    defaultShortcut: withPlatformModifier('t'),
    enableOnFormTags: promptEditorFormTags,
    enableOnContentEditable: true,
  },
  {
    action: 'openLibrary',
    category: 'app',
    labelKey: 'settingPanel.shortcut.actions.openLibrary',
    defaultShortcut: withPlatformModifier('l'),
    enableOnFormTags: promptEditorFormTags,
    enableOnContentEditable: true,
  },
  {
    action: 'openGems',
    category: 'app',
    labelKey: 'settingPanel.shortcut.actions.openGems',
    defaultShortcut: withPlatformModifier('g'),
    enableOnFormTags: promptEditorFormTags,
    enableOnContentEditable: true,
  },
  {
    action: 'focusInput',
    category: 'prompt',
    labelKey: 'settingPanel.shortcut.actions.focusInput',
    defaultShortcut: { default: 'slash' },
    enableOnFormTags: false,
    enableOnContentEditable: false,
  },
  {
    action: 'toggleSpeechDictation',
    category: 'prompt',
    labelKey: 'settingPanel.shortcut.actions.toggleSpeechDictation',
    defaultShortcut: withPlatformModifier('d'),
    enableOnFormTags: promptEditorFormTags,
    enableOnContentEditable: true,
  },
  {
    action: 'cycleModel',
    category: 'prompt',
    labelKey: 'settingPanel.shortcut.actions.cycleModel',
    defaultShortcut: withPlatformModifier('m', 'shift+m'),
    enableOnFormTags: promptEditorFormTags,
    enableOnContentEditable: true,
  },
  {
    action: 'uploadFiles',
    category: 'prompt',
    labelKey: 'settingPanel.shortcut.actions.uploadFiles',
    defaultShortcut: withPlatformModifier('u'),
    enableOnFormTags: promptEditorFormTags,
    enableOnContentEditable: true,
  },
  {
    action: 'createImage',
    category: 'prompt',
    labelKey: 'settingPanel.shortcut.actions.createImage',
    defaultShortcut: withPlatformModifier('shift+i', 'i'),
    enableOnFormTags: promptEditorFormTags,
    enableOnContentEditable: true,
  },
  {
    action: 'createVideo',
    category: 'prompt',
    labelKey: 'settingPanel.shortcut.actions.createVideo',
    defaultShortcut: withPlatformModifier('shift+v', 'v'),
    enableOnFormTags: promptEditorFormTags,
    enableOnContentEditable: true,
  },
  {
    action: 'createMusic',
    category: 'prompt',
    labelKey: 'settingPanel.shortcut.actions.createMusic',
    defaultShortcut: withPlatformModifier('shift+m', 'm'),
    enableOnFormTags: promptEditorFormTags,
    enableOnContentEditable: true,
  },
  {
    action: 'openCanvas',
    category: 'prompt',
    labelKey: 'settingPanel.shortcut.actions.openCanvas',
    defaultShortcut: withPlatformModifier('shift+c', 'c'),
    enableOnFormTags: promptEditorFormTags,
    enableOnContentEditable: true,
  },
  {
    action: 'openDeepResearch',
    category: 'prompt',
    labelKey: 'settingPanel.shortcut.actions.openDeepResearch',
    defaultShortcut: withPlatformModifier('shift+r', 'r'),
    enableOnFormTags: promptEditorFormTags,
    enableOnContentEditable: true,
  },
]

export const shortcutDefinitionsByCategory = shortcutCategories.map((category) => ({
  ...category,
  definitions: shortcutDefinitions.filter((definition) => definition.category === category.id),
}))

export function resolveDefaultShortcut(
  defaultShortcut: ShortcutDefault,
  isMac: boolean,
): string | null {
  return isMac ? defaultShortcut.mac ?? defaultShortcut.default : defaultShortcut.default
}

export function getDefaultShortcutBindings(isMac: boolean): Record<ShortcutAction, string | null> {
  return shortcutDefinitions.reduce(
    (bindings, definition) => {
      bindings[definition.action] = resolveDefaultShortcut(definition.defaultShortcut, isMac)
      return bindings
    },
    {} as Record<ShortcutAction, string | null>,
  )
}
