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

export interface ShortcutDefinition {
  action: ShortcutAction
  labelKey: string
  defaultShortcut: string
  enableOnFormTags: Options['enableOnFormTags']
  enableOnContentEditable: boolean
}

export const shortcutDefinitions: ShortcutDefinition[] = [
  {
    action: 'openSettings',
    labelKey: 'settingPanel.shortcut.actions.openSettings',
    defaultShortcut: 'alt+comma',
    enableOnFormTags: false,
    enableOnContentEditable: false,
  },
  {
    action: 'openNewChat',
    labelKey: 'settingPanel.shortcut.actions.openNewChat',
    defaultShortcut: 'alt+n',
    enableOnFormTags: false,
    enableOnContentEditable: false,
  },
  {
    action: 'openTemporaryChat',
    labelKey: 'settingPanel.shortcut.actions.openTemporaryChat',
    defaultShortcut: 'alt+t',
    enableOnFormTags: false,
    enableOnContentEditable: false,
  },
  {
    action: 'openLibrary',
    labelKey: 'settingPanel.shortcut.actions.openLibrary',
    defaultShortcut: 'alt+l',
    enableOnFormTags: false,
    enableOnContentEditable: false,
  },
  {
    action: 'openGems',
    labelKey: 'settingPanel.shortcut.actions.openGems',
    defaultShortcut: 'alt+g',
    enableOnFormTags: false,
    enableOnContentEditable: false,
  },
  {
    action: 'focusInput',
    labelKey: 'settingPanel.shortcut.actions.focusInput',
    defaultShortcut: 'slash',
    enableOnFormTags: false,
    enableOnContentEditable: false,
  },
  {
    action: 'toggleSidebar',
    labelKey: 'settingPanel.shortcut.actions.toggleSidebar',
    defaultShortcut: 'alt+q',
    enableOnFormTags: false,
    enableOnContentEditable: false,
  },
  {
    action: 'cycleModel',
    labelKey: 'settingPanel.shortcut.actions.cycleModel',
    defaultShortcut: 'ctrl+shift+m',
    enableOnFormTags: ['textbox'],
    enableOnContentEditable: true,
  },
]

export const defaultShortcutBindings: Record<ShortcutAction, string> = shortcutDefinitions.reduce(
  (bindings, definition) => {
    bindings[definition.action] = definition.defaultShortcut
    return bindings
  },
  {} as Record<ShortcutAction, string>,
)
