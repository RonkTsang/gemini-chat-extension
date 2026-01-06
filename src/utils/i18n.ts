import { i18n as wxtI18n } from '#i18n'
import { isExtensionContextValid } from './contextMonitor'

export function t(id: string, substitutions?: string | string[] | number) {
  // If context is invalid, return the key itself as fallback
  // The i18nCache should be used for post-invalidation scenarios
  if (!isExtensionContextValid()) {
    console.warn('[i18n] Extension context invalid, returning key:', id)
    return id
  }

  try {
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
  } catch (error) {
    // If any error occurs (e.g., context invalidated during call), return key
    console.warn('[i18n] Error getting translation:', error)
    return id
  }
}

export function getCurrentLocale() {
  // Check context validity before accessing extension APIs
  if (!isExtensionContextValid()) {
    return navigator.language
  }
  
  try {
    return (globalThis as any).browser?.i18n?.getUILanguage?.() ?? navigator.language
  } catch {
    return navigator.language
  }
}


