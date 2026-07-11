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
  })

  it('allows cycle model to run while a contenteditable is focused', () => {
    const cycleModel = shortcutDefinitions.find((definition) => definition.action === 'cycleModel')

    expect(cycleModel).toMatchObject({
      enableOnContentEditable: true,
      enableOnFormTags: ['textbox'],
    })
  })

  it('groups shortcuts by product area in display order', () => {
    expect(shortcutDefinitionsByCategory.map(({ id, definitions }) => ({
      id,
      actions: definitions.map((definition) => definition.action),
    }))).toEqual([
      { id: 'geminiPowerKit', actions: ['openSettings'] },
      {
        id: 'app',
        actions: ['toggleSidebar', 'openNewChat', 'openTemporaryChat', 'openLibrary', 'openGems'],
      },
      { id: 'message', actions: ['focusInput', 'cycleModel'] },
    ])
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
