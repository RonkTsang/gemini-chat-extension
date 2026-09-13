import { afterEach, describe, expect, it, vi } from 'vitest'

import { GeminiIdentityService } from './index'

afterEach(() => { document.body.replaceChildren(); document.documentElement.querySelector('#gb')?.remove(); vi.unstubAllGlobals() })

describe('GeminiIdentityService', () => {
  it('uses the observed Gemini account over a manual session fallback', async () => {
    const service = new GeminiIdentityService()
    await service.confirmManualEmail('manual@example.com', true)
    const header = document.createElement('div'); header.id = 'gb'
    const link = document.createElement('a'); link.href = 'https://accounts.google.com/SignOutOptions'; link.setAttribute('aria-label', 'Google Account observed@example.com')
    header.append(link); document.body.append(header)
    const result = await service.refresh()
    expect(result).toMatchObject({ status: 'available', identity: { email: 'observed@example.com', source: 'observed' } })
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
})
