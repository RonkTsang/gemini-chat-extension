const MODIFIER_ORDER = ['ctrl', 'alt', 'shift', 'meta'] as const
const MAC_DISPLAY_MODIFIER_ORDER = ['meta', 'alt', 'shift', 'ctrl'] as const
const DEFAULT_DISPLAY_MODIFIER_ORDER = ['ctrl', 'alt', 'shift', 'meta'] as const
const MODIFIER_KEYS = new Set<string>(MODIFIER_ORDER)

const MAC_MODIFIER_LABELS: Record<string, string> = {
  ctrl: '⌃',
  alt: '⌥',
  shift: '⇧',
  meta: '⌘',
}

const DEFAULT_MODIFIER_LABELS: Record<string, string> = {
  ctrl: 'Ctrl',
  alt: 'Alt',
  shift: 'Shift',
  meta: 'Win',
}

const KEY_LABELS: Record<string, string> = {
  comma: ',',
  period: '.',
  slash: '/',
  semicolon: ';',
  quote: "'",
  bracketleft: '[',
  bracketright: ']',
  backquote: '`',
  minus: '-',
  equal: '=',
}

export interface FormattedShortcut {
  platform: 'mac' | 'default'
  tokens: string[]
  text: string
}

export function isMacPlatform(): boolean {
  return /mac/i.test(navigator.platform || navigator.userAgent)
}

export function normalizeShortcutParts(shortcut: string): string[] {
  return shortcut
    .split('+')
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean)
}

export function resolvePlatformShortcut(shortcut: string, isMac = isMacPlatform()): string {
  return normalizeShortcutParts(shortcut)
    .map((part) => part === 'mod' ? (isMac ? 'meta' : 'ctrl') : part)
    .join('+')
}

export function createShortcutString(keys: Set<string>): string {
  const normalizedKeys = Array.from(keys)
    .map((key) => key.trim().toLowerCase())
    .filter(Boolean)

  const modifiers = MODIFIER_ORDER.filter((modifier) => normalizedKeys.includes(modifier))
  const primaryKeys = normalizedKeys.filter((key) => !MODIFIER_KEYS.has(key))
  const primaryKey = primaryKeys[primaryKeys.length - 1]

  return [...modifiers, primaryKey].filter(Boolean).join('+')
}

export function formatShortcut(shortcut: string, isMac = isMacPlatform()): FormattedShortcut {
  const parts = normalizeShortcutParts(resolvePlatformShortcut(shortcut, isMac))
  const modifierLabels = isMac ? MAC_MODIFIER_LABELS : DEFAULT_MODIFIER_LABELS
  const displayOrder = isMac ? MAC_DISPLAY_MODIFIER_ORDER : DEFAULT_DISPLAY_MODIFIER_ORDER
  const modifiers = displayOrder
    .filter((modifier) => parts.includes(modifier))
    .map((modifier) => modifierLabels[modifier])
  const key = parts.find((part) => !MODIFIER_KEYS.has(part))
  const keyLabel = key ? formatPrimaryKey(key) : ''

  if (isMac) {
    const text = [modifiers.join(''), keyLabel].filter(Boolean).join(' ')
    return {
      platform: 'mac',
      tokens: [...modifiers, keyLabel].filter(Boolean),
      text,
    }
  }

  const tokens = [...modifiers, keyLabel].filter(Boolean)
  return {
    platform: 'default',
    tokens,
    text: tokens.join(' + '),
  }
}

function formatPrimaryKey(key: string): string {
  return KEY_LABELS[key] ?? key.toUpperCase()
}
