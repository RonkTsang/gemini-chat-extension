import { describe, expect, it } from 'vitest'
import type { ShortcutAction } from './definitions'
import { validateRecordedShortcut } from './validation'

const bindings: Record<ShortcutAction, string | null> = {
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
  createMusic: 'alt+shift+m',
  openCanvas: 'alt+shift+c',
  openDeepResearch: 'alt+shift+r',
  uploadFiles: 'alt+u',
}

describe('shortcut validation', () => {
  it('accepts a shortcut with a modifier', () => {
    const result = validateRecordedShortcut(new Set(['alt', 'shift', 'n']), 'openNewChat', bindings)

    expect(result).toEqual({
      ok: true,
      shortcut: 'alt+shift+n',
    })
  })

  it('rejects single-letter shortcuts', () => {
    const result = validateRecordedShortcut(new Set(['n']), 'openNewChat', bindings)

    expect(result).toEqual({
      ok: false,
      reason: 'singleLetter',
    })
  })

  it('accepts slash as a single-key shortcut', () => {
    const result = validateRecordedShortcut(new Set(['slash']), 'focusInput', bindings)

    expect(result).toEqual({
      ok: true,
      shortcut: 'slash',
    })
  })

  it('rejects other single non-letter shortcuts without modifiers', () => {
    const result = validateRecordedShortcut(new Set(['period']), 'focusInput', bindings)

    expect(result).toEqual({
      ok: false,
      reason: 'missingModifier',
    })
  })

  it('rejects blacklisted special keys', () => {
    const result = validateRecordedShortcut(new Set(['alt', 'escape']), 'openNewChat', bindings)

    expect(result).toEqual({
      ok: false,
      reason: 'specialKey',
    })
  })

  it('rejects shortcuts already used by another action', () => {
    const result = validateRecordedShortcut(new Set(['alt', 't']), 'openNewChat', bindings)

    expect(result).toEqual({
      ok: false,
      reason: 'conflict',
      conflictAction: 'openTemporaryChat',
    })
  })

  it('rejects a shortcut already assigned to Upload Files', () => {
    const result = validateRecordedShortcut(new Set(['alt', 'u']), 'openNewChat', bindings)

    expect(result).toEqual({
      ok: false,
      reason: 'conflict',
      conflictAction: 'uploadFiles',
    })
  })
})
