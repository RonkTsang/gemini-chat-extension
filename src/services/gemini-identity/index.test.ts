import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { FolderAccountHistory } from '@/domain/folder/account-history'

const selectorState = vi.hoisted(() => ({ rules: [] as { accountLink: string; avatar: string }[] }))
vi.mock('@/services/gemini-dom/selectors', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/gemini-dom/selectors')>()
  return { ...actual, geminiDomSelectors: { ...actual.geminiDomSelectors, identity: selectorState.rules } }
})

const historyState = vi.hoisted(() => ({
  history: { accounts: [] } as FolderAccountHistory,
  get: vi.fn(), remember: vi.fn(), forget: vi.fn(),
}))
vi.mock('./account-history', () => ({ folderAccountHistory: {
  get: historyState.get, remember: historyState.remember, forget: historyState.forget,
} }))

beforeEach(() => {
  selectorState.rules.splice(0, selectorState.rules.length,
    { accountLink: '#gb a[href*="accounts.google.com/SignOutOptions"][aria-label]', avatar: 'img[src][srcset]' },
    { accountLink: 'sidenav-mavatar-footer a[href*="accounts.google.com/SignOutOptions"][aria-label]', avatar: 'img.mavatar-image[src]' },
  )
  historyState.history = { accounts: [] }
  historyState.get.mockReset().mockImplementation(async () => structuredClone(historyState.history))
  historyState.remember.mockReset().mockImplementation(async (email: string, accountScopeId: string) => {
    historyState.history = { accounts: [{ email, accountScopeId, lastUsedAt: new Date().toISOString() },
      ...historyState.history.accounts.filter((account) => account.email !== email)], recentAccountScopeId: accountScopeId }
    return structuredClone(historyState.history)
  })
})

import { GeminiIdentityService } from './index'

afterEach(() => { document.body.replaceChildren(); document.documentElement.querySelector('#gb')?.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('GeminiIdentityService', () => {
  it('logs unavailable, manual and recent account states without repeating unchanged scans', async () => {
    const log = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    const service = new GeminiIdentityService()
    await service.refresh()
    await service.refresh()
    expect(log).toHaveBeenCalledExactlyOnceWith('[Folders] Account state', { status: 'unavailable', reason: 'email-not-found' })
    await service.confirmManualEmail('saved@example.com', true)
    await service.refresh()
    expect(log).toHaveBeenCalledTimes(2)
    expect(log).toHaveBeenLastCalledWith('[Folders] Account state', {
      status: 'available', source: 'manual-confirmed', selection: 'manual',
      accountScopeId: expect.any(String), fallbackReason: 'email-not-found',
    })
    const restored = new GeminiIdentityService()
    await restored.refresh()
    expect(log).toHaveBeenLastCalledWith('[Folders] Account state', {
      status: 'available', source: 'manual-confirmed', selection: 'recent',
      accountScopeId: expect.any(String), fallbackReason: 'email-not-found',
    })
    document.body.innerHTML = `<div id="gb">
      <a href="https://accounts.google.com/SignOutOptions" aria-label="Google Account one@example.com"></a>
      <a href="https://accounts.google.com/SignOutOptions" aria-label="Google Account two@example.com"></a>
    </div>`
    await restored.refresh()
    await restored.refresh()
    expect(log).toHaveBeenCalledTimes(4)
    expect(log).toHaveBeenLastCalledWith('[Folders] Account state', expect.objectContaining({ fallbackReason: 'multiple-accounts-detected' }))
  })

  it('logs automatically identified and historical selections with their sources', async () => {
    const log = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    const service = new GeminiIdentityService()
    await service.confirmManualEmail('saved@example.com', true, 'history')
    expect(log).toHaveBeenLastCalledWith('[Folders] Account state', expect.objectContaining({ source: 'manual-confirmed', selection: 'history' }))
    document.body.innerHTML = '<div id="gb"><a href="https://accounts.google.com/SignOutOptions" aria-label="Google Account observed@example.com"></a></div>'
    await service.refresh()
    await service.refresh()
    expect(log).toHaveBeenCalledTimes(2)
    expect(log).toHaveBeenLastCalledWith('[Folders] Account state', {
      status: 'available', source: 'observed', selection: undefined,
      accountScopeId: expect.any(String), fallbackReason: undefined,
    })
  })

  it('starts with the recent account when DOM selectors are missing or invalid', async () => {
    await new GeminiIdentityService().confirmManualEmail('saved@example.com', true)
    selectorState.rules[0].accountLink = '#gb a[aria-label1]'
    selectorState.rules[1].accountLink += '1'
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    // Happy DOM accepts the trailing "1" that browsers reject as invalid CSS.
    const query = document.querySelectorAll.bind(document)
    vi.spyOn(document, 'querySelectorAll').mockImplementation((selector) => {
      if (selector.endsWith(']1')) throw new DOMException('Invalid selector', 'SyntaxError')
      return query(selector)
    })
    const service = new GeminiIdentityService()
    try {
      await service.start()
      expect(service.getCurrent()).toMatchObject({
        status: 'available', identity: { email: 'saved@example.com', source: 'manual-confirmed', selection: 'recent' },
      })
      expect(warning).toHaveBeenCalledWith('[Folders] Skipping invalid account selector', selectorState.rules[1].accountLink, expect.any(Error))
    } finally {
      service.stop()
    }
  })

  it('continues to a valid account rule after an invalid selector', async () => {
    selectorState.rules[0].accountLink += '1'
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    vi.spyOn(document, 'querySelectorAll').mockImplementationOnce(() => { throw new DOMException('Invalid selector', 'SyntaxError') })
    document.body.innerHTML = '<sidenav-mavatar-footer><a href="https://accounts.google.com/SignOutOptions" aria-label="Google Account user@example.com"></a></sidenav-mavatar-footer>'
    expect(await new GeminiIdentityService().refresh()).toMatchObject({
      status: 'available', identity: { email: 'user@example.com', source: 'observed' },
    })
  })

  it('keeps an identified account available and tries another avatar rule after invalid avatar syntax', async () => {
    selectorState.rules[0].avatar += '1'
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    vi.spyOn(HTMLAnchorElement.prototype, 'querySelectorAll').mockImplementationOnce(() => { throw new DOMException('Invalid selector', 'SyntaxError') })
    document.body.innerHTML = `
      <div id="gb"><a href="https://accounts.google.com/SignOutOptions" aria-label="Google Account user@example.com"></a></div>
      <sidenav-mavatar-footer><a href="https://accounts.google.com/SignOutOptions" aria-label="Google Account user@example.com"><img class="mavatar-image" src="https://example.com/avatar.png"></a></sidenav-mavatar-footer>`
    expect(await new GeminiIdentityService().refresh()).toMatchObject({
      status: 'available', identity: { email: 'user@example.com', source: 'observed', avatarUrl: 'https://example.com/avatar.png' },
    })
  })

  it('returns email-not-found instead of throwing when no recent account or valid selectors exist', async () => {
    selectorState.rules.forEach((rule) => { rule.accountLink += '1' })
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    vi.spyOn(document, 'querySelectorAll').mockImplementation(() => { throw new DOMException('Invalid selector', 'SyntaxError') })
    expect(await new GeminiIdentityService().refresh()).toEqual({ status: 'unavailable', reason: 'email-not-found' })
  })

  it('identifies the sidebar account and avatar without a global header', async () => {
    const footer = document.createElement('sidenav-mavatar-footer')
    const link = document.createElement('a')
    link.href = 'https://accounts.google.com/SignOutOptions'
    link.setAttribute('aria-label', 'Google Account USER@example.com')
    const avatar = document.createElement('img')
    avatar.className = 'mavatar-image'
    avatar.src = 'https://example.com/avatar.png'
    link.append(avatar)
    footer.append(link)
    document.body.append(footer)

    expect(await new GeminiIdentityService().refresh()).toMatchObject({
      status: 'available',
      identity: { email: 'user@example.com', avatarUrl: avatar.src, source: 'observed' },
    })
  })

  it.each([true, false])('skips the header frame and uses the paired avatar rules (header avatar: %s)', async (hasHeaderAvatar) => {
    document.body.innerHTML = `
      <div id="gb">
        <a href="https://accounts.google.com/SignOutOptions" aria-label="Google Account user@example.com">
          <img src="https://example.com/frame.png">
          ${hasHeaderAvatar ? '<img src="https://example.com/header-avatar.png" srcset="https://example.com/header-avatar.png 1x">' : ''}
        </a>
      </div>
      <sidenav-mavatar-footer>
        <a href="https://accounts.google.com/SignOutOptions" aria-label="Google Account USER@example.com">
          <img src="https://example.com/sidebar-frame.png">
          <img class="mavatar-image" src="https://example.com/sidebar-avatar.png">
        </a>
      </sidenav-mavatar-footer>`
    expect(await new GeminiIdentityService().refresh()).toMatchObject({
      status: 'available',
      identity: { avatarUrl: `https://example.com/${hasHeaderAvatar ? 'header' : 'sidebar'}-avatar.png` },
    })
  })

  it('does not use an avatar from a link without the identified email', async () => {
    document.body.innerHTML = `
      <div id="gb">
        <a href="https://accounts.google.com/SignOutOptions" aria-label="Google Account user@example.com"><img src="https://example.com/frame.png"></a>
        <a href="https://accounts.google.com/SignOutOptions" aria-label="Google Account"><img src="https://example.com/unrelated.png" srcset="https://example.com/unrelated.png 1x"></a>
      </div>`
    expect(await new GeminiIdentityService().refresh()).toMatchObject({
      status: 'available', identity: { email: 'user@example.com', avatarUrl: undefined },
    })
  })

  it.each([
    ['USER@example.com', 'available'],
    ['other@example.com', 'ambiguous'],
  ])('handles header and sidebar account candidates with sidebar email %s', async (email, status) => {
    const header = document.createElement('div')
    header.id = 'gb'
    const footer = document.createElement('sidenav-mavatar-footer')
    for (const [surface, candidate] of [[header, 'user@example.com'], [footer, email]] as const) {
      const link = document.createElement('a')
      link.href = 'https://accounts.google.com/SignOutOptions'
      link.setAttribute('aria-label', `Google Account ${candidate}`)
      surface.append(link)
    }
    document.body.append(header, footer)

    const result = await new GeminiIdentityService().refresh()
    expect(result).toMatchObject(status === 'available'
      ? { status, identity: { email: 'user@example.com', source: 'observed' } }
      : { status, reason: 'multiple-accounts-detected' })
  })

  it('uses the observed Gemini account over a manual session fallback', async () => {
    const service = new GeminiIdentityService()
    const manual = await service.confirmManualEmail('manual@example.com', true)
    const header = document.createElement('div'); header.id = 'gb'
    const link = document.createElement('a'); link.href = 'https://accounts.google.com/SignOutOptions'; link.setAttribute('aria-label', 'Google Account observed@example.com')
    header.append(link); document.body.append(header)
    const result = await service.refresh()
    expect(result).toMatchObject({ status: 'available', identity: { email: 'observed@example.com', source: 'observed' } })
    expect(manual.status === 'available' && result.status === 'available' && manual.identity.accountScopeId !== result.identity.accountScopeId).toBe(true)
  })

  it('uses the same account scope for manual confirmation and automatic identification', async () => {
    const service = new GeminiIdentityService()
    const manual = await service.confirmManualEmail(' USER@example.com ', true)
    const header = document.createElement('div'); header.id = 'gb'
    const link = document.createElement('a'); link.href = 'https://accounts.google.com/SignOutOptions'; link.setAttribute('aria-label', 'Google Account user@example.com')
    header.append(link); document.body.append(header)
    const observed = await service.refresh()
    expect(manual.status).toBe('available')
    expect(observed.status).toBe('available')
    if (manual.status !== 'available' || observed.status !== 'available') throw new Error('Account scope unavailable')
    expect(manual.identity.accountScopeId).toBe(observed.identity.accountScopeId)
    expect(observed.identity.source).toBe('observed')
  })

  it('notifies subscribers when the active account avatar changes', async () => {
    const footer = document.createElement('sidenav-mavatar-footer')
    const link = document.createElement('a')
    link.href = 'https://accounts.google.com/SignOutOptions'
    link.setAttribute('aria-label', 'Google Account user@example.com')
    const avatar = document.createElement('img')
    avatar.className = 'mavatar-image'
    avatar.src = 'https://example.com/avatar.png'
    link.append(avatar); footer.append(link); document.body.append(footer)
    const service = new GeminiIdentityService()
    const listener = vi.fn()
    service.subscribe(listener)
    await service.refresh()
    avatar.src = 'https://example.com/new-avatar.png'
    await service.refresh()
    expect(listener).toHaveBeenCalledTimes(3)
    expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({
      identity: expect.objectContaining({ avatarUrl: avatar.src }),
    }))
  })

  it('does not notify subscribers when only resolvedAt changes', async () => {
    const header = document.createElement('div'); header.id = 'gb'
    const link = document.createElement('a'); link.href = 'https://accounts.google.com/SignOutOptions'; link.setAttribute('aria-label', 'Google Account user@example.com')
    header.append(link); document.body.append(header)
    const service = new GeminiIdentityService(); let notifications = 0
    service.subscribe(() => { notifications += 1 })
    await service.refresh(); await service.refresh()
    expect(notifications).toBe(2) // Initial snapshot plus one stable identity transition.
  })

  it('deduplicates every account candidate and accepts a full normalized email only once', async () => {
    const header = document.createElement('div'); header.id = 'gb'
    for (const label of ['Google Account USER@example.com', 'Google Account user@example.com']) {
      const link = document.createElement('a')
      link.href = 'https://accounts.google.com/SignOutOptions'
      link.setAttribute('aria-label', label)
      header.append(link)
    }
    document.body.append(header)

    const result = await new GeminiIdentityService().refresh()
    expect(result).toMatchObject({ status: 'available', identity: { email: 'user@example.com', source: 'observed' } })
  })

  it('fails closed when WebCrypto is unavailable instead of deriving a weaker account scope', async () => {
    vi.stubGlobal('crypto', undefined)
    const result = await new GeminiIdentityService().confirmManualEmail('user@example.com', true)
    expect(result).toEqual({ status: 'unavailable', reason: 'surface-not-ready' })
  })

  it('refreshes after header replacement and the shared URL-change event without unstable duplicate notifications', async () => {
    const firstHeader = document.createElement('div'); firstHeader.id = 'gb'
    const firstLink = document.createElement('a'); firstLink.href = 'https://accounts.google.com/SignOutOptions'; firstLink.setAttribute('aria-label', 'Google Account first@example.com')
    firstHeader.append(firstLink); document.body.append(firstHeader)
    const service = new GeminiIdentityService()
    const notifications: string[] = []
    service.subscribe((result) => notifications.push(result.status === 'available' ? result.identity.email : result.status))
    await service.start()

    const replacement = document.createElement('div'); replacement.id = 'gb'
    const replacementLink = document.createElement('a'); replacementLink.href = 'https://accounts.google.com/SignOutOptions'; replacementLink.setAttribute('aria-label', 'Google Account second@example.com')
    replacement.append(replacementLink); firstHeader.replaceWith(replacement)
    window.dispatchEvent(new CustomEvent('gem-ext:urlchange'))
    await new Promise((resolve) => setTimeout(resolve, 0))
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(service.getCurrent()).toMatchObject({ status: 'available', identity: { email: 'second@example.com' } })
    expect(notifications.filter((email) => email === 'second@example.com')).toHaveLength(1)
    service.stop()
  })
  it('remembers a manual email and restores it after a new page session', async () => {
    const original = new GeminiIdentityService()
    const manual = await original.confirmManualEmail(' USER@example.com ', true)
    const restored = await new GeminiIdentityService().refresh()
    expect(restored).toMatchObject({ status: 'available', identity: { email: 'user@example.com', source: 'manual-confirmed', selection: 'recent' } })
    expect(manual.status === 'available' && restored.status === 'available' && manual.identity.accountScopeId).toBe(restored.status === 'available' && restored.identity.accountScopeId)
    expect(historyState.remember).toHaveBeenCalledTimes(1)
  })

  it('records automatic accounts and gives an observed account priority over the last account', async () => {
    await new GeminiIdentityService().confirmManualEmail('old@example.com', true)
    document.body.innerHTML = '<div id="gb"><a href="https://accounts.google.com/SignOutOptions" aria-label="Google Account current@example.com"></a></div>'
    const result = await new GeminiIdentityService().refresh()
    expect(result).toMatchObject({ status: 'available', identity: { email: 'current@example.com', source: 'observed' } })
    expect(historyState.history.accounts.map((account) => account.email)).toEqual(['current@example.com', 'old@example.com'])
    expect(historyState.history.recentAccountScopeId).toBe(result.status === 'available' && result.identity.accountScopeId)
  })

  it('requires a choice when history exists without a recent account and persists that choice', async () => {
    await new GeminiIdentityService().confirmManualEmail('history@example.com', true)
    historyState.history.recentAccountScopeId = undefined
    const service = new GeminiIdentityService()
    expect(await service.refresh()).toMatchObject({ status: 'unavailable' })
    expect(await service.confirmManualEmail('history@example.com', true, 'history')).toMatchObject({
      status: 'available', identity: { email: 'history@example.com', selection: 'history' },
    })
    expect(historyState.history.recentAccountScopeId).toBeDefined()
  })

  it('keeps open pages on their own account when another page changes the last account', async () => {
    const first = new GeminiIdentityService()
    await first.confirmManualEmail('first@example.com', true)
    const second = new GeminiIdentityService()
    await second.confirmManualEmail('second@example.com', true)
    expect(await first.refresh()).toMatchObject({ status: 'available', identity: { email: 'first@example.com' } })
    expect(await second.refresh()).toMatchObject({ status: 'available', identity: { email: 'second@example.com' } })
    expect(await new GeminiIdentityService().refresh()).toMatchObject({ status: 'available', identity: { email: 'second@example.com' } })
    expect(historyState.remember).toHaveBeenCalledTimes(2)
  })

  it('ignores a stale history read after a newer manual selection', async () => {
    let finish!: (history: FolderAccountHistory) => void
    historyState.get.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
    const service = new GeminiIdentityService()
    const pending = service.refresh()
    await vi.waitFor(() => expect(finish).toBeDefined())
    await service.confirmManualEmail('selected@example.com', true)
    finish({ accounts: [{ email: 'stale@example.com', accountScopeId: 'stale-account-0001', lastUsedAt: new Date().toISOString() }], recentAccountScopeId: 'stale-account-0001' })
    await pending
    expect(service.getCurrent()).toMatchObject({ status: 'available', identity: { email: 'selected@example.com' } })
  })

  it('reports failed persistence without selecting an unsaved manual account', async () => {
    historyState.remember.mockRejectedValueOnce(new Error('Storage unavailable'))
    const service = new GeminiIdentityService()
    await expect(service.confirmManualEmail('user@example.com', true)).rejects.toThrow('Storage unavailable')
    expect(service.getCurrent().status).toBe('unavailable')
    expect(await service.refresh()).toMatchObject({ status: 'unavailable' })
  })

  it('keeps an automatically identified account usable if remembering it fails', async () => {
    historyState.remember.mockRejectedValueOnce(new Error('Storage unavailable'))
    document.body.innerHTML = '<div id="gb"><a href="https://accounts.google.com/SignOutOptions" aria-label="Google Account user@example.com"></a></div>'
    expect(await new GeminiIdentityService().refresh()).toMatchObject({ status: 'available', identity: { source: 'observed' } })
  })

  it('does not publish a manual selection from passive refreshes before persistence completes', async () => {
    let finish!: (history: FolderAccountHistory) => void
    historyState.remember.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
    const service = new GeminiIdentityService()
    const confirmation = service.confirmManualEmail('user@example.com', true)
    await vi.waitFor(() => expect(finish).toBeDefined())
    const refresh = service.refresh()
    expect(service.getCurrent().status).toBe('unavailable')
    finish({ accounts: [] })
    await confirmation
    await refresh
    expect(service.getCurrent()).toMatchObject({ status: 'available', identity: { email: 'user@example.com' } })
  })

})
