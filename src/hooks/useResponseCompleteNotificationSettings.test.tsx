import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  getAudioEnabledMock,
  getEnabledMock,
  getForegroundOnlyMock,
  sendMessageMock,
  setAudioEnabledMock,
  setEnabledMock,
  setForegroundOnlyMock,
  watchAudioMock,
  watchEnabledMock,
  watchForegroundOnlyMock,
} = vi.hoisted(() => ({
  getAudioEnabledMock: vi.fn(),
  getEnabledMock: vi.fn(),
  getForegroundOnlyMock: vi.fn(),
  sendMessageMock: vi.fn(),
  setAudioEnabledMock: vi.fn(),
  setEnabledMock: vi.fn(),
  setForegroundOnlyMock: vi.fn(),
  watchAudioMock: vi.fn(),
  watchEnabledMock: vi.fn(),
  watchForegroundOnlyMock: vi.fn(),
}))

vi.mock('wxt/browser', () => ({
  browser: {
    runtime: {
      sendMessage: sendMessageMock,
    },
    permissions: {
      contains: vi.fn(),
      request: vi.fn(),
    },
  },
}))

vi.mock('@/services/responseCompleteNotificationSettings', () => ({
  enableResponseCompleteNotification: {
    watch: watchEnabledMock,
  },
  enableResponseCompleteNotificationAudio: {
    watch: watchAudioMock,
  },
  responseCompleteNotificationForegroundOnly: {
    watch: watchForegroundOnlyMock,
  },
  getResponseCompleteNotificationAudioEnabled: getAudioEnabledMock,
  getResponseCompleteNotificationAudioPermissionRequest: vi.fn(() => ({ permissions: ['offscreen'] })),
  getResponseCompleteNotificationEnabled: getEnabledMock,
  getResponseCompleteNotificationForegroundOnly: getForegroundOnlyMock,
  getResponseCompleteNotificationPermissionRequest: vi.fn(() => ({ permissions: ['notifications'] })),
  setResponseCompleteNotificationAudioEnabled: setAudioEnabledMock,
  setResponseCompleteNotificationEnabled: setEnabledMock,
  setResponseCompleteNotificationForegroundOnly: setForegroundOnlyMock,
}))

vi.mock('@/utils/i18n', () => ({
  getCurrentLocale: () => 'en',
  t: (id: string) => id,
}))

type HookResult = ReturnType<
  typeof import('./useResponseCompleteNotificationSettings')['useResponseCompleteNotificationSettings']
>

let root: Root
let container: HTMLDivElement
let latestResult: HookResult | null = null
let useResponseCompleteNotificationSettings: () => HookResult

function HookHarness() {
  latestResult = useResponseCompleteNotificationSettings()
  return null
}

async function renderHook() {
  await act(async () => {
    root.render(<HookHarness />)
    await flushPromises()
  })
}

function getLatestResult(): HookResult {
  if (!latestResult) {
    throw new Error('hook did not render')
  }
  return latestResult
}

function flushPromises(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0))
}

function createDeferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve
  })

  return {
    promise,
    resolve,
  }
}

describe('useResponseCompleteNotificationSettings', () => {
  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()
    ;(globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean
    }).IS_REACT_ACT_ENVIRONMENT = true
    getEnabledMock.mockResolvedValue(true)
    getAudioEnabledMock.mockResolvedValue(false)
    getForegroundOnlyMock.mockResolvedValue(true)
    setEnabledMock.mockResolvedValue(undefined)
    setAudioEnabledMock.mockResolvedValue(undefined)
    setForegroundOnlyMock.mockResolvedValue(undefined)
    watchEnabledMock.mockReturnValue(() => undefined)
    watchAudioMock.mockReturnValue(() => undefined)
    watchForegroundOnlyMock.mockReturnValue(() => undefined)
    sendMessageMock.mockResolvedValue({
      ok: true,
      readiness: 'allowed',
      audioPermissionAvailable: true,
    })
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    latestResult = null
    useResponseCompleteNotificationSettings = (
      await import('./useResponseCompleteNotificationSettings')
    ).useResponseCompleteNotificationSettings
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  it('does not enter setting pending state while sending test notifications', async () => {
    const testNotification = createDeferred<{ ok: boolean; readiness: 'allowed' }>()
    sendMessageMock.mockImplementation((message: { type: string }) => {
      if (message.type === 'response-complete-notification:test') {
        return testNotification.promise
      }

      return Promise.resolve({
        ok: true,
        readiness: 'allowed',
        audioPermissionAvailable: true,
      })
    })
    await renderHook()

    let sendPromise!: Promise<void>
    await act(async () => {
      sendPromise = getLatestResult().sendTestNotification()
      await Promise.resolve()
    })

    expect(getLatestResult().isPending).toBe(false)

    await act(async () => {
      testNotification.resolve({ ok: true, readiness: 'allowed' })
      await sendPromise
    })

    expect(getLatestResult().isPending).toBe(false)
  })
})
