import { GEM_EXT_EVENTS } from '@/common/event'
import { geminiDomSelectors, queryFirstMatchingElement } from '@/services/gemini-dom/selectors'

export type GeminiIdentitySource = 'observed' | 'manual-confirmed'

export interface GeminiUserIdentity {
  email: string
  avatarUrl?: string
  accountScopeId: string
  source: GeminiIdentitySource
  resolvedAt: string
}

export type GeminiIdentityResult =
  | { status: 'available'; identity: GeminiUserIdentity }
  | { status: 'unavailable'; reason: 'signed-out' | 'surface-not-ready' | 'email-not-found' }
  | { status: 'ambiguous'; reason: 'multiple-accounts-detected' }

type Listener = (result: GeminiIdentityResult) => void

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi

function nowIso(): string {
  return new Date().toISOString()
}

function normalizeEmail(email: string): string {
  return email.normalize('NFKC').trim().toLocaleLowerCase('en-US')
}

function extractEmails(text: string | null | undefined): string[] {
  if (!text) return []
  return Array.from(new Set((text.match(EMAIL_PATTERN) ?? []).map(normalizeEmail)))
}

async function computeAccountScopeId(email: string): Promise<string | undefined> {
  const normalizedEmail = normalizeEmail(email)
  const payload = `gpk-folders-v1:${normalizedEmail}`
  if (globalThis.crypto?.subtle && globalThis.TextEncoder) {
    try {
      const digest = await globalThis.crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(payload),
      )
      const bytes = Array.from(new Uint8Array(digest))
      return bytes.map((byte) => byte.toString(16).padStart(2, '0')).join('')
    } catch {
      // fall through to a stable readable scope id
    }
  }
  return undefined
}

function extractObservedIdentityFromDom(): Promise<GeminiIdentityResult> {
  const header = queryFirstMatchingElement(
    [document],
    geminiDomSelectors.identity.globalHeader,
  )
  if (!header) {
    return Promise.resolve({
      status: 'unavailable',
      reason: 'surface-not-ready',
    })
  }

  const links = geminiDomSelectors.identity.activeAccountLink.flatMap((selector) =>
    Array.from(header.querySelectorAll<HTMLAnchorElement>(selector)),
  )
  if (!links.length) {
    return Promise.resolve({
      status: 'unavailable',
      reason: 'email-not-found',
    })
  }

  const emails = Array.from(new Set(links.flatMap((link) => extractEmails(link.getAttribute('aria-label')))))
  if (emails.length === 0) {
    return Promise.resolve({
      status: 'unavailable',
      reason: 'email-not-found',
    })
  }
  if (emails.length > 1) {
    return Promise.resolve({
      status: 'ambiguous',
      reason: 'multiple-accounts-detected',
    })
  }

  const accountLink = links.find((link) => extractEmails(link.getAttribute('aria-label')).includes(emails[0]))
  const avatarElement = queryFirstMatchingElement(
    accountLink ? [accountLink] : [],
    geminiDomSelectors.identity.activeAccountAvatar,
  ) as HTMLImageElement | null

  return computeAccountScopeId(emails[0]).then((accountScopeId) => accountScopeId ? ({
    status: 'available' as const,
    identity: {
      email: emails[0],
      avatarUrl: avatarElement?.src || undefined,
      accountScopeId,
      source: 'observed' as const,
      resolvedAt: nowIso(),
    },
  }) : ({ status: 'unavailable' as const, reason: 'surface-not-ready' as const }))
}

export class GeminiIdentityService {
  private manualEmail: string | null = null
  private current: GeminiIdentityResult = {
    status: 'unavailable',
    reason: 'surface-not-ready',
  }
  private listeners = new Set<Listener>()
  private observer: MutationObserver | null = null
  private started = false
  private refreshQueued = false

  getCurrent(): GeminiIdentityResult {
    return this.current
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    listener(this.current)
    return () => {
      this.listeners.delete(listener)
    }
  }

  async start(): Promise<void> {
    if (this.started) return
    this.started = true
    await this.refresh()

    this.observer = new MutationObserver(() => {
      void this.scheduleRefresh()
    })
    // Observe the document root so a Gemini header replacement cannot leave us
    // subscribed to a detached #gb subtree.
    this.observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['aria-label', 'src'],
    })
    window.addEventListener('focus', this.handleWindowSignal)
    window.addEventListener('popstate', this.handleWindowSignal)
    window.addEventListener(GEM_EXT_EVENTS.URL_CHANGE, this.handleWindowSignal)
  }

  stop(): void {
    if (!this.started) return
    this.started = false
    this.observer?.disconnect()
    this.observer = null
    window.removeEventListener('focus', this.handleWindowSignal)
    window.removeEventListener('popstate', this.handleWindowSignal)
    window.removeEventListener(GEM_EXT_EVENTS.URL_CHANGE, this.handleWindowSignal)
  }

  async refresh(): Promise<GeminiIdentityResult> {
    const observed = await extractObservedIdentityFromDom()
    if (observed.status === 'available') {
      this.manualEmail = null
      this.setCurrent(observed)
      return observed
    }
    if (this.manualEmail) {
      const accountScopeId = await computeAccountScopeId(this.manualEmail)
      if (!accountScopeId) {
        const unavailable: GeminiIdentityResult = { status: 'unavailable', reason: 'surface-not-ready' }
        this.setCurrent(unavailable)
        return unavailable
      }
      const next: GeminiIdentityResult = {
        status: 'available',
        identity: {
          email: this.manualEmail,
          accountScopeId,
          source: 'manual-confirmed',
          resolvedAt: nowIso(),
        },
      }
      this.setCurrent(next)
      return next
    }

    this.setCurrent(observed)
    return observed
  }

  async confirmManualEmail(email: string, confirmation: true): Promise<GeminiIdentityResult> {
    if (!confirmation) {
      throw new Error('Manual email confirmation is required')
    }

    const normalized = normalizeEmail(email)
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(normalized)) {
      throw new Error('Invalid email address')
    }

    this.manualEmail = normalized
    return await this.refresh()
  }

  clearManualEmail(): void {
    this.manualEmail = null
    void this.refresh()
  }

  private handleWindowSignal = (): void => {
    void this.scheduleRefresh()
  }

  private async scheduleRefresh(): Promise<void> {
    if (!this.started || this.refreshQueued) return
    this.refreshQueued = true
    queueMicrotask(async () => {
      this.refreshQueued = false
      if (!this.started) return
      await this.refresh()
    })
  }

  private setCurrent(next: GeminiIdentityResult): void {
    const stable = (value: GeminiIdentityResult) => value.status === 'available'
      ? `${value.status}:${value.identity.accountScopeId}:${value.identity.source}`
      : `${value.status}:${value.reason}`
    const changed = stable(next) !== stable(this.current)
    this.current = next
    if (!changed) return
    for (const listener of this.listeners) {
      listener(next)
    }
  }
}

export const geminiIdentityService = new GeminiIdentityService()
