import { beforeEach, describe, expect, it, vi } from 'vitest'

const { local, runtime } = vi.hoisted(() => ({
  local: { get: vi.fn(), set: vi.fn() },
  runtime: { id: 'test-extension', getManifest: () => ({ version: '0.13.0' }) },
}))
vi.mock('wxt/browser', () => ({ browser: { storage: { local }, runtime } }))

import { claimOnboarding, initializeOnboarding } from './storage'

let stored: Record<string, unknown>
beforeEach(() => {
  stored = {}
  vi.clearAllMocks()
  local.get.mockImplementation(async () => ({ ...stored }))
  local.set.mockImplementation(async (values: Record<string, unknown>) => { Object.assign(stored, values) })
  let tail = Promise.resolve<unknown>(undefined)
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: { request: (_name: string, work: () => Promise<unknown>) => {
      const result = tail.then(work)
      tail = result.catch(() => undefined)
      return result
    } },
  })
})

describe('onboarding eligibility', () => {
  it('preserves first-use eligibility after the version is recorded', async () => {
    expect(await initializeOnboarding()).toBe('pending')
    stored.lastSeenVersion = '0.13.0'
    expect(await initializeOnboarding()).toBe('pending')
  })

  it('excludes existing users and preserves their version', async () => {
    stored.lastSeenVersion = '0.12.7'
    expect(await initializeOnboarding()).toBe('excluded')
    expect(stored.lastSeenVersion).toBe('0.12.7')
    expect(await claimOnboarding(() => true)).toBe(false)
  })

  it('excludes existing users with empty or invalid states without changing their version', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    for (const value of [undefined, null, '', 'unexpected', false, 0, {}]) {
      stored = { onboardingState: value, lastSeenVersion: '0.12.0' }
      expect(await initializeOnboarding()).toBe('excluded')
      expect(await claimOnboarding(() => true)).toBe(false)
      expect(stored).toEqual({ onboardingState: 'excluded', lastSeenVersion: '0.12.0' })
    }
    expect(warning).not.toHaveBeenCalled()
    warning.mockRestore()
  })

  it('keeps users without a version eligible when the stored state is empty or invalid', async () => {
    for (const value of [null, '', 'unexpected', false, 0, {}]) {
      stored = { onboardingState: value }
      expect(await initializeOnboarding()).toBe('pending')
      expect(stored).toEqual({ onboardingState: 'pending' })
    }
  })

  it('grants only one of two concurrent foreground requests', async () => {
    stored.onboardingState = 'pending'
    const winners = await Promise.all([claimOnboarding(() => true), claimOnboarding(() => true)])
    expect(winners).toEqual([true, false])
    expect(stored).toMatchObject({ onboardingState: 'shown', lastSeenVersion: '0.13.0' })
  })

  it('keeps the tour pending when the requesting page loses focus', async () => {
    stored.onboardingState = 'pending'
    expect(await claimOnboarding(() => false)).toBe(false)
    expect(stored.onboardingState).toBe('pending')
  })

  it('does not interpret read errors as a new install or show after write errors', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    local.get.mockRejectedValueOnce(new Error('unavailable'))
    expect(await initializeOnboarding()).toBeNull()
    expect(local.set).not.toHaveBeenCalled()
    stored.onboardingState = 'pending'
    local.set.mockRejectedValueOnce(new Error('unavailable'))
    expect(await claimOnboarding(() => true)).toBe(false)
    warning.mockRestore()
  })

  it('does not start without Web Locks', async () => {
    Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined })
    expect(await initializeOnboarding()).toBeNull()
    expect(await claimOnboarding(() => true)).toBe(false)
    expect(local.set).not.toHaveBeenCalled()
  })
})
