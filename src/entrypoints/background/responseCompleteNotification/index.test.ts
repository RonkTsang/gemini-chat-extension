import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { browser } from 'wxt/browser'

import {
  getResponseCompleteNotificationEnabled,
  getResponseCompleteNotificationAudioEnabled,
  setResponseCompleteNotificationForegroundOnly,
  setResponseCompleteNotificationAudioEnabled,
  setResponseCompleteNotificationEnabled,
} from '@/services/responseCompleteNotificationSettings'
import {
  RESPONSE_COMPLETE_NOTIFICATION_PERMISSION_INTENT_KEY,
  type ResponseCompleteNotificationPermissionIntent,
} from '@/services/responseCompleteNotificationPermissionIntent'
import {
  RESPONSE_COMPLETE_NOTIFICATION_AUDIO_ASSET_DELETE_MESSAGE,
  RESPONSE_COMPLETE_NOTIFICATION_AUDIO_ASSET_GET_METADATA_MESSAGE,
  RESPONSE_COMPLETE_NOTIFICATION_AUDIO_ASSET_SAVE_MESSAGE,
  RESPONSE_COMPLETE_NOTIFICATION_AUDIO_REQUEST_PERMISSION_MESSAGE,
  RESPONSE_COMPLETE_NOTIFICATION_GET_CONTENT_MESSAGE,
  RESPONSE_COMPLETE_NOTIFICATION_GET_DEEP_RESEARCH_STATUS_MESSAGE,
  RESPONSE_COMPLETE_NOTIFICATION_GET_READINESS_MESSAGE,
  RESPONSE_COMPLETE_NOTIFICATION_OPEN_PERMISSION_POPUP_MESSAGE,
  RESPONSE_COMPLETE_NOTIFICATION_REQUEST_PERMISSION_MESSAGE,
  RESPONSE_COMPLETE_NOTIFICATION_TEST_MESSAGE,
} from '@/types/runtime-messages'
import {
  resetDeepResearchNotificationStateForTest,
} from './deepResearchState'
import {
  resetResponseCompleteNotificationBackgroundForTest,
  startResponseCompleteNotificationBackground,
} from './index'
import { resetResponseCompleteNotificationAudioForTest } from './audio'

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

type WebRequestErrorListener = (details: {
  requestId: string
  tabId: number
  timeStamp: number
  url: string
  error: string
}) => void

let runtimeMessageListener: RuntimeMessageListener | null = null
let webRequestCompletedListener: WebRequestCompletedListener | null = null
let webRequestBeforeRequestListener: WebRequestBeforeRequestListener | null = null
let webRequestErrorListener: WebRequestErrorListener | null = null
let permissionAddedListener: (() => void) | null = null
let permissionRemovedListener: (() => void) | null = null
let notificationClickListener: ((notificationId: string) => void) | null = null
let tabRemovedListener: ((tabId: number) => void) | null = null
const sessionStorageData: Record<string, unknown> = {}

const {
  getAudioAssetMetadataMock,
  persistAudioAssetMock,
  deleteAudioAssetMock,
} = vi.hoisted(() => ({
  getAudioAssetMetadataMock: vi.fn(),
  persistAudioAssetMock: vi.fn(),
  deleteAudioAssetMock: vi.fn(),
}))

vi.mock('@/services/responseCompleteNotificationAudioAsset', () => ({
  getResponseCompleteNotificationAudioAssetMetadata: getAudioAssetMetadataMock,
  persistResponseCompleteNotificationAudioAsset: persistAudioAssetMock,
  deleteResponseCompleteNotificationAudioAsset: deleteAudioAssetMock,
}))

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
    action: {
      openPopup: vi.fn(() => Promise.resolve()),
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
      onErrorOccurred: {
        addListener: vi.fn((listener: WebRequestErrorListener) => {
          webRequestErrorListener = listener
        }),
        removeListener: vi.fn((listener: WebRequestErrorListener) => {
          if (webRequestErrorListener === listener) {
            webRequestErrorListener = null
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
        remove: vi.fn(async (key: string) => {
          delete sessionStorageData[key]
        }),
      },
    },
    windows: {
      update: vi.fn(() => Promise.resolve()),
      create: vi.fn(() => Promise.resolve({ id: 10 })),
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
const getPermissionLevelMock = vi.mocked(
  browser.notifications.getPermissionLevel as unknown as () => Promise<'granted' | 'denied'>,
)
const actionOpenPopupMock = vi.mocked(browser.action.openPopup)
const createNotificationMock = vi.mocked(browser.notifications.create)
const clearNotificationMock = vi.mocked(browser.notifications.clear)
const webRequestAddListenerMock = vi.mocked(browser.webRequest.onCompleted.addListener)
const webRequestRemoveListenerMock = vi.mocked(browser.webRequest.onCompleted.removeListener)
const webRequestBeforeRequestAddListenerMock = vi.mocked(browser.webRequest.onBeforeRequest.addListener)
const webRequestBeforeRequestRemoveListenerMock = vi.mocked(browser.webRequest.onBeforeRequest.removeListener)
const webRequestErrorAddListenerMock = vi.mocked(browser.webRequest.onErrorOccurred.addListener)
const webRequestErrorRemoveListenerMock = vi.mocked(browser.webRequest.onErrorOccurred.removeListener)
const tabsSendMessageMock = vi.mocked(
  browser.tabs.sendMessage as unknown as (tabId: number, message: unknown) => Promise<unknown>,
)
const tabsGetMock = vi.mocked(
  browser.tabs.get as unknown as (tabId: number) => Promise<{ id: number; windowId: number }>,
)
const tabsUpdateMock = vi.mocked(browser.tabs.update)
const windowsUpdateMock = vi.mocked(browser.windows.update)
const windowsCreateMock = vi.mocked(browser.windows.create)
const runtimeSendMessageMock = vi.mocked(browser.runtime.sendMessage)
const offscreenCreateDocumentMock = vi.mocked(browser.offscreen.createDocument)

const DEFAULT_NOTIFICATION_CONTENT = {
  isForeground: false,
  title: 'Chat title',
  message: 'Response summary',
  responseType: 'text',
  completionConfirmed: true,
}

function mockContentResponses({
  deepResearchStatus = { state: 'absent' },
  notificationContent = DEFAULT_NOTIFICATION_CONTENT,
}: {
  deepResearchStatus?: unknown
  notificationContent?: unknown
} = {}): void {
  tabsSendMessageMock.mockImplementation(async (_tabId: number, message: unknown) => {
    if (
      message
      && typeof message === 'object'
      && (message as { type?: unknown }).type === RESPONSE_COMPLETE_NOTIFICATION_GET_DEEP_RESEARCH_STATUS_MESSAGE
    ) {
      return deepResearchStatus
    }

    if (
      message
      && typeof message === 'object'
      && (message as { type?: unknown }).type === RESPONSE_COMPLETE_NOTIFICATION_GET_CONTENT_MESSAGE
    ) {
      return notificationContent
    }

    return notificationContent
  })
}

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

async function flushNotificationClick(): Promise<void> {
  for (let index = 0; index < 6; index += 1) {
    await Promise.resolve()
  }
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

function errorDeepResearchPoll(overrides: Partial<Parameters<WebRequestErrorListener>[0]> = {}): void {
  webRequestErrorListener?.({
    requestId: 'poll-1',
    tabId: 7,
    timeStamp: 105,
    url: 'https://gemini.google.com/_/BardChatUi/data/batchexecute?rpcids=kwDCne&source-path=%2Fapp%2Fc_1',
    error: 'net::ERR_ABORTED',
    ...overrides,
  })
}

function completeDeepResearchPoll(overrides: Partial<Parameters<WebRequestCompletedListener>[0]> = {}): void {
  webRequestCompletedListener?.({
    requestId: 'poll-1',
    tabId: 7,
    statusCode: 200,
    timeStamp: 110,
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
    webRequestErrorListener = null
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
    await setResponseCompleteNotificationForegroundOnly(true)
    permissionsContainsMock.mockResolvedValue(true)
    getPermissionLevelMock.mockResolvedValue('granted')
    tabsGetMock.mockResolvedValue({ id: 7, windowId: 9 })
    getAudioAssetMetadataMock.mockResolvedValue(null)
    persistAudioAssetMock.mockResolvedValue({
      id: 'response-complete-notification',
      fileName: 'custom.mp3',
      mimeType: 'audio/mpeg',
      size: 5,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })
    deleteAudioAssetMock.mockResolvedValue(undefined)
    mockContentResponses()
    startResponseCompleteNotificationBackground()
    await flushPromises()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
  })

  it('opens the action popup when visual notification permission is missing', async () => {
    permissionsContainsMock.mockResolvedValue(false)

    const response = await sendRuntimeMessage({
      type: RESPONSE_COMPLETE_NOTIFICATION_OPEN_PERMISSION_POPUP_MESSAGE,
      payload: {
        permissionKind: 'visual',
      },
    }, { tab: { id: 7, windowId: 9 } })

    expect(permissionsContainsMock).toHaveBeenCalledWith({
      permissions: ['notifications', 'webRequest'],
      origins: ['*://gemini.google.com/*'],
    })
    expect(actionOpenPopupMock).toHaveBeenCalledWith({ windowId: 9 })
    expect(windowsCreateMock).not.toHaveBeenCalled()
    expect(response).toEqual({ ok: true, status: 'popup-opened' })
    expect(sessionStorageData[RESPONSE_COMPLETE_NOTIFICATION_PERMISSION_INTENT_KEY]).toMatchObject({
      permissionKind: 'visual',
      sourceTabId: 7,
      sourceWindowId: 9,
    })
  })

  it('enables visual notifications immediately when permission already exists', async () => {
    permissionsContainsMock.mockResolvedValue(true)

    const response = await sendRuntimeMessage({
      type: RESPONSE_COMPLETE_NOTIFICATION_REQUEST_PERMISSION_MESSAGE,
    }, { tab: { id: 7, windowId: 9 } })

    expect(actionOpenPopupMock).not.toHaveBeenCalled()
    expect(response).toEqual({ ok: true, status: 'already-granted' })
    await expect(getResponseCompleteNotificationEnabled()).resolves.toBe(true)
  })

  it('returns notification audio asset metadata from the background origin', async () => {
    const metadata = {
      id: 'response-complete-notification',
      fileName: 'custom.mp3',
      mimeType: 'audio/mpeg',
      size: 5,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    getAudioAssetMetadataMock.mockResolvedValue(metadata)

    const response = await sendRuntimeMessage({
      type: RESPONSE_COMPLETE_NOTIFICATION_AUDIO_ASSET_GET_METADATA_MESSAGE,
    })

    expect(getAudioAssetMetadataMock).toHaveBeenCalledTimes(1)
    expect(response).toEqual({
      ok: true,
      audioAsset: metadata,
    })
  })

  it('persists uploaded notification audio in the background origin', async () => {
    const response = await sendRuntimeMessage({
      type: RESPONSE_COMPLETE_NOTIFICATION_AUDIO_ASSET_SAVE_MESSAGE,
      payload: {
        fileName: 'custom.mp3',
        mimeType: 'audio/mpeg',
        size: 5,
        dataUrl: 'data:audio/mpeg;base64,YXVkaW8=',
      },
    })

    expect(persistAudioAssetMock).toHaveBeenCalledWith(expect.objectContaining({
      fileName: 'custom.mp3',
      mimeType: 'audio/mpeg',
      size: 5,
      blob: expect.any(Blob),
    }))
    expect(response).toEqual({
      ok: true,
      audioAsset: expect.objectContaining({
        fileName: 'custom.mp3',
      }),
    })
  })

  it('deletes uploaded notification audio from the background origin', async () => {
    const response = await sendRuntimeMessage({
      type: RESPONSE_COMPLETE_NOTIFICATION_AUDIO_ASSET_DELETE_MESSAGE,
    })

    expect(deleteAudioAssetMock).toHaveBeenCalledTimes(1)
    expect(response).toEqual({
      ok: true,
      audioAsset: null,
    })
  })

  it('enables visual notifications when permission is granted after the popup opens', async () => {
    permissionsContainsMock.mockResolvedValue(false)
    await sendRuntimeMessage({
      type: RESPONSE_COMPLETE_NOTIFICATION_OPEN_PERMISSION_POPUP_MESSAGE,
      payload: {
        permissionKind: 'visual',
      },
    }, { tab: { id: 7, windowId: 9 } })
    await expect(getResponseCompleteNotificationEnabled()).resolves.toBe(false)

    permissionsContainsMock.mockResolvedValue(true)
    permissionAddedListener?.()
    await flushPromises()

    await expect(getResponseCompleteNotificationEnabled()).resolves.toBe(true)
    expect(sessionStorageData[RESPONSE_COMPLETE_NOTIFICATION_PERMISSION_INTENT_KEY]).toBeUndefined()
  })

  it('polls pending permission intent when the permission event is missed', async () => {
    vi.useFakeTimers()
    permissionsContainsMock.mockResolvedValue(false)
    await sendRuntimeMessage({
      type: RESPONSE_COMPLETE_NOTIFICATION_OPEN_PERMISSION_POPUP_MESSAGE,
      payload: {
        permissionKind: 'visual',
      },
    }, { tab: { id: 7, windowId: 9 } })
    await expect(getResponseCompleteNotificationEnabled()).resolves.toBe(false)

    permissionsContainsMock.mockResolvedValue(true)
    await vi.advanceTimersByTimeAsync(500)
    await Promise.resolve()
    await Promise.resolve()

    await expect(getResponseCompleteNotificationEnabled()).resolves.toBe(true)
    expect(sessionStorageData[RESPONSE_COMPLETE_NOTIFICATION_PERMISSION_INTENT_KEY]).toBeUndefined()
  })

  it('enables a granted pending intent when readiness is polled from content UI', async () => {
    permissionsContainsMock.mockResolvedValue(false)
    await sendRuntimeMessage({
      type: RESPONSE_COMPLETE_NOTIFICATION_OPEN_PERMISSION_POPUP_MESSAGE,
      payload: {
        permissionKind: 'visual',
      },
    }, { tab: { id: 7, windowId: 9 } })
    await expect(getResponseCompleteNotificationEnabled()).resolves.toBe(false)

    permissionsContainsMock.mockResolvedValue(true)
    const response = await sendRuntimeMessage({
      type: RESPONSE_COMPLETE_NOTIFICATION_GET_READINESS_MESSAGE,
    })

    expect(response).toMatchObject({
      ok: true,
      readiness: 'allowed',
    })
    await expect(getResponseCompleteNotificationEnabled()).resolves.toBe(true)
    expect(sessionStorageData[RESPONSE_COMPLETE_NOTIFICATION_PERMISSION_INTENT_KEY]).toBeUndefined()
  })

  it('falls back to a popup window when action.openPopup fails', async () => {
    permissionsContainsMock.mockResolvedValue(false)
    actionOpenPopupMock.mockRejectedValueOnce(new Error('not available'))

    const response = await sendRuntimeMessage({
      type: RESPONSE_COMPLETE_NOTIFICATION_OPEN_PERMISSION_POPUP_MESSAGE,
      payload: {
        permissionKind: 'visual',
      },
    }, { tab: { id: 7, windowId: 9 } })

    const intent = sessionStorageData[RESPONSE_COMPLETE_NOTIFICATION_PERMISSION_INTENT_KEY] as ResponseCompleteNotificationPermissionIntent
    expect(response).toEqual({ ok: true, status: 'fallback-window-opened' })
    expect(windowsCreateMock).toHaveBeenCalledWith({
      type: 'popup',
      url: `extension:///popup.html?intent=response-complete-notification&nonce=${intent.nonce}`,
      width: 360,
      height: 520,
    })
  })

  it('clears the permission intent when no popup can be opened', async () => {
    permissionsContainsMock.mockResolvedValue(false)
    actionOpenPopupMock.mockRejectedValueOnce(new Error('not available'))
    windowsCreateMock.mockRejectedValueOnce(new Error('window failed'))

    const response = await sendRuntimeMessage({
      type: RESPONSE_COMPLETE_NOTIFICATION_OPEN_PERMISSION_POPUP_MESSAGE,
      payload: {
        permissionKind: 'visual',
      },
    }, { tab: { id: 7, windowId: 9 } })

    expect(response).toEqual({ ok: false, error: 'popup-open-failed' })
    expect(sessionStorageData[RESPONSE_COMPLETE_NOTIFICATION_PERMISSION_INTENT_KEY]).toBeUndefined()
  })

  it('registers and removes one listener as the setting changes', async () => {
    await setResponseCompleteNotificationEnabled(true)
    await flushPromises()
    await setResponseCompleteNotificationEnabled(true)
    await flushPromises()

    expect(webRequestAddListenerMock).toHaveBeenCalledTimes(1)
    expect(webRequestBeforeRequestAddListenerMock).toHaveBeenCalledTimes(1)
    expect(webRequestErrorAddListenerMock).toHaveBeenCalledTimes(1)
    expect(webRequestCompletedListener).not.toBeNull()
    expect(webRequestBeforeRequestListener).not.toBeNull()
    expect(webRequestErrorListener).not.toBeNull()

    await setResponseCompleteNotificationEnabled(false)
    await flushPromises()

    expect(webRequestRemoveListenerMock).toHaveBeenCalledTimes(1)
    expect(webRequestBeforeRequestRemoveListenerMock).toHaveBeenCalledTimes(1)
    expect(webRequestErrorRemoveListenerMock).toHaveBeenCalledTimes(1)
    expect(webRequestCompletedListener).toBeNull()
    expect(webRequestBeforeRequestListener).toBeNull()
    expect(webRequestErrorListener).toBeNull()
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

  it('notifies on Deep Research initialization StreamGenerate and the final report', async () => {
    await setResponseCompleteNotificationEnabled(true)
    await flushPromises()

    startDeepResearchPoll()
    completeStream()
    await flushPromises()

    expect(createNotificationMock).toHaveBeenCalledTimes(1)
    expect(createNotificationMock).toHaveBeenCalledWith('response-complete:7:123', expect.objectContaining({
      title: 'Chat title',
      message: 'Response summary',
    }))

    completeDeepResearchReport()
    await flushPromises()

    expect(tabsSendMessageMock).toHaveBeenCalledWith(7, {
      type: 'response-complete-notification:get-content',
      payload: {
        completionKind: 'deep-research',
      },
    })
    expect(createNotificationMock).toHaveBeenCalledTimes(2)
    expect(createNotificationMock).toHaveBeenCalledWith('response-complete:7:500', expect.objectContaining({
      title: 'Chat title',
      message: 'Response summary',
    }))
  })

  it('tracks Deep Research from completed polling when onBeforeRequest is missed', async () => {
    await setResponseCompleteNotificationEnabled(true)
    await flushPromises()

    completeDeepResearchPoll()
    await flushPromises()
    completeStream()
    await flushPromises()

    expect(createNotificationMock).toHaveBeenCalledTimes(1)
    expect(createNotificationMock).toHaveBeenCalledWith('response-complete:7:123', expect.objectContaining({
      title: 'Chat title',
      message: 'Response summary',
    }))

    completeDeepResearchReport()
    await flushPromises()

    expect(tabsSendMessageMock).toHaveBeenCalledWith(7, {
      type: 'response-complete-notification:get-content',
      payload: {
        completionKind: 'deep-research',
      },
    })
    expect(createNotificationMock).toHaveBeenCalledTimes(2)
  })

  it('clears an observed Deep Research poll request when the request errors', async () => {
    await setResponseCompleteNotificationEnabled(true)
    await flushPromises()

    startDeepResearchPoll()
    await flushPromises()
    errorDeepResearchPoll()
    completeDeepResearchPoll()
    await flushPromises()

    completeDeepResearchReport()
    await flushPromises()

    expect(createNotificationMock).toHaveBeenCalledTimes(1)
  })

  it('notifies Case 2 StreamGenerate and tracks Deep Research from the following hNvQHb poll', async () => {
    await setResponseCompleteNotificationEnabled(true)
    await flushPromises()
    mockContentResponses({
      deepResearchStatus: {
        state: 'processing',
        title: 'Research in progress',
        conversationId: 'c_1',
      },
    })

    completeStream()
    await flushPromises()
    expect(createNotificationMock).toHaveBeenCalledTimes(1)
    expect(createNotificationMock).toHaveBeenCalledWith('response-complete:7:123', expect.objectContaining({
      title: 'Chat title',
      message: 'Response summary',
    }))

    completeDeepResearchReport({ requestId: 'history-poll', timeStamp: 300 })
    await flushPromises()
    expect(createNotificationMock).toHaveBeenCalledTimes(1)

    completeDeepResearchReport({ requestId: 'history-final', timeStamp: 600 })
    await flushPromises()

    expect(tabsSendMessageMock).toHaveBeenCalledWith(7, {
      type: 'response-complete-notification:get-deep-research-status',
      payload: {
        conversationId: 'c_1',
      },
    })
    expect(createNotificationMock).toHaveBeenCalledTimes(2)
    expect(createNotificationMock).toHaveBeenCalledWith('response-complete:7:600', expect.objectContaining({
      title: 'Chat title',
      message: 'Response summary',
    }))
  })

  it('tracks Case 2 Deep Research from untracked hNvQHb history polling', async () => {
    await setResponseCompleteNotificationEnabled(true)
    await flushPromises()
    mockContentResponses({
      deepResearchStatus: {
        state: 'processing',
        title: 'Research in progress',
        conversationId: 'c_1',
      },
    })

    completeDeepResearchReport({ requestId: 'history-poll', timeStamp: 300 })
    await flushPromises()
    expect(createNotificationMock).not.toHaveBeenCalled()

    completeDeepResearchReport({ requestId: 'history-final', timeStamp: 600 })
    await flushPromises()

    expect(createNotificationMock).toHaveBeenCalledTimes(1)
    expect(createNotificationMock).toHaveBeenCalledWith('response-complete:7:600', expect.objectContaining({
      title: 'Chat title',
      message: 'Response summary',
    }))
  })

  it('does not notify when an untracked hNvQHb already shows completed history', async () => {
    await setResponseCompleteNotificationEnabled(true)
    await flushPromises()
    mockContentResponses({
      deepResearchStatus: {
        state: 'completed',
        title: 'Completed report',
        conversationId: 'c_1',
      },
    })

    completeDeepResearchReport()
    await flushPromises()

    expect(createNotificationMock).not.toHaveBeenCalled()
  })

  it('keeps the Deep Research task while hNvQHb completes before the DOM report is complete', async () => {
    await setResponseCompleteNotificationEnabled(true)
    await flushPromises()
    startDeepResearchPoll()
    await flushPromises()
    tabsSendMessageMock.mockResolvedValueOnce({
      isForeground: false,
      title: 'Chat title',
      message: 'Your response is ready.',
      responseType: 'text',
      completionConfirmed: false,
    })

    completeDeepResearchReport()
    await flushPromises()
    expect(createNotificationMock).not.toHaveBeenCalled()

    completeDeepResearchReport({ requestId: 'report-final', timeStamp: 600 })
    await flushPromises()
    expect(createNotificationMock).toHaveBeenCalledTimes(1)
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

  it('suppresses notification while the Gemini page is foregrounded by default', async () => {
    await setResponseCompleteNotificationEnabled(true)
    await flushPromises()
    tabsSendMessageMock.mockResolvedValue({
      isForeground: true,
      title: 'Chat title',
      message: 'Response summary',
      responseType: 'text',
    })

    completeStream()
    await flushPromises()

    expect(createNotificationMock).not.toHaveBeenCalled()
  })

  it('creates a notification while foregrounded when foreground-only is disabled', async () => {
    await setResponseCompleteNotificationEnabled(true)
    await setResponseCompleteNotificationForegroundOnly(false)
    await flushPromises()
    tabsSendMessageMock.mockResolvedValue({
      isForeground: true,
      title: 'Chat title',
      message: 'Response summary',
      responseType: 'text',
    })

    completeStream()
    await flushPromises()

    expect(createNotificationMock).toHaveBeenCalledWith('response-complete:7:123', {
      type: 'basic',
      iconUrl: 'extension:///icon/gemini-sparkle-aurora.png',
      title: 'Chat title',
      message: 'Response summary',
      silent: true,
    })
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
      isForeground: false,
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
    await flushNotificationClick()

    expect(tabsGetMock).toHaveBeenCalledWith(7)
    expect(windowsUpdateMock).toHaveBeenCalledWith(9, { focused: true })
    expect(tabsUpdateMock).toHaveBeenCalledWith(7, { active: true })
    expect(clearNotificationMock).toHaveBeenCalledWith('test:7:789')

    await vi.advanceTimersByTimeAsync(5_000)
    expect(clearNotificationMock).toHaveBeenCalledTimes(1)
  })

  it('focuses a response notification target from the notification id', async () => {
    await setResponseCompleteNotificationEnabled(true)
    await flushPromises()
    completeStream()
    await flushPromises()
    tabsGetMock.mockClear()
    clearNotificationMock.mockClear()

    notificationClickListener?.('response-complete:7:123')
    await flushNotificationClick()

    expect(clearNotificationMock).toHaveBeenCalledWith('response-complete:7:123')
    expect(tabsGetMock).toHaveBeenCalledWith(7)
    expect(windowsUpdateMock).toHaveBeenCalledWith(9, { focused: true })
    expect(tabsUpdateMock).toHaveBeenCalledWith(7, { active: true })
  })

  it('clears popup and malformed notifications without focusing a tab', async () => {
    notificationClickListener?.('test:popup:789')
    notificationClickListener?.('response-complete:not-a-tab:123')
    await flushNotificationClick()

    expect(clearNotificationMock).toHaveBeenCalledWith('test:popup:789')
    expect(clearNotificationMock).toHaveBeenCalledWith('response-complete:not-a-tab:123')
    expect(tabsGetMock).not.toHaveBeenCalled()
    expect(windowsUpdateMock).not.toHaveBeenCalled()
    expect(tabsUpdateMock).not.toHaveBeenCalled()
  })

  it('clears clicked notifications when the target tab is unavailable', async () => {
    tabsGetMock.mockRejectedValueOnce(new Error('tab closed'))

    notificationClickListener?.('response-complete:7:123')
    await flushNotificationClick()

    expect(clearNotificationMock).toHaveBeenCalledWith('response-complete:7:123')
    expect(tabsGetMock).toHaveBeenCalledWith(7)
    expect(windowsUpdateMock).not.toHaveBeenCalled()
    expect(tabsUpdateMock).not.toHaveBeenCalled()
  })

  it('opens the action popup when audio permission is missing', async () => {
    permissionsContainsMock.mockResolvedValue(false)

    const response = await sendRuntimeMessage({
      type: RESPONSE_COMPLETE_NOTIFICATION_AUDIO_REQUEST_PERMISSION_MESSAGE,
    }, { tab: { id: 7, windowId: 9 } })

    expect(permissionsContainsMock).toHaveBeenCalledWith({
      permissions: ['offscreen'],
    })
    expect(actionOpenPopupMock).toHaveBeenCalledWith({ windowId: 9 })
    expect(response).toEqual({ ok: true, status: 'popup-opened' })
    expect(sessionStorageData[RESPONSE_COMPLETE_NOTIFICATION_PERMISSION_INTENT_KEY]).toMatchObject({
      permissionKind: 'audio',
      sourceTabId: 7,
      sourceWindowId: 9,
    })
  })

  it('enables audio immediately when audio permission already exists', async () => {
    permissionsContainsMock.mockResolvedValue(true)

    const response = await sendRuntimeMessage({
      type: RESPONSE_COMPLETE_NOTIFICATION_AUDIO_REQUEST_PERMISSION_MESSAGE,
    }, { tab: { id: 7, windowId: 9 } })

    expect(actionOpenPopupMock).not.toHaveBeenCalled()
    expect(response).toEqual({ ok: true, status: 'already-granted' })
    await expect(getResponseCompleteNotificationAudioEnabled()).resolves.toBe(true)
  })

  it('keeps visual notifications enabled when audio permission is denied', async () => {
    await setResponseCompleteNotificationEnabled(true)
    permissionsContainsMock.mockResolvedValue(false)

    const response = await sendRuntimeMessage({
      type: RESPONSE_COMPLETE_NOTIFICATION_AUDIO_REQUEST_PERMISSION_MESSAGE,
    }, { tab: { id: 7, windowId: 9 } })

    expect(response).toEqual({
      ok: true,
      status: 'popup-opened',
    })
    await expect(getResponseCompleteNotificationEnabled()).resolves.toBe(true)
    await expect(getResponseCompleteNotificationAudioEnabled()).resolves.toBe(false)
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
