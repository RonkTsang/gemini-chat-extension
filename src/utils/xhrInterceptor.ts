/**
 * XHR Interceptor Utility
 *
 * A singleton utility for intercepting XMLHttpRequest in the browser.
 * Designed to work in main-world context (page context) to capture API requests.
 *
 * @usage
 * ```typescript
 * import { xhrInterceptor } from '@/utils/xhrInterceptor'
 *
 * xhrInterceptor.intercept({
 *   urlPattern: /api\/data/,
 *   onResponse: (url, responseText, status, request) => {
 *     console.log('Captured response from:', url)
 *     console.log('Request method:', request.method)
 *     console.log('Request body:', request.body)
 *   }
 * })
 *
 * xhrInterceptor.start()
 * ```
 */

// ==================== Types ====================

/**
 * Snapshot of the request information
 */
export interface XHRRequestSnapshot {
  /** Request URL */
  url: string
  /** HTTP Method (GET, POST, etc.) */
  method: string
  /** Request body (for POST/PUT) */
  body?: any
}

/**
 * Configuration for XHR interception
 */
export interface XHRInterceptorConfig {

  /** URL pattern to match (string or RegExp) */
  urlPattern: string | RegExp

  /** Callback when response is received */
  onResponse?: (url: string, responseText: string, status: number, request: XHRRequestSnapshot) => void

  /** Callback when request is sent */
  onRequest?: (url: string, method: string, data?: string) => void

  /** Callback when error occurs */
  onError?: (error: Error) => void
}

/**
 * Internal interceptor registration
 */
interface InterceptorRegistration {
  id: string
  config: XHRInterceptorConfig
  active: boolean
}

// ==================== XHRInterceptor Class ====================

/**
 * XHR Interceptor Singleton
 *
 * Patches XMLHttpRequest to intercept requests matching specified patterns.
 * Multiple interceptors can be registered for different URL patterns.
 */
class XHRInterceptor {
  private interceptors: Map<string, InterceptorRegistration> = new Map()
  private isPatched: boolean = false
  private originalXHR: typeof XMLHttpRequest | null = null

  /**
   * Register a new interceptor
   *
   * @param config Interceptor configuration
   * @returns Function to unregister this interceptor
   */
  intercept(config: XHRInterceptorConfig): () => void {
    const id = this.generateId()

    const registration: InterceptorRegistration = {
      id,
      config,
      active: true,
    }

    this.interceptors.set(id, registration)

    // Auto-start if not already patched
    if (!this.isPatched) {
      this.start()
    }

    // Return unregister function
    return () => {
      const reg = this.interceptors.get(id)
      if (reg) {
        reg.active = false
        this.interceptors.delete(id)

        // Auto-stop if no active interceptors
        if (this.interceptors.size === 0) {
          this.stop()
        }
      }
    }
  }

  /**
   * Start intercepting XHR requests
   * Patches the global XMLHttpRequest object
   */
  start(): void {
    if (this.isPatched) {
      console.warn('[XHRInterceptor] Already started')
      return
    }

    // Save original XMLHttpRequest
    this.originalXHR = window.XMLHttpRequest

    const self = this
    const OriginalXHR = this.originalXHR

    // Proxy Function
    const XHRProxy = function (this: XMLHttpRequest) {
      const xhr = new OriginalXHR()

      let requestUrl: string = ''
      let requestMethod: string = ''
      let requestData: any

      // Patch open method
      const originalOpen = xhr.open
      xhr.open = function (method: string, url: string | URL, ...args: any[]) {
        requestUrl = typeof url === 'string' ? url : url.toString()
        requestMethod = method
        return originalOpen.apply(xhr, [method, url, ...args] as any)
      }

      // Patch send method
      const originalSend = xhr.send
      xhr.send = function (data?: Document | XMLHttpRequestBodyInit | null) {
        requestData = data
        return originalSend.apply(xhr, [data] as any)
      }

      // Use addEventListener to capture response without overriding onreadystatechange
      xhr.addEventListener('readystatechange', () => {
        if (xhr.readyState === 4) {
          try {
            if (xhr.status >= 200 && xhr.status < 300) {
              let responseText = ''

              if (xhr.responseType === '' || xhr.responseType === 'text') {
                responseText = xhr.responseText
              } else if (xhr.responseType === 'json') {
                responseText = JSON.stringify(xhr.response)
              }

              if (responseText) {
                self.notifyResponse(requestUrl, responseText, xhr.status, {
                  url: requestUrl,
                  method: requestMethod,
                  body: requestData,
                })
              }
            }
          } catch (error) {
            self.notifyError(error as Error)
          }
        }
      })

      return xhr
    } as any

    // Restore prototype chain
    XHRProxy.prototype = OriginalXHR.prototype

    // Restore static properties
    for (const prop in OriginalXHR) {
      if (Object.prototype.hasOwnProperty.call(OriginalXHR, prop)) {
        (XHRProxy as any)[prop] = (OriginalXHR as any)[prop]
      }
    }

    window.XMLHttpRequest = XHRProxy

    this.isPatched = true
    console.log('[XHRInterceptor] Started successfully')
  }

  /**
   * Stop intercepting and restore original XMLHttpRequest
   */
  stop(): void {
    if (!this.isPatched || !this.originalXHR) {
      console.log('[XHRInterceptor] Not started')
      return
    }

    // Restore original XMLHttpRequest
    window.XMLHttpRequest = this.originalXHR
    this.isPatched = false
    this.originalXHR = null

    console.log('[XHRInterceptor] Stopped')
  }

  /**
   * Clear all interceptors
   */
  clear(): void {
    this.interceptors.clear()
  }

  /**
   * Get number of active interceptors
   */
  get count(): number {
    return Array.from(this.interceptors.values()).filter(r => r.active).length
  }

  // ==================== Private Methods ====================

  /**
   * Notify all matching interceptors of a request
   */
  private notifyRequest(url: string, method: string, data?: string): void {
    for (const registration of this.interceptors.values()) {
      if (!registration.active) continue

      try {
        if (this.matchesPattern(url, registration.config.urlPattern)) {
          registration.config.onRequest?.(url, method, data)
        }
      } catch (error) {
        registration.config.onError?.(error as Error)
      }
    }
  }

  /**
   * Notify all matching interceptors of a response
   */
  private notifyResponse(
    url: string,
    responseText: string,
    status: number,
    request: XHRRequestSnapshot
  ): void {
    for (const registration of this.interceptors.values()) {
      if (!registration.active) continue

      try {
        if (this.matchesPattern(url, registration.config.urlPattern)) {
          registration.config.onResponse?.(url, responseText, status, request)
        }
      } catch (error) {
        registration.config.onError?.(error as Error)
      }
    }
  }

  /**
   * Notify all interceptors of an error
   */
  private notifyError(error: Error): void {
    for (const registration of this.interceptors.values()) {
      if (!registration.active) continue
      registration.config.onError?.(error)
    }
  }

  /**
   * Check if URL matches the pattern
   */
  private matchesPattern(url: string, pattern: string | RegExp): boolean {
    if (typeof pattern === 'string') {
      return url.includes(pattern)
    }
    return pattern.test(url)
  }

  /**
   * Generate unique ID for interceptor
   */
  private generateId(): string {
    return `interceptor_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }
}

// ==================== Singleton Export ====================

/**
 * Singleton instance of XHRInterceptor
 */
export const xhrInterceptor = new XHRInterceptor()
