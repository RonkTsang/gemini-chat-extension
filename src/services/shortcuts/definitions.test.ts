import { describe, expect, it } from 'vitest'

import en from '@/locales/en.json'
import {
  shortcutCategories,
  shortcutDefinitions,
  shortcutDefinitionsByCategory,
} from './definitions'

describe('shortcut definitions', () => {
  it('defines SideNav navigation shortcuts', () => {
    const definitionsByAction = new Map(shortcutDefinitions.map((definition) => [definition.action, definition]))

    expect(definitionsByAction.get('openLibrary')).toMatchObject({
      defaultShortcut: 'alt+l',
      enableOnContentEditable: false,
    })
    expect(definitionsByAction.get('openGems')).toMatchObject({
      defaultShortcut: 'alt+g',
      enableOnContentEditable: false,
    })
    expect(definitionsByAction.get('toggleSidebar')).toMatchObject({
      defaultShortcut: 'alt+b',
      enableOnContentEditable: false,
    })
  })

  it('allows cycle model to run while a contenteditable is focused', () => {
    const cycleModel = shortcutDefinitions.find((definition) => definition.action === 'cycleModel')

    expect(cycleModel).toMatchObject({
      defaultShortcut: 'alt+m',
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
          'createMusic',
          'openCanvas',
          'openDeepResearch',
        ],
      },
    ])
  })

  it('assigns default shortcuts to Prompt tools', () => {
    const definitionsByAction = new Map(shortcutDefinitions.map((definition) => [definition.action, definition]))

    expect(definitionsByAction.get('createImage')).toMatchObject({ defaultShortcut: 'alt+shift+i' })
    expect(definitionsByAction.get('createMusic')).toMatchObject({ defaultShortcut: 'alt+shift+m' })
    expect(definitionsByAction.get('openCanvas')).toMatchObject({ defaultShortcut: 'alt+shift+c' })
    expect(definitionsByAction.get('openDeepResearch')).toMatchObject({ defaultShortcut: 'alt+shift+r' })
  })

  it('keeps all default shortcuts unique', () => {
    const assignedShortcuts = shortcutDefinitions
      .map((definition) => definition.defaultShortcut)
      .filter((shortcut): shortcut is string => shortcut !== null)

    expect(new Set(assignedShortcuts)).toHaveLength(assignedShortcuts.length)
  })

  it('assigns a Bulk Delete toggle shortcut outside text inputs', () => {
    const bulkDelete = shortcutDefinitions.find((definition) => definition.action === 'toggleBulkDelete')

    expect(bulkDelete).toMatchObject({
      category: 'geminiPowerKit',
      defaultShortcut: 'alt+shift+d',
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
      defaultShortcut: 'alt+u',
      enableOnContentEditable: true,
      enableOnFormTags: ['textbox'],
    })
  })

  it('allows speech dictation to run while the prompt editor is focused', () => {
    const dictation = shortcutDefinitions.find((definition) => definition.action === 'toggleSpeechDictation')

    expect(dictation).toMatchObject({
      defaultShortcut: 'alt+d',
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
