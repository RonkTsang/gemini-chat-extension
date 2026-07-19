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
  cycleModel: 'alt+shift+m',
  createImage: 'alt+i',
  createVideo: 'alt+v',
  createMusic: 'alt+m',
  openCanvas: 'alt+c',
  openDeepResearch: 'alt+r',
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

  it('rejects shortcuts assigned to Speech Dictation, Cycle Model, Bulk Delete, and Video', () => {
    expect(validateRecordedShortcut(new Set(['alt', 'd']), 'openNewChat', bindings)).toMatchObject({
      reason: 'conflict',
      conflictAction: 'toggleSpeechDictation',
    })
    expect(validateRecordedShortcut(new Set(['alt', 'shift', 'm']), 'openNewChat', bindings)).toMatchObject({
      reason: 'conflict',
      conflictAction: 'cycleModel',
    })
    expect(validateRecordedShortcut(new Set(['alt', 'shift', 'd']), 'openNewChat', bindings)).toMatchObject({
      reason: 'conflict',
      conflictAction: 'toggleBulkDelete',
    })
    expect(validateRecordedShortcut(new Set(['alt', 'v']), 'openNewChat', bindings)).toMatchObject({
      reason: 'conflict',
      conflictAction: 'createVideo',
    })
  })
})
