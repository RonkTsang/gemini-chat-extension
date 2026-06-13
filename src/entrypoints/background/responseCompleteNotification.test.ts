import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { browser } from 'wxt/browser'

import { setResponseCompleteNotificationEnabled } from '@/services/responseCompleteNotificationSettings'
import {
  RESPONSE_COMPLETE_NOTIFICATION_GET_READINESS_MESSAGE,
  RESPONSE_COMPLETE_NOTIFICATION_REQUEST_PERMISSION_MESSAGE,
  RESPONSE_COMPLETE_NOTIFICATION_TEST_MESSAGE,
} from '@/types/runtime-messages'
import {
  resetResponseCompleteNotificationBackgroundForTest,
  startResponseCompleteNotificationBackground,
} from './responseCompleteNotification'

type RuntimeMessageListener = (message: unknown, sender: {
  tab?: {
    id?: number
    windowId?: number
  }
}) => unknown

type WebRequestCompletedListener = (details: {
  requestId: string
  tabId: number
  statusCode: number
  timeStamp: number
}) => void

let runtimeMessageListener: RuntimeMessageListener | null = null
let webRequestCompletedListener: WebRequestCompletedListener | null = null
let permissionAddedListener: (() => void) | null = null
let permissionRemovedListener: (() => void) | null = null
let notificationClickListener: ((notificationId: string) => void) | null = null

vi.mock('wxt/browser', () => ({
  browser: {
    runtime: {
      getURL: vi.fn((path: string) => `extension://${path}`),
      getPlatformInfo: vi.fn(() => Promise.resolve({
        os: 'win',
        arch: 'x86-64',
        nacl_arch: 'x86-64',
      })),
      onMessage: {
        addListener: vi.fn((listener: RuntimeMessageListener) => {
          runtimeMessageListener = listener
        }),
      },
    },
    permissions: {
      contains: vi.fn(),
      request: vi.fn(),
      onAdded: {
        addListener: vi.fn((listener: () => void) => {
          permissionAddedListener = listener
        }),
      },
      onRemoved: {
        addListener: vi.fn((listener: () => void) => {
          permissionRemovedListener = listener
        }),
      },
    },
    notifications: {
      create: vi.fn(() => Promise.resolve('')),
      clear: vi.fn(() => Promise.resolve(true)),
      getPermissionLevel: vi.fn(),
      onClicked: {
        addListener: vi.fn((listener: (notificationId: string) => void) => {
          notificationClickListener = listener
        }),
      },
      onClosed: {
        addListener: vi.fn(),
      },
    },
    webRequest: {
      onCompleted: {
        addListener: vi.fn((listener: WebRequestCompletedListener) => {
          webRequestCompletedListener = listener
        }),
        removeListener: vi.fn((listener: WebRequestCompletedListener) => {
          if (webRequestCompletedListener === listener) {
            webRequestCompletedListener = null
          }
        }),
      },
    },
    windows: {
      update: vi.fn(() => Promise.resolve()),
    },
    tabs: {
      get: vi.fn(() => Promise.resolve({ id: 7, windowId: 9 })),
      sendMessage: vi.fn(),
      update: vi.fn(() => Promise.resolve()),
    },
  },
}))

const permissionsContainsMock = vi.mocked(
  browser.permissions.contains as unknown as (permissions: unknown) => Promise<boolean>,
)
const permissionsRequestMock = vi.mocked(
  browser.permissions.request as unknown as (permissions: unknown) => Promise<boolean>,
)
const getPermissionLevelMock = vi.mocked(
  browser.notifications.getPermissionLevel as unknown as () => Promise<'granted' | 'denied'>,
)
const createNotificationMock = vi.mocked(browser.notifications.create)
const clearNotificationMock = vi.mocked(browser.notifications.clear)
const webRequestAddListenerMock = vi.mocked(browser.webRequest.onCompleted.addListener)
const webRequestRemoveListenerMock = vi.mocked(browser.webRequest.onCompleted.removeListener)
const tabsSendMessageMock = vi.mocked(
  browser.tabs.sendMessage as unknown as (tabId: number, message: unknown) => Promise<unknown>,
)
const tabsGetMock = vi.mocked(
  browser.tabs.get as unknown as (tabId: number) => Promise<{ id: number; windowId: number }>,
)
const tabsUpdateMock = vi.mocked(browser.tabs.update)
const windowsUpdateMock = vi.mocked(browser.windows.update)

async function sendRuntimeMessage(message: unknown, sender: Parameters<RuntimeMessageListener>[1] = {}) {
  if (!runtimeMessageListener) {
    throw new Error('runtime message listener was not registered')
  }
  return runtimeMessageListener(message, sender)
}

async function flushPromises(): Promise<void> {
  await Promise.resolve()
  await new Promise(resolve => setTimeout(resolve, 0))
}

function completeStream(overrides: Partial<Parameters<WebRequestCompletedListener>[0]> = {}): void {
  webRequestCompletedListener?.({
    requestId: 'request-1',
    tabId: 7,
    statusCode: 200,
    timeStamp: 123,
    ...overrides,
  })
}

describe('responseCompleteNotification background V2', () => {
  beforeEach(async () => {
    resetResponseCompleteNotificationBackgroundForTest()
    runtimeMessageListener = null
    webRequestCompletedListener = null
    permissionAddedListener = null
    permissionRemovedListener = null
    notificationClickListener = null
    vi.clearAllMocks()
    await setResponseCompleteNotificationEnabled(false)
    permissionsContainsMock.mockResolvedValue(true)
    permissionsRequestMock.mockResolvedValue(true)
    getPermissionLevelMock.mockResolvedValue('granted')
    tabsGetMock.mockResolvedValue({ id: 7, windowId: 9 })
    tabsSendMessageMock.mockResolvedValue({
      suppressed: false,
      title: 'Chat title',
      message: 'Response summary',
      responseType: 'text',
    })
    startResponseCompleteNotificationBackground()
    await flushPromises()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('requests all optional Chrome permissions together', async () => {
    const response = await sendRuntimeMessage({
      type: RESPONSE_COMPLETE_NOTIFICATION_REQUEST_PERMISSION_MESSAGE,
    })

    expect(permissionsRequestMock).toHaveBeenCalledWith({
      permissions: ['notifications', 'webRequest'],
    })
    expect(response).toEqual({ ok: true })
  })

  it('requests only notification permission on Firefox', async () => {
    vi.stubEnv('FIREFOX', 'true')

    const response = await sendRuntimeMessage({
      type: RESPONSE_COMPLETE_NOTIFICATION_REQUEST_PERMISSION_MESSAGE,
    })

    expect(permissionsRequestMock).toHaveBeenCalledWith({
      permissions: ['notifications'],
    })
    expect(response).toEqual({ ok: true })
  })

  it('registers and removes one listener as the setting changes', async () => {
    await setResponseCompleteNotificationEnabled(true)
    await flushPromises()
    await setResponseCompleteNotificationEnabled(true)
    await flushPromises()

    expect(webRequestAddListenerMock).toHaveBeenCalledTimes(1)
    expect(webRequestCompletedListener).not.toBeNull()

    await setResponseCompleteNotificationEnabled(false)
    await flushPromises()

    expect(webRequestRemoveListenerMock).toHaveBeenCalledTimes(1)
    expect(webRequestCompletedListener).toBeNull()
  })

  it('creates a rich notification when StreamGenerate completes successfully', async () => {
    await setResponseCompleteNotificationEnabled(true)
    await flushPromises()

    completeStream()
    await flushPromises()

    expect(tabsSendMessageMock).toHaveBeenCalledWith(7, {
      type: 'response-complete-notification:get-content',
    })
    expect(createNotificationMock).toHaveBeenCalledWith('response-complete:7:123', {
      type: 'basic',
      iconUrl: 'extension:///icon/512.png',
      title: 'Chat title',
      message: 'Response summary',
    })
  })

  it('ignores unsuccessful requests and requests without a tab', async () => {
    await setResponseCompleteNotificationEnabled(true)
    await flushPromises()

    completeStream({ statusCode: 500 })
    completeStream({ tabId: -1 })
    await flushPromises()

    expect(tabsSendMessageMock).not.toHaveBeenCalled()
    expect(createNotificationMock).not.toHaveBeenCalled()
  })

  it('suppresses notification while the Gemini page is foregrounded', async () => {
    await setResponseCompleteNotificationEnabled(true)
    await flushPromises()
    tabsSendMessageMock.mockResolvedValue({
      suppressed: true,
      title: 'Chat title',
      message: 'Response summary',
      responseType: 'text',
    })

    completeStream()
    await flushPromises()

    expect(createNotificationMock).not.toHaveBeenCalled()
  })

  it('creates a fallback notification when content is unavailable', async () => {
    await setResponseCompleteNotificationEnabled(true)
    await flushPromises()
    tabsSendMessageMock.mockRejectedValue(new Error('content script unavailable'))

    completeStream()
    await flushPromises()

    expect(createNotificationMock).toHaveBeenCalledWith('response-complete:7:123', {
      type: 'basic',
      iconUrl: 'extension:///icon/512.png',
      title: 'Gemini finished replying',
      message: 'Your response is ready.',
    })
  })

  it('stops listening when required permissions are revoked', async () => {
    await setResponseCompleteNotificationEnabled(true)
    await flushPromises()
    permissionsContainsMock.mockResolvedValue(false)

    permissionRemovedListener?.()
    await flushPromises()

    expect(webRequestRemoveListenerMock).toHaveBeenCalledTimes(1)
  })

  it('reports missing required permissions', async () => {
    await setResponseCompleteNotificationEnabled(true)
    permissionsContainsMock.mockResolvedValue(false)

    const response = await sendRuntimeMessage({
      type: RESPONSE_COMPLETE_NOTIFICATION_GET_READINESS_MESSAGE,
    })

    expect(response).toEqual({
      ok: false,
      readiness: 'missing-extension-permission',
    })
  })

  it('keeps test notifications and click-to-focus behavior', async () => {
    await setResponseCompleteNotificationEnabled(true)
    await sendRuntimeMessage({
      type: RESPONSE_COMPLETE_NOTIFICATION_TEST_MESSAGE,
      payload: { timestamp: 789 },
    }, { tab: { id: 7, windowId: 9 } })

    expect(createNotificationMock).toHaveBeenCalledWith('test:7:789', expect.objectContaining({
      title: 'Gemini Power Kit notification test',
    }))

    notificationClickListener?.('test:7:789')
    await flushPromises()

    expect(windowsUpdateMock).toHaveBeenCalledWith(9, { focused: true })
    expect(tabsUpdateMock).toHaveBeenCalledWith(7, { active: true })
    expect(clearNotificationMock).toHaveBeenCalledWith('test:7:789')
  })

  it('reacts when required permissions are added', async () => {
    await setResponseCompleteNotificationEnabled(true)
    permissionsContainsMock.mockResolvedValue(false)
    permissionRemovedListener?.()
    await flushPromises()
    permissionsContainsMock.mockResolvedValue(true)

    permissionAddedListener?.()
    await flushPromises()

    expect(webRequestCompletedListener).not.toBeNull()
  })
})
