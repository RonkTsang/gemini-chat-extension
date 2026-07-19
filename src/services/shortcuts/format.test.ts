import { describe, expect, it } from 'vitest'
import { createShortcutString, formatShortcut, resolvePlatformShortcut } from './format'

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

  it('formats Control shortcuts for macOS', () => {
    expect(formatShortcut('ctrl+i', true).text).toBe('⌃ I')
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

  it('formats mod as Command on macOS and Ctrl on Windows', () => {
    expect(formatShortcut('mod+u', true).text).toBe('⌘ U')
    expect(formatShortcut('mod+u', false).text).toBe('Ctrl + U')
    expect(resolvePlatformShortcut('mod+u', true)).toBe('meta+u')
    expect(resolvePlatformShortcut('mod+u', false)).toBe('ctrl+u')
  })
})
