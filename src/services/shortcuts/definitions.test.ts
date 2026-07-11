import { describe, expect, it } from 'vitest'

import { shortcutDefinitions } from './definitions'

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
})
