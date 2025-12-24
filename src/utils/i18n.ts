import { i18n as wxtI18n } from '#i18n'

export function t(id: string, substitutions?: string | string[] | number) {
  // Prefer WXT i18n if available (typesafe, supports plural helpers)
  if (wxtI18n && typeof wxtI18n.t === 'function') {
    if (substitutions === undefined) return (wxtI18n.t as any)(id)
    if (typeof substitutions === 'number') return (wxtI18n.t as any)(id, substitutions)
    if (Array.isArray(substitutions)) return (wxtI18n.t as any)(id, substitutions)
    // Single string substitution → wrap as array for `$1`
    return wxtI18n.t(id, [substitutions])
  }
  // Fallback to browser.i18n: accepts string|string[] for substitutions; pluralization is manual
  const subs = typeof substitutions === 'number' ? String(substitutions) : substitutions
  return (globalThis as any).browser?.i18n?.getMessage?.(id, subs) || id
}

export function getCurrentLocale() {
  return (globalThis as any).browser?.i18n?.getUILanguage?.() ?? navigator.language
}


