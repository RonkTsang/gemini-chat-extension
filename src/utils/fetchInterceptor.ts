import { observeResponseBody, type ResponseBodySource } from './observeResponseBody'

export interface FetchRequestSnapshot {
  readonly url: string
  readonly method: string
}

export interface FetchInterceptorConfig {
  matches: (request: FetchRequestSnapshot) => boolean
  onRequest?: (request: FetchRequestSnapshot) => void
  /** Each subscriber owns a clone; the page's response remains untouched. */
  onResponse: (response: Response, request: FetchRequestSnapshot) => void | Promise<void>
  /** Optional fallback using the page's own successful body read. */
  onConsumedBody?: (text: string, response: Response, request: FetchRequestSnapshot, source: ResponseBodySource) => void | Promise<void>
  onBodyRead?: (request: FetchRequestSnapshot, source: ResponseBodySource) => void
  maxBodyBytes?: number
  onError?: (error: unknown) => void
}

interface Registration {
  config: FetchInterceptorConfig
  active: boolean
}

interface FetchPatch {
  originalFetch: typeof fetch
  monitoredFetch: typeof fetch
  state: { active: boolean }
}

/** Main-world Fetch observation, installed once while there are subscribers. */
export class FetchInterceptor {
  private registrations = new Set<Registration>()
  private patch: FetchPatch | null = null

  intercept(config: FetchInterceptorConfig): () => void {
    const registration: Registration = { config, active: true }
    this.registrations.add(registration)
    if (!this.patch) this.start()

    return () => {
      registration.active = false
      this.registrations.delete(registration)
      if (!this.registrations.size) this.stop()
    }
  }

  get count(): number {
    return this.registrations.size
  }

  get ownsFetch(): boolean {
    return this.patch !== null && window.fetch === this.patch.monitoredFetch
  }

  private start(): void {
    const originalFetch = window.fetch
    const state = { active: true }
    const interceptor = this
    const monitoredFetch: typeof fetch = function (this: Window, input, init) {
      const promise = originalFetch.call(this, input, init)
      if (!state.active) return promise

      const subscribers: Registration[] = []
      let request: FetchRequestSnapshot
      try {
        const url = input instanceof Request ? input.url : String(input)
        request = {
          url: new URL(url, window.location.href).href,
          method: (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase(),
        }
      } catch (error) {
        for (const registration of interceptor.registrations) {
          interceptor.reportError(registration, error)
        }
        return promise
      }

      for (const registration of interceptor.registrations) {
        try {
          if (registration.config.matches(request)) subscribers.push(registration)
        } catch (error) {
          interceptor.reportError(registration, error)
        }
      }
      if (!subscribers.length) return promise

      for (const registration of subscribers) {
        if (!registration.active || !state.active) continue
        try {
          registration.config.onRequest?.(request)
        } catch (error) {
          interceptor.reportError(registration, error)
        }
      }

      void promise.then((response) => {
        if (!state.active) return
        for (const registration of subscribers) {
          if (!registration.active) continue
          try {
            const result = registration.config.onResponse(response.clone(), request)
            void Promise.resolve(result).catch((error: unknown) => {
              interceptor.reportError(registration, error)
            })
          } catch (error) {
            interceptor.reportError(registration, error)
          }
        }
        // Cloning tees and replaces response.body, so observe the final native stream.
        const bodySubscribers = subscribers.filter((registration) => registration.active && registration.config.onConsumedBody)
        if (bodySubscribers.length) {
          observeResponseBody(response, {
            maxBytes: Math.max(...bodySubscribers.map((registration) => registration.config.maxBodyBytes ?? 1024 * 1024)),
            isActive: () => state.active && bodySubscribers.some((registration) => registration.active),
            onRead: (source) => {
              for (const registration of bodySubscribers) {
                if (!registration.active) continue
                try { registration.config.onBodyRead?.(request, source) }
                catch (error) { interceptor.reportError(registration, error) }
              }
            },
            onBody: (text, source) => {
              for (const registration of bodySubscribers) {
                if (!registration.active) continue
                if (text.length > (registration.config.maxBodyBytes ?? 1024 * 1024)) {
                  interceptor.reportError(registration, new RangeError('Observed response body exceeds the subscriber size limit'))
                  continue
                }
                try {
                  const result = registration.config.onConsumedBody?.(text, response, request, source)
                  void Promise.resolve(result).catch((error: unknown) => interceptor.reportError(registration, error))
                } catch (error) { interceptor.reportError(registration, error) }
              }
            },
            onError: (error) => {
              for (const registration of bodySubscribers) interceptor.reportError(registration, error)
            },
          })
        }
      }, (error: unknown) => {
        if (!state.active) return
        for (const registration of subscribers) interceptor.reportError(registration, error)
      })
      return promise
    }

    this.patch = { originalFetch, monitoredFetch, state }
    window.fetch = monitoredFetch
  }

  private stop(): void {
    if (!this.patch) return
    this.patch.state.active = false
    // A later wrapper may still reference ours; leave that wrapper installed and ours inert.
    if (window.fetch === this.patch.monitoredFetch) window.fetch = this.patch.originalFetch
    this.patch = null
  }

  private reportError(registration: Registration, error: unknown): void {
    if (!registration.active) return
    try {
      if (registration.config.onError) registration.config.onError(error)
      else console.warn('[FetchInterceptor] Observation failed:', error)
    } catch (handlerError) {
      console.warn('[FetchInterceptor] Error handler failed:', handlerError)
    }
  }
}

export const fetchInterceptor = new FetchInterceptor()
