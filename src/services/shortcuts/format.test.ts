import { describe, expect, it } from 'vitest'
import { createShortcutString, formatShortcut } from './format'

describe('shortcut format', () => {
  it('creates a stable shortcut string from recorded keys', () => {
    const shortcut = createShortcutString(new Set(['n', 'shift', 'alt']))

    expect(shortcut).toBe('alt+shift+n')
  })

  it('formats shortcuts for macOS', () => {
    const formatted = formatShortcut('meta+shift+s', true)

    expect(formatted.tokens).toEqual(['⌘', '⇧', 'S'])
    expect(formatted.text).toBe('⌘⇧ S')
  })

  it('formats shortcuts for non-mac platforms', () => {
    const formatted = formatShortcut('ctrl+shift+s', false)

    expect(formatted.tokens).toEqual(['Ctrl', 'Shift', 'S'])
    expect(formatted.text).toBe('Ctrl + Shift + S')
  })

  it('formats comma shortcuts', () => {
    const formatted = formatShortcut('alt+comma', false)

    expect(formatted.tokens).toEqual(['Alt', ','])
    expect(formatted.text).toBe('Alt + ,')
  })

  it('formats slash shortcuts', () => {
    const formatted = formatShortcut('slash', false)

    expect(formatted.tokens).toEqual(['/'])
    expect(formatted.text).toBe('/')
  })
})
