import { describe, expect, it } from 'vitest'

import en from '@/locales/en.json'
import {
  getDefaultShortcutBindings,
  shortcutCategories,
  shortcutDefinitions,
  shortcutDefinitionsByCategory,
} from './definitions'

describe('shortcut definitions', () => {
  it('defines SideNav navigation shortcuts', () => {
    const definitionsByAction = new Map(shortcutDefinitions.map((definition) => [definition.action, definition]))

    expect(definitionsByAction.get('openLibrary')).toMatchObject({
      defaultShortcut: { default: 'alt+l', mac: 'ctrl+l' },
      enableOnContentEditable: false,
    })
    expect(definitionsByAction.get('openGems')).toMatchObject({
      defaultShortcut: { default: 'alt+g', mac: 'ctrl+g' },
      enableOnContentEditable: false,
    })
    expect(definitionsByAction.get('toggleSidebar')).toMatchObject({
      defaultShortcut: { default: 'alt+b', mac: 'ctrl+b' },
      enableOnContentEditable: false,
    })
  })

  it('allows cycle model to run while a contenteditable is focused', () => {
    const cycleModel = shortcutDefinitions.find((definition) => definition.action === 'cycleModel')

    expect(cycleModel).toMatchObject({
      defaultShortcut: { default: 'alt+m', mac: 'ctrl+shift+m' },
      enableOnContentEditable: true,
      enableOnFormTags: ['textbox'],
    })
  })

  it('groups shortcuts by product area in display order', () => {
    expect(shortcutDefinitionsByCategory.map(({ id, definitions }) => ({
      id,
      actions: definitions.map((definition) => definition.action),
    }))).toEqual([
      { id: 'geminiPowerKit', actions: ['openSettings', 'toggleBulkDelete'] },
      {
        id: 'app',
        actions: ['toggleSidebar', 'openNewChat', 'openTemporaryChat', 'openLibrary', 'openGems'],
      },
      {
        id: 'prompt',
        actions: [
          'focusInput',
          'toggleSpeechDictation',
          'cycleModel',
          'uploadFiles',
          'createImage',
          'createVideo',
          'createMusic',
          'openCanvas',
          'openDeepResearch',
        ],
      },
    ])
  })

  it('assigns default shortcuts to Prompt tools', () => {
    const definitionsByAction = new Map(shortcutDefinitions.map((definition) => [definition.action, definition]))

    expect(definitionsByAction.get('createImage')).toMatchObject({ defaultShortcut: { default: 'alt+shift+i', mac: 'ctrl+i' } })
    expect(definitionsByAction.get('createVideo')).toMatchObject({ defaultShortcut: { default: 'alt+shift+v', mac: 'ctrl+v' } })
    expect(definitionsByAction.get('createMusic')).toMatchObject({ defaultShortcut: { default: 'alt+shift+m', mac: 'ctrl+m' } })
    expect(definitionsByAction.get('openCanvas')).toMatchObject({ defaultShortcut: { default: 'alt+shift+c', mac: 'ctrl+c' } })
    expect(definitionsByAction.get('openDeepResearch')).toMatchObject({ defaultShortcut: { default: 'alt+shift+r', mac: 'ctrl+r' } })
  })

  it('keeps platform defaults unique', () => {
    for (const isMac of [false, true]) {
      const assignedShortcuts = Object.values(getDefaultShortcutBindings(isMac))
        .filter((shortcut): shortcut is string => shortcut !== null)

      expect(new Set(assignedShortcuts)).toHaveLength(assignedShortcuts.length)
    }
  })

  it('resolves the complete default key map for each platform', () => {
    expect(getDefaultShortcutBindings(false)).toEqual({
      openSettings: 'alt+comma',
      toggleBulkDelete: 'alt+shift+d',
      openNewChat: 'alt+n',
      openTemporaryChat: 'alt+t',
      openLibrary: 'alt+l',
      openGems: 'alt+g',
      focusInput: 'slash',
      toggleSpeechDictation: 'alt+d',
      toggleSidebar: 'alt+b',
      cycleModel: 'alt+m',
      createImage: 'alt+shift+i',
      createVideo: 'alt+shift+v',
      createMusic: 'alt+shift+m',
      openCanvas: 'alt+shift+c',
      openDeepResearch: 'alt+shift+r',
      uploadFiles: 'alt+u',
    })
    expect(getDefaultShortcutBindings(true)).toEqual({
      openSettings: 'ctrl+comma',
      toggleBulkDelete: 'ctrl+shift+d',
      openNewChat: 'ctrl+n',
      openTemporaryChat: 'ctrl+t',
      openLibrary: 'ctrl+l',
      openGems: 'ctrl+g',
      focusInput: 'slash',
      toggleSpeechDictation: 'ctrl+d',
      toggleSidebar: 'ctrl+b',
      cycleModel: 'ctrl+shift+m',
      createImage: 'ctrl+i',
      createVideo: 'ctrl+v',
      createMusic: 'ctrl+m',
      openCanvas: 'ctrl+c',
      openDeepResearch: 'ctrl+r',
      uploadFiles: 'ctrl+u',
    })
  })

  it('assigns a Bulk Delete toggle shortcut outside text inputs', () => {
    const bulkDelete = shortcutDefinitions.find((definition) => definition.action === 'toggleBulkDelete')

    expect(bulkDelete).toMatchObject({
      category: 'geminiPowerKit',
      defaultShortcut: { default: 'alt+shift+d', mac: 'ctrl+shift+d' },
      enableOnFormTags: ['input'],
      enableOnContentEditable: false,
    })

    const checkbox = document.createElement('input')
    checkbox.type = 'checkbox'
    const checkboxEvent = new KeyboardEvent('keydown')
    Object.defineProperty(checkboxEvent, 'target', { value: checkbox })
    expect(bulkDelete?.ignoreEventWhen?.(checkboxEvent)).toBe(false)

    const textInput = document.createElement('input')
    textInput.type = 'text'
    const textInputEvent = new KeyboardEvent('keydown')
    Object.defineProperty(textInputEvent, 'target', { value: textInput })
    expect(bulkDelete?.ignoreEventWhen?.(textInputEvent)).toBe(true)
  })

  it('uses the Power Kit modifier for Upload Files', () => {
    const uploadFiles = shortcutDefinitions.find((definition) => definition.action === 'uploadFiles')

    expect(uploadFiles).toMatchObject({
      defaultShortcut: { default: 'alt+u', mac: 'ctrl+u' },
      enableOnContentEditable: true,
      enableOnFormTags: ['textbox'],
    })
  })

  it('allows speech dictation to run while the prompt editor is focused', () => {
    const dictation = shortcutDefinitions.find((definition) => definition.action === 'toggleSpeechDictation')

    expect(dictation).toMatchObject({
      defaultShortcut: { default: 'alt+d', mac: 'ctrl+d' },
      enableOnContentEditable: true,
      enableOnFormTags: ['textbox'],
    })
  })

  it('uses shortcut labels that exist in the English locale', () => {
    const labelKeys = [
      ...shortcutCategories.map((category) => category.labelKey),
      ...shortcutDefinitions.map((definition) => definition.labelKey),
    ]

    for (const labelKey of labelKeys) {
      expect(getNestedValue(en, labelKey)).toEqual(expect.any(String))
    }
  })
})

function getNestedValue(value: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((current, segment) => (
    typeof current === 'object' && current !== null
      ? (current as Record<string, unknown>)[segment]
      : undefined
  ), value)
}
