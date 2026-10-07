import { folderAccountHistory } from './account-history'
import { folderAccountEmailSchema } from '@/domain/folder/account-history'
import { GEM_EXT_EVENTS } from '@/common/event'
import { geminiDomSelectors } from '@/services/gemini-dom/selectors'

export type GeminiIdentitySource = 'observed' | 'manual-confirmed'

export interface GeminiUserIdentity {
  email: string
  avatarUrl?: string
  accountScopeId: string
  source: GeminiIdentitySource
  resolvedAt: string
  selection?: 'manual' | 'history' | 'recent'
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

function queryIdentityElements<T extends Element>(root: ParentNode, selector: string): T[] {
  try {
    return Array.from(root.querySelectorAll<T>(selector))
  } catch (error) {
    if (!(error instanceof Error) || error.name !== 'SyntaxError') throw error
    console.warn('[Folders] Skipping invalid account selector', selector, error)
    return []
  }
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
  const candidates = geminiDomSelectors.identity.flatMap((rule) =>
    queryIdentityElements<HTMLAnchorElement>(document, rule.accountLink).map((link) => ({
      link, avatarSelector: rule.avatar, emails: extractEmails(link.getAttribute('aria-label')),
    })),
  )
  if (!candidates.length) {
    return Promise.resolve({
      status: 'unavailable',
      reason: 'email-not-found',
    })
  }

  const emails = Array.from(new Set(candidates.flatMap((candidate) => candidate.emails)))
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

  let avatarUrl: string | undefined
  for (const candidate of candidates) {
    if (!candidate.emails.includes(emails[0])) continue
    const avatar = queryIdentityElements<HTMLImageElement>(candidate.link, candidate.avatarSelector)
      .find((image) => image.getAttribute('src')?.trim())
    if (!avatar) continue
    avatarUrl = avatar.src
    break
  }

  return computeAccountScopeId(emails[0]).then((accountScopeId) => accountScopeId ? ({
    status: 'available' as const,
    identity: {
      email: emails[0],
      avatarUrl,
      accountScopeId,
      source: 'observed' as const,
      resolvedAt: nowIso(),
    },
  }) : ({ status: 'unavailable' as const, reason: 'surface-not-ready' as const }))
}

export class GeminiIdentityService {
  private sessionAccount?: { email: string; selection: 'manual' | 'history' | 'recent' }
  private refreshVersion = 0
  private pendingConfirmation?: Promise<GeminiIdentityResult>
  private lastRememberedScope?: string
  private lastRememberAttempt?: { scope: string; at: number }
  private rememberObservedOnRefresh = false
  private lastLoggedAccountState?: string
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
    ++this.refreshVersion
    this.observer?.disconnect()
    this.observer = null
    window.removeEventListener('focus', this.handleWindowSignal)
    window.removeEventListener('popstate', this.handleWindowSignal)
    window.removeEventListener(GEM_EXT_EVENTS.URL_CHANGE, this.handleWindowSignal)
  }

  async refresh(persistSelection = false): Promise<GeminiIdentityResult> {
    if (this.pendingConfirmation && !persistSelection) {
      // DOM observers must not publish a selected email before it is saved.
      return this.pendingConfirmation.then(() => this.current, () => this.current)
    }
    const version = ++this.refreshVersion
    const observed = await extractObservedIdentityFromDom()
    if (version !== this.refreshVersion) return this.current
    if (observed.status === 'available') {
      const scope = observed.identity.accountScopeId
      const focused = this.rememberObservedOnRefresh
      const shouldRemember = persistSelection || focused || this.lastRememberedScope !== scope
      this.rememberObservedOnRefresh = false
      const attemptedRecently = this.lastRememberAttempt?.scope === scope
        && Date.now() - this.lastRememberAttempt.at < 30_000
      if (shouldRemember && (!attemptedRecently || persistSelection || focused)) {
        this.lastRememberAttempt = { scope, at: Date.now() }
        try {
          await folderAccountHistory.remember(observed.identity.email, scope)
          this.lastRememberedScope = scope
        } catch (error) {
          if (persistSelection) throw error
          // An unavailable account directory must not disable an identified account.
          console.warn('[Folders] Could not remember the identified account', error)
        }
      }
      if (version !== this.refreshVersion) return this.current
      this.sessionAccount = { email: observed.identity.email, selection: 'recent' }
      this.setCurrent(observed)
      return observed
    }

    let selected = this.sessionAccount
    if (!selected) {
      try {
        const history = await folderAccountHistory.get()
        if (version !== this.refreshVersion) return this.current
        const recent = history.accounts.find((account) => account.accountScopeId === history.recentAccountScopeId)
        if (recent) selected = { email: recent.email, selection: 'recent' }
      } catch (error) {
        // Manual input remains usable if reading remembered accounts fails.
        console.warn('[Folders] Could not restore the last account', error)
      }
    }
    if (version !== this.refreshVersion) return this.current
    if (selected) {
      const accountScopeId = await computeAccountScopeId(selected.email)
      if (version !== this.refreshVersion) return this.current
      if (!accountScopeId) {
        const unavailable: GeminiIdentityResult = { status: 'unavailable', reason: 'surface-not-ready' }
        this.setCurrent(unavailable)
        return unavailable
      }
      if (persistSelection) {
        await folderAccountHistory.remember(selected.email, accountScopeId)
        if (version !== this.refreshVersion) return this.current
      }
      this.sessionAccount = selected
      const next: GeminiIdentityResult = {
        status: 'available',
        identity: { email: selected.email, accountScopeId, source: 'manual-confirmed',
          selection: selected.selection, resolvedAt: nowIso() },
      }
      this.setCurrent(next, observed)
      return next
    }
    this.setCurrent(observed)
    return observed
  }

  async confirmManualEmail(email: string, confirmation: true, selection: 'manual' | 'history' = 'manual'): Promise<GeminiIdentityResult> {
    if (!confirmation) throw new Error('Manual email confirmation is required')
    const parsed = folderAccountEmailSchema.safeParse(email)
    if (!parsed.success) throw new Error('Invalid email address')
    const previous = this.sessionAccount
    const selected = { email: parsed.data, selection }
    this.sessionAccount = selected
    const pending = this.refresh(true)
    this.pendingConfirmation = pending
    try {
      return await pending
    } catch (error) {
      if (this.sessionAccount === selected) this.sessionAccount = previous
      throw error
    } finally {
      if (this.pendingConfirmation === pending) {
        this.pendingConfirmation = undefined
        if (this.started) void this.scheduleRefresh()
      }
    }
  }

  clearManualEmail(): void {
    this.sessionAccount = undefined
    void this.refresh()
  }

  private handleWindowSignal = (event: Event): void => {
    if (event.type === 'focus') this.rememberObservedOnRefresh = true
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

  private setCurrent(next: GeminiIdentityResult, observed?: GeminiIdentityResult): void {
    const stable = (value: GeminiIdentityResult) => value.status === 'available'
      ? `${value.status}:${value.identity.accountScopeId}:${value.identity.source}:${value.identity.selection ?? ''}:${value.identity.avatarUrl ?? ''}`
      : `${value.status}:${value.reason}`
    const changed = stable(next) !== stable(this.current)
    this.current = next
    const details = next.status === 'available'
      ? {
        status: next.status,
        source: next.identity.source,
        selection: next.identity.selection,
        accountScopeId: next.identity.accountScopeId,
        fallbackReason: next.identity.source === 'manual-confirmed' && observed?.status !== 'available'
          ? observed?.reason : undefined,
      }
      : { status: next.status, reason: next.reason }
    const logState = JSON.stringify(details)
    if (logState !== this.lastLoggedAccountState) {
      this.lastLoggedAccountState = logState
      console.info('[Folders] Account state', details)
    }
    if (!changed) return
    for (const listener of this.listeners) {
      listener(next)
    }
  }
}

export const geminiIdentityService = new GeminiIdentityService()
