import { t } from './i18n'
import { PRODUCT_NAME } from '@/common/config'

/**
 * Pre-defined cache keys for critical core strings needed after extension context invalidation
 * Only includes global/core keys used by the extension infrastructure
 * Business modules should define their own keys and use preCache() to cache them
 * 
 * @example
 * // In a business module:
 * const MY_MODULE_KEYS = { KEY1: 'module.key1', KEY2: 'module.key2' } as const
 * i18nCache.preCache([{ key: MY_MODULE_KEYS.KEY1 }, { key: MY_MODULE_KEYS.KEY2 }])
 */
export const CACHE_KEYS = {
  // Extension update dialog (used when extension context is invalidated)
  EXTENSION_UPDATED_TITLE: 'extension.updated.title',
  EXTENSION_UPDATED_BODY: 'extension.updated.body',
  RELOAD_PAGE: 'extension.reload_page',
  LATER: 'common.later'
} as const

/**
 * Manager for caching i18n strings before extension context becomes invalid
 * This is necessary because browser.i18n APIs will throw errors after invalidation
 * 
 * Uses a unified cache system for both pre-defined and dynamic keys
 */
class I18nCacheManager {
  private cache: Map<string, string> = new Map()
  private initialized = false
  
  /**
   * Initialize cache on content script startup
   * Must be called before extension context might be invalidated
   * Pre-caches only core/global strings (e.g., extension update dialog)
   * Business modules should call preCache() separately for their own keys
   */
  initialize(): void {
    // Skip if already initialized
    if (this.initialized) {
      console.debug('[I18nCache] Already initialized, skipping')
      return
    }
    
    console.log('[I18nCache] Initializing core keys...')
    
    // Cache core extension strings with proper substitution handling
    try {
      // Extension update dialog strings (critical for context invalidation scenarios)
      this.cache.set(CACHE_KEYS.EXTENSION_UPDATED_TITLE, t(CACHE_KEYS.EXTENSION_UPDATED_TITLE))
      this.cache.set(CACHE_KEYS.EXTENSION_UPDATED_BODY, t(CACHE_KEYS.EXTENSION_UPDATED_BODY, PRODUCT_NAME))
      this.cache.set(CACHE_KEYS.RELOAD_PAGE, t(CACHE_KEYS.RELOAD_PAGE))
      this.cache.set(CACHE_KEYS.LATER, t(CACHE_KEYS.LATER))
      
      console.log('[I18nCache] Core initialization complete with', this.cache.size, 'keys')
    } catch (error) {
      // If i18n fails, use English fallbacks
      console.warn('[I18nCache] Failed to fetch i18n, using fallbacks:', error)
      
      // Extension update dialog fallbacks
      this.cache.set(CACHE_KEYS.EXTENSION_UPDATED_TITLE, 'Extension Updated')
      this.cache.set(
        CACHE_KEYS.EXTENSION_UPDATED_BODY,
        `${PRODUCT_NAME} has been updated. Please reload this page to continue using the extension.`
      )
      this.cache.set(CACHE_KEYS.RELOAD_PAGE, 'Reload Page')
      this.cache.set(CACHE_KEYS.LATER, 'Later')
    }
    
    this.initialized = true
  }
  
  /**
   * Check if cache has been initialized
   */
  isReady(): boolean {
    return this.initialized
  }
  
  /**
   * Clear the cache (mainly for testing)
   */
  clear(): void {
    this.cache.clear()
    this.initialized = false
    console.log('[I18nCache] Cache cleared')
  }
  
  /**
   * Get cached i18n string, with automatic fetch and cache on first access
   * If not cached, attempts to fetch from i18n and cache it
   * Safe to call even after extension context invalidation (returns cached value or key as fallback)
   * 
   * @param key - i18n key to fetch
   * @param substitution - optional substitution for the i18n string (string, number, or string array)
   * @returns cached or fetched i18n string, or the key itself as fallback
   * 
   * @example
   * // Simple usage
   * const text = i18nCache.get('common.save')
   * 
   * // With substitutions
   * const greeting = i18nCache.get('user.greeting', userName)
   * const itemsList = i18nCache.get('items.list', ['item1', 'item2'])
   * const count = i18nCache.get('count.value', 42)
   * 
   * // Using pre-defined keys (with autocomplete)
   * const title = i18nCache.get(CACHE_KEYS.EXTENSION_UPDATED_TITLE)
   */
  get(key: string, substitution?: string | number | string[]): string {
    const cacheKey = this.makeCacheKey(key, substitution)
    
    // Return cached value if available
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!
    }
    
    // Try to fetch from i18n and cache it
    try {
      const value = t(key, substitution)
      this.cache.set(cacheKey, value)
      console.debug('[I18nCache] Cached new key:', cacheKey)
      return value
    } catch (error) {
      // Extension context invalidated or key not found
      console.warn('[I18nCache] Failed to get i18n string for key:', key, error)
      // Cache the key itself as fallback to avoid repeated attempts
      this.cache.set(cacheKey, key)
      return key
    }
  }
  
  /**
   * Pre-cache multiple i18n keys at once
   * Useful for batch caching before extension context might be invalidated
   * Includes fallback handling for critical strings
   * 
   * @param keys - array of key configurations to cache
   * @param fallbacks - optional fallback values mapped by i18n key (without substitutions)
   * 
   * @example
   * i18nCache.preCache([
   *   { key: 'common.save' },
   *   { key: 'user.greeting', substitution: userName },
   *   { key: 'items.count', substitution: 42 },
   *   { key: 'items.list', substitution: ['item1', 'item2'] }
   * ])
   * 
   * // With fallbacks for critical strings
   * i18nCache.preCache(
   *   [{ key: 'extension.updated.title' }],
   *   { 'extension.updated.title': 'Extension Updated' }
   * )
   */
  preCache(
    keys: Array<{ key: string; substitution?: string | number | string[] }>,
    fallbacks?: Record<string, string>
  ): void {
    let successCount = 0
    let failCount = 0
    
    for (const { key, substitution } of keys) {
      const cacheKey = this.makeCacheKey(key, substitution)
      
      // Skip if already cached
      if (this.cache.has(cacheKey)) {
        successCount++
        continue
      }
      
      try {
        const value = t(key, substitution)
        this.cache.set(cacheKey, value)
        successCount++
      } catch (error) {
        // Use fallback if provided (fallbacks are already interpolated final strings)
        // Otherwise cache the key itself as last resort
        const fallbackValue = fallbacks?.[key] ?? key
        this.cache.set(cacheKey, fallbackValue)
        failCount++
        console.warn('[I18nCache] Failed to fetch key, using fallback:', key)
      }
    }
    
    console.log(`[I18nCache] Pre-cached ${keys.length} keys (${successCount} success, ${failCount} fallback)`)
  }
  
  /**
   * Check if a specific key is cached
   * 
   * @param key - i18n key
   * @param substitution - optional substitution (must match what was used when caching)
   * @returns true if the key is cached
   */
  has(key: string, substitution?: string | number | string[]): boolean {
    const cacheKey = this.makeCacheKey(key, substitution)
    return this.cache.has(cacheKey)
  }
  
  /**
   * Create a unique cache key from i18n key and substitution
   */
  private makeCacheKey(key: string, substitution?: string | number | string[]): string {
    if (substitution === undefined) {
      return key
    }
    return `${key}::${JSON.stringify(substitution)}`
  }
}

// Export singleton instance
export const i18nCache = new I18nCacheManager()

