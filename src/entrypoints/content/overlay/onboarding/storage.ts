import { z } from 'zod'
import { browser } from 'wxt/browser'

const stateSchema = z.enum(['pending', 'shown', 'excluded'])
export type OnboardingState = z.infer<typeof stateSchema>

async function withLock<T>(work: () => Promise<T>): Promise<T | null> {
  if (!navigator.locks) return null
  try {
    return await navigator.locks.request(`gpk:${browser.runtime.id}:onboarding`, work)
  } catch (error) {
    console.warn('[Onboarding] Could not access onboarding state:', error)
    return null
  }
}

export async function initializeOnboarding(): Promise<OnboardingState | null> {
  return withLock(async () => {
    const stored = await browser.storage.local.get(['onboardingState', 'lastSeenVersion'])
    const parsed = stateSchema.safeParse(stored.onboardingState)
    if (parsed.success) return parsed.data
    const state: OnboardingState = typeof stored.lastSeenVersion === 'string'
      ? 'excluded'
      : 'pending'
    await browser.storage.local.set({ onboardingState: state })
    return state
  })
}

export async function claimOnboarding(canStart: () => boolean): Promise<boolean> {
  return (await withLock(async () => {
    const stored = await browser.storage.local.get('onboardingState')
    if (stored.onboardingState !== 'pending' || !canStart()) return false
    // A pending tour takes precedence over release notes for this first visit.
    await browser.storage.local.set({
      onboardingState: 'shown',
      lastSeenVersion: browser.runtime.getManifest().version,
    })
    return true
  })) === true
}
