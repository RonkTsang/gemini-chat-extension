import { describe, expect, it } from 'vitest'

import { defaultShortcutSettings, normalizeShortcutSettings } from './settings'

describe('shortcut settings', () => {
  it('preserves an existing Cycle Model binding', () => {
    const settings = normalizeShortcutSettings({
      enabled: true,
      bindings: {
        ...defaultShortcutSettings.bindings,
        cycleModel: 'alt+m',
      },
    })

    expect(settings.bindings.cycleModel).toBe('alt+m')
  })

  it('preserves a user-selected cycle model shortcut', () => {
    const settings = normalizeShortcutSettings({
      enabled: true,
      bindings: {
        ...defaultShortcutSettings.bindings,
        cycleModel: 'meta+shift+m',
      },
    })

    expect(settings.bindings.cycleModel).toBe('meta+shift+m')
  })
})
