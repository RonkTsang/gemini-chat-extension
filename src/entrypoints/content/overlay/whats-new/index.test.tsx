import { act, StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReleaseNote } from './config'
import WhatsNew from './index'

const { local, runtime, notes } = vi.hoisted(() => ({
  local: { get: vi.fn(), set: vi.fn() },
  runtime: { id: 'test-extension', getManifest: () => ({ version: '0.15.0' }) },
  notes: [] as ReleaseNote[],
}))

vi.mock('wxt/browser', () => ({ browser: { storage: { local }, runtime } }))
vi.mock('./config', () => ({ CURRENT_RELEASE_NOTES: notes }))
vi.mock('./WhatsNewToast', () => ({
  WhatsNewToast: ({ features }: { features: ReleaseNote[] }) =>
    <div>{features.map(note => note.titleKey).join(', ')}</div>,
}))

describe("What's New across versions", () => {
  let stored: Record<string, unknown>
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    notes.push(
      { introducedInVersion: '0.14.0', titleKey: 'multiAsk', descriptionKey: 'multiAskDescription' },
      { titleKey: 'newFeature', descriptionKey: 'newFeatureDescription' },
    )
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    vi.stubGlobal('requestIdleCallback', (callback: () => void) => setTimeout(callback, 0))
    vi.stubGlobal('cancelIdleCallback', clearTimeout)
    const pendingLocks = new Map<string, Promise<unknown>>()
    vi.stubGlobal('navigator', {
      locks: {
        request: (name: string, work: () => Promise<unknown>) => {
          const result = (pendingLocks.get(name) ?? Promise.resolve()).then(work)
          pendingLocks.set(name, result.catch(() => undefined))
          return result
        },
      },
    })
    stored = { onboardingState: 'excluded' }
    local.get.mockImplementation(async () => ({ ...stored }))
    local.set.mockImplementation(async (values: Record<string, unknown>) => { Object.assign(stored, values) })
    container = document.createElement('div')
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    notes.length = 0
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  async function render(onboardingFinished = false) {
    act(() => {
      root.render(<StrictMode><WhatsNew onboardingFinished={onboardingFinished} /></StrictMode>)
    })
    await act(async () => { await vi.runAllTimersAsync() })
  }

  it.each([
    [undefined, 'multiAsk, newFeature'],
    ['', 'multiAsk, newFeature'],
    ['0.13.0', 'multiAsk, newFeature'],
    ['0.14.8', 'newFeature'],
    ['0.15.0', ''],
  ])('filters each note independently for lastSeenVersion=%s', async (lastSeenVersion, expected) => {
    stored.lastSeenVersion = lastSeenVersion
    await render()
    expect(container.textContent).toBe(expected)
    expect(stored.lastSeenVersion).toBe('0.15.0')
    expect(local.set).toHaveBeenCalledTimes(lastSeenVersion === '0.15.0' ? 0 : 1)
  })

  it('records the upgrade even when every configured note has already been seen', async () => {
    stored.lastSeenVersion = '0.14.0'
    notes.pop()
    await render()
    expect(container.textContent).toBe('')
    expect(stored.lastSeenVersion).toBe('0.15.0')
  })

  it('shows the carried note after a new installation finishes onboarding', async () => {
    stored.onboardingState = 'shown'
    await render()
    expect(container.textContent).toBe('')
    expect(local.set).not.toHaveBeenCalled()

    await render(true)
    expect(container.textContent).toBe('multiAsk, newFeature')
    expect(stored.lastSeenVersion).toBe('0.15.0')
  })

  it('announces an upgrade once when two overlays check concurrently', async () => {
    stored.lastSeenVersion = '0.14.0'
    act(() => {
      root.render(
        <>
          <WhatsNew onboardingFinished />
          <WhatsNew onboardingFinished />
        </>,
      )
    })
    await act(async () => { await vi.runAllTimersAsync() })
    expect(container.textContent).toBe('newFeature')
    expect(local.set).toHaveBeenCalledTimes(1)
  })
})
