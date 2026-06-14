import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { browser } from 'wxt/browser'

import {
  getResponseCompleteNotificationEnabled,
  setResponseCompleteNotificationAudioEnabled,
  setResponseCompleteNotificationEnabled,
} from '@/services/responseCompleteNotificationSettings'
import {
  RESPONSE_COMPLETE_NOTIFICATION_AUDIO_REQUEST_PERMISSION_MESSAGE,
  RESPONSE_COMPLETE_NOTIFICATION_GET_READINESS_MESSAGE,
  RESPONSE_COMPLETE_NOTIFICATION_REQUEST_PERMISSION_MESSAGE,
  RESPONSE_COMPLETE_NOTIFICATION_TEST_MESSAGE,
} from '@/types/runtime-messages'
import {
  resetDeepResearchNotificationStateForTest,
} from './deepResearchNotificationState'
import {
  resetResponseCompleteNotificationBackgroundForTest,
  startResponseCompleteNotificationBackground,
} from './responseCompleteNotification'
import { resetResponseCompleteNotificationAudioForTest } from './responseCompleteNotificationAudio'

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
  url: string
}) => void

type WebRequestBeforeRequestListener = (details: {
  requestId: string
  tabId: number
  timeStamp: number
  url: string
}) => void

let runtimeMessageListener: RuntimeMessageListener | null = null
let webRequestCompletedListener: WebRequestCompletedListener | null = null
let webRequestBeforeRequestListener: WebRequestBeforeRequestListener | null = null
let permissionAddedListener: (() => void) | null = null
let permissionRemovedListener: (() => void) | null = null
let notificationClickListener: ((notificationId: string) => void) | null = null
let tabRemovedListener: ((tabId: number) => void) | null = null
const sessionStorageData: Record<string, unknown> = {}

vi.mock('wxt/browser', () => ({
  browser: {
    runtime: {
      getURL: vi.fn((path: string) => `extension://${path}`),
      getContexts: vi.fn(() => Promise.resolve([])),
      sendMessage: vi.fn(() => Promise.resolve()),
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
    offscreen: {
      createDocument: vi.fn(() => Promise.resolve()),
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
      onBeforeRequest: {
        addListener: vi.fn((listener: WebRequestBeforeRequestListener) => {
          webRequestBeforeRequestListener = listener
        }),
        removeListener: vi.fn((listener: WebRequestBeforeRequestListener) => {
          if (webRequestBeforeRequestListener === listener) {
            webRequestBeforeRequestListener = null
          }
        }),
      },
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
    storage: {
      session: {
        get: vi.fn(async (key: string) => ({
          [key]: sessionStorageData[key],
        })),
        set: vi.fn(async (items: Record<string, unknown>) => {
          Object.assign(sessionStorageData, items)
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
      onRemoved: {
        addListener: vi.fn((listener: (tabId: number) => void) => {
          tabRemovedListener = listener
        }),
      },
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
const webRequestBeforeRequestAddListenerMock = vi.mocked(browser.webRequest.onBeforeRequest.addListener)
const webRequestBeforeRequestRemoveListenerMock = vi.mocked(browser.webRequest.onBeforeRequest.removeListener)
const tabsSendMessageMock = vi.mocked(
  browser.tabs.sendMessage as unknown as (tabId: number, message: unknown) => Promise<unknown>,
)
const tabsGetMock = vi.mocked(
  browser.tabs.get as unknown as (tabId: number) => Promise<{ id: number; windowId: number }>,
)
const tabsUpdateMock = vi.mocked(browser.tabs.update)
const windowsUpdateMock = vi.mocked(browser.windows.update)
const runtimeSendMessageMock = vi.mocked(browser.runtime.sendMessage)
const offscreenCreateDocumentMock = vi.mocked(browser.offscreen.createDocument)

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
    url: 'https://gemini.google.com/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate?rt=c',
    ...overrides,
  })
}

function startDeepResearchPoll(overrides: Partial<Parameters<WebRequestBeforeRequestListener>[0]> = {}): void {
  webRequestBeforeRequestListener?.({
    requestId: 'poll-1',
    tabId: 7,
    timeStamp: 100,
    url: 'https://gemini.google.com/_/BardChatUi/data/batchexecute?rpcids=kwDCne&source-path=%2Fapp%2Fc_1',
    ...overrides,
  })
}

function completeDeepResearchReport(overrides: Partial<Parameters<WebRequestCompletedListener>[0]> = {}): void {
  webRequestCompletedListener?.({
    requestId: 'report-1',
    tabId: 7,
    statusCode: 200,
    timeStamp: 500,
    url: 'https://gemini.google.com/_/BardChatUi/data/batchexecute?rpcids=hNvQHb&source-path=%2Fapp%2Fc_1',
    ...overrides,
  })
}

describe('responseCompleteNotification background V2', () => {
  beforeEach(async () => {
    resetResponseCompleteNotificationBackgroundForTest()
    resetDeepResearchNotificationStateForTest()
    resetResponseCompleteNotificationAudioForTest()
    runtimeMessageListener = null
    webRequestCompletedListener = null
    webRequestBeforeRequestListener = null
    permissionAddedListener = null
    permissionRemovedListener = null
    notificationClickListener = null
    tabRemovedListener = null
    for (const key of Object.keys(sessionStorageData)) {
      delete sessionStorageData[key]
    }
    vi.clearAllMocks()
    await setResponseCompleteNotificationEnabled(false)
    await setResponseCompleteNotificationAudioEnabled(false)
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
    vi.useRealTimers()
    vi.unstubAllEnvs()
  })

  it('requests all optional Chrome permissions together', async () => {
    permissionsContainsMock.mockResolvedValue(false)

    const response = await sendRuntimeMessage({
      type: RESPONSE_COMPLETE_NOTIFICATION_REQUEST_PERMISSION_MESSAGE,
    })

    expect(permissionsRequestMock).toHaveBeenCalledWith({
      permissions: ['notifications', 'webRequest'],
    })
    expect(response).toEqual({ ok: true })
  })

  it('uses the required Firefox notification permission without requesting it again', async () => {
    vi.stubEnv('FIREFOX', 'true')

    const response = await sendRuntimeMessage({
      type: RESPONSE_COMPLETE_NOTIFICATION_REQUEST_PERMISSION_MESSAGE,
    })

    expect(permissionsContainsMock).toHaveBeenCalledWith({
      permissions: ['notifications'],
    })
    expect(permissionsRequestMock).not.toHaveBeenCalled()
    expect(response).toEqual({ ok: true })
  })

  it('registers and removes one listener as the setting changes', async () => {
    await setResponseCompleteNotificationEnabled(true)
    await flushPromises()
    await setResponseCompleteNotificationEnabled(true)
    await flushPromises()

    expect(webRequestAddListenerMock).toHaveBeenCalledTimes(1)
    expect(webRequestBeforeRequestAddListenerMock).toHaveBeenCalledTimes(1)
    expect(webRequestCompletedListener).not.toBeNull()
    expect(webRequestBeforeRequestListener).not.toBeNull()

    await setResponseCompleteNotificationEnabled(false)
    await flushPromises()

    expect(webRequestRemoveListenerMock).toHaveBeenCalledTimes(1)
    expect(webRequestBeforeRequestRemoveListenerMock).toHaveBeenCalledTimes(1)
    expect(webRequestCompletedListener).toBeNull()
    expect(webRequestBeforeRequestListener).toBeNull()
  })

  it('creates a rich notification when StreamGenerate completes successfully', async () => {
    await setResponseCompleteNotificationEnabled(true)
    await flushPromises()

    completeStream()
    await flushPromises()

    expect(tabsSendMessageMock).toHaveBeenCalledWith(7, {
      type: 'response-complete-notification:get-content',
      payload: {
        completionKind: 'standard-response',
      },
    })
    expect(createNotificationMock).toHaveBeenCalledWith('response-complete:7:123', {
      type: 'basic',
      iconUrl: 'extension:///icon/gemini-sparkle-aurora.png',
      title: 'Chat title',
      message: 'Response summary',
      silent: true,
    })
  })

  it('suppresses Deep Research initialization and notifies on the final report', async () => {
    await setResponseCompleteNotificationEnabled(true)
    await flushPromises()

    startDeepResearchPoll()
    completeStream()
    await flushPromises()

    expect(createNotificationMock).not.toHaveBeenCalled()

    completeDeepResearchReport()
    await flushPromises()

    expect(tabsSendMessageMock).toHaveBeenCalledWith(7, {
      type: 'response-complete-notification:get-content',
      payload: {
        completionKind: 'deep-research',
      },
    })
    expect(createNotificationMock).toHaveBeenCalledWith('response-complete:7:500', expect.objectContaining({
      title: 'Chat title',
      message: 'Response summary',
    }))
  })

  it('ignores untracked and duplicate Deep Research report requests', async () => {
    await setResponseCompleteNotificationEnabled(true)
    await flushPromises()

    completeDeepResearchReport()
    await flushPromises()
    expect(createNotificationMock).not.toHaveBeenCalled()

    startDeepResearchPoll()
    await flushPromises()
    completeDeepResearchReport()
    completeDeepResearchReport({ requestId: 'report-duplicate', timeStamp: 501 })
    await flushPromises()

    expect(createNotificationMock).toHaveBeenCalledTimes(1)
  })

  it('keeps a Deep Research task after a failed final report request', async () => {
    await setResponseCompleteNotificationEnabled(true)
    await flushPromises()
    startDeepResearchPoll()
    await flushPromises()

    completeDeepResearchReport({ statusCode: 500 })
    await flushPromises()
    expect(createNotificationMock).not.toHaveBeenCalled()

    completeDeepResearchReport()
    await flushPromises()
    expect(createNotificationMock).toHaveBeenCalledTimes(1)
  })

  it('clears Deep Research tasks when the originating tab closes', async () => {
    await setResponseCompleteNotificationEnabled(true)
    await flushPromises()
    startDeepResearchPoll()
    await flushPromises()

    tabRemovedListener?.(7)
    await flushPromises()
    completeDeepResearchReport()
    await flushPromises()

    expect(createNotificationMock).not.toHaveBeenCalled()
  })

  it('does not pass Chromium-only silent option to Firefox notifications', async () => {
    vi.stubEnv('FIREFOX', 'true')
    await setResponseCompleteNotificationEnabled(true)

    await sendRuntimeMessage({
      type: RESPONSE_COMPLETE_NOTIFICATION_TEST_MESSAGE,
      payload: { timestamp: 789 },
    })

    expect(createNotificationMock).toHaveBeenCalledWith('test:popup:789', {
      type: 'basic',
      iconUrl: 'extension:///icon/gemini-sparkle-aurora.png',
      title: 'Gemini Power Kit notification test',
      message: 'Notifications are working.',
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
      iconUrl: 'extension:///icon/gemini-sparkle-aurora.png',
      title: 'Gemini finished replying',
      message: 'Your response is ready.',
      silent: true,
    })
  })

  it('creates silent image notifications and a silent basic fallback', async () => {
    await setResponseCompleteNotificationEnabled(true)
    await flushPromises()
    tabsSendMessageMock.mockResolvedValue({
      suppressed: false,
      title: 'Image chat',
      message: 'Generated image',
      responseType: 'image',
      imageDataUrl: 'data:image/jpeg;base64,abc',
    })
    createNotificationMock
      .mockRejectedValueOnce(new Error('image template failed'))
      .mockResolvedValueOnce(undefined)

    completeStream()
    await flushPromises()

    expect(createNotificationMock).toHaveBeenNthCalledWith(1, 'response-complete:7:123', {
      type: 'image',
      iconUrl: 'extension:///icon/gemini-sparkle-aurora.png',
      title: 'Image chat',
      message: 'Generated image',
      silent: true,
      imageUrl: 'data:image/jpeg;base64,abc',
    })
    expect(createNotificationMock).toHaveBeenNthCalledWith(2, 'response-complete:7:123', {
      type: 'basic',
      iconUrl: 'extension:///icon/gemini-sparkle-aurora.png',
      title: 'Image chat',
      message: 'Generated image',
      silent: true,
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
      audioPermissionAvailable: false,
    })
  })

  it('auto-clears test notifications after five seconds', async () => {
    vi.useFakeTimers()
    await setResponseCompleteNotificationEnabled(true)
    await sendRuntimeMessage({
      type: RESPONSE_COMPLETE_NOTIFICATION_TEST_MESSAGE,
      payload: { timestamp: 789 },
    })

    expect(createNotificationMock).toHaveBeenCalledWith('test:popup:789', expect.anything())
    expect(clearNotificationMock).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(4_999)
    expect(clearNotificationMock).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    expect(clearNotificationMock).toHaveBeenCalledWith('test:popup:789')
  })

  it('does not auto-clear response-complete notifications', async () => {
    await setResponseCompleteNotificationEnabled(true)
    await flushPromises()
    completeStream()
    await flushPromises()
    clearNotificationMock.mockClear()
    vi.useFakeTimers()

    await vi.advanceTimersByTimeAsync(5_000)

    expect(clearNotificationMock).not.toHaveBeenCalled()
  })

  it('keeps test notification click-to-focus behavior and cancels auto-clear', async () => {
    vi.useFakeTimers()
    await setResponseCompleteNotificationEnabled(true)
    await sendRuntimeMessage({
      type: RESPONSE_COMPLETE_NOTIFICATION_TEST_MESSAGE,
      payload: { timestamp: 789 },
    }, { tab: { id: 7, windowId: 9 } })

    expect(createNotificationMock).toHaveBeenCalledWith('test:7:789', expect.objectContaining({
      title: 'Gemini Power Kit notification test',
      silent: true,
    }))

    notificationClickListener?.('test:7:789')
    await Promise.resolve()
    await Promise.resolve()

    expect(windowsUpdateMock).toHaveBeenCalledWith(9, { focused: true })
    expect(tabsUpdateMock).toHaveBeenCalledWith(7, { active: true })
    expect(clearNotificationMock).toHaveBeenCalledWith('test:7:789')

    await vi.advanceTimersByTimeAsync(5_000)
    expect(clearNotificationMock).toHaveBeenCalledTimes(1)
  })

  it('requests only offscreen permission when enabling audio', async () => {
    const response = await sendRuntimeMessage({
      type: RESPONSE_COMPLETE_NOTIFICATION_AUDIO_REQUEST_PERMISSION_MESSAGE,
    })

    expect(permissionsRequestMock).toHaveBeenCalledWith({
      permissions: ['offscreen'],
    })
    expect(response).toEqual({
      ok: true,
      audioPermissionAvailable: true,
    })
  })

  it('keeps visual notifications enabled when audio permission is denied', async () => {
    await setResponseCompleteNotificationEnabled(true)
    permissionsRequestMock.mockResolvedValue(false)

    const response = await sendRuntimeMessage({
      type: RESPONSE_COMPLETE_NOTIFICATION_AUDIO_REQUEST_PERMISSION_MESSAGE,
    })

    expect(response).toEqual({
      ok: false,
      audioPermissionAvailable: false,
      error: 'permission-denied',
    })
    await expect(getResponseCompleteNotificationEnabled()).resolves.toBe(true)
  })

  it('plays custom audio only after a notification is created', async () => {
    await setResponseCompleteNotificationEnabled(true)
    await setResponseCompleteNotificationAudioEnabled(true)
    await flushPromises()

    completeStream()
    await flushPromises()

    expect(createNotificationMock).toHaveBeenCalled()
    expect(offscreenCreateDocumentMock).toHaveBeenCalledTimes(1)
    expect(runtimeSendMessageMock).toHaveBeenCalledWith({
      type: 'response-complete-notification-audio:play',
      target: 'offscreen',
    })
  })

  it('does not play custom audio when notification creation fails', async () => {
    await setResponseCompleteNotificationEnabled(true)
    await setResponseCompleteNotificationAudioEnabled(true)
    createNotificationMock.mockRejectedValue(new Error('notification failed'))
    await flushPromises()

    completeStream()
    await flushPromises()

    expect(offscreenCreateDocumentMock).not.toHaveBeenCalled()
    expect(runtimeSendMessageMock).not.toHaveBeenCalled()
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
