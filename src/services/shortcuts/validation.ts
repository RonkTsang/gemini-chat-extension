import { shortcutActions, type ShortcutAction } from './definitions'
import { createShortcutString, normalizeShortcutParts, resolvePlatformShortcut } from './format'

export type ShortcutValidationReason =
  | 'missingModifier'
  | 'singleLetter'
  | 'specialKey'
  | 'conflict'

export type ShortcutValidationResult =
  | { ok: true, shortcut: string }
  | { ok: false, reason: ShortcutValidationReason, conflictAction?: ShortcutAction }

const MODIFIER_KEYS = new Set(['alt', 'ctrl', 'control', 'meta', 'mod', 'shift'])

export const shortcutRecordingBlacklist = [
  'backspace',
  'tab',
  'clear',
  'enter',
  'return',
  'esc',
  'escape',
  'space',
  'up',
  'down',
  'left',
  'right',
  'arrowup',
  'arrowdown',
  'arrowleft',
  'arrowright',
  'pageup',
  'pagedown',
  'del',
  'delete',
]

const SPECIAL_KEYS = new Set(shortcutRecordingBlacklist)
const SINGLE_KEY_SHORTCUTS = new Set(['slash'])

export function validateRecordedShortcut(
  keys: Set<string>,
  currentAction: ShortcutAction,
  existingBindings: Record<ShortcutAction, string | null>,
): ShortcutValidationResult {
  const shortcut = createShortcutString(keys)
  const parts = normalizeShortcutParts(shortcut)
  const modifiers = parts.filter((part) => MODIFIER_KEYS.has(part))
  const primaryKeys = parts.filter((part) => !MODIFIER_KEYS.has(part))
  const primaryKey = primaryKeys[primaryKeys.length - 1]

  if (!primaryKey) {
    return { ok: false, reason: 'missingModifier' }
  }

  if (SPECIAL_KEYS.has(primaryKey)) {
    return { ok: false, reason: 'specialKey' }
  }

  if (modifiers.length === 0 && primaryKey.length === 1) {
    return { ok: false, reason: 'singleLetter' }
  }

  if (modifiers.length === 0 && !SINGLE_KEY_SHORTCUTS.has(primaryKey)) {
    return { ok: false, reason: 'missingModifier' }
  }

  for (const action of shortcutActions) {
    if (action === currentAction) {
      continue
    }
    if (
      existingBindings[action]
      && resolvePlatformShortcut(existingBindings[action]) === resolvePlatformShortcut(shortcut)
    ) {
      return {
        ok: false,
        reason: 'conflict',
        conflictAction: action,
      }
    }
  }

  return {
    ok: true,
    shortcut,
  }
}
