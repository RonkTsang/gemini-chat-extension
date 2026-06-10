import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { browser } from 'wxt/browser'
import type { Browser } from 'wxt/browser'

import { setResponseCompleteNotificationEnabled } from '@/services/responseCompleteNotificationSettings'
import {
  RESPONSE_COMPLETE_NOTIFICATION_CREATE_MESSAGE,
  RESPONSE_COMPLETE_NOTIFICATION_GET_READINESS_MESSAGE,
  RESPONSE_COMPLETE_NOTIFICATION_REQUEST_PERMISSION_MESSAGE,
  RESPONSE_COMPLETE_NOTIFICATION_TEST_MESSAGE,
} from '@/types/runtime-messages'
import {
  normalizeNotificationMessage,
  normalizeNotificationTitle,
  resetResponseCompleteNotificationBackgroundForTest,
  startResponseCompleteNotificationBackground,
} from './responseCompleteNotification'

type RuntimeMessageListener = (message: unknown, sender: {
  tab?: {
    id?: number
    windowId?: number
    url?: string
    title?: string
    favIconUrl?: string
  }
}) => unknown

let runtimeMessageListener: RuntimeMessageListener | null = null
let notificationClickListener: ((notificationId: string) => void) | null = null
let notificationClosedListener: ((notificationId: string) => void) | null = null

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
        addListener: vi.fn((listener: (notificationId: string) => void) => {
          notificationClosedListener = listener
        }),
      },
    },
    windows: {
      update: vi.fn(() => Promise.resolve()),
    },
    tabs: {
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
const getPlatformInfoMock = vi.mocked(
  browser.runtime.getPlatformInfo as unknown as () => Promise<Browser.runtime.PlatformInfo>,
)
const createNotificationMock = vi.mocked(browser.notifications.create)
const clearNotificationMock = vi.mocked(browser.notifications.clear)
const windowsUpdateMock = vi.mocked(browser.windows.update)
const tabsUpdateMock = vi.mocked(browser.tabs.update)

async function sendRuntimeMessage(message: unknown, sender: Parameters<RuntimeMessageListener>[1]) {
  if (!runtimeMessageListener) {
    throw new Error('runtime message listener was not registered')
  }

  return runtimeMessageListener(message, sender)
}

async function flushPromises(): Promise<void> {
  await Promise.resolve()
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe('responseCompleteNotification background', () => {
  const originalNotificationsApi = browser.notifications

  beforeEach(async () => {
    ;(browser as unknown as { notifications?: typeof browser.notifications }).notifications = originalNotificationsApi
    resetResponseCompleteNotificationBackgroundForTest()
    runtimeMessageListener = null
    notificationClickListener = null
    notificationClosedListener = null
    await setResponseCompleteNotificationEnabled(false)
    permissionsContainsMock.mockReset()
    permissionsRequestMock.mockReset()
    getPermissionLevelMock.mockReset()
    getPlatformInfoMock.mockReset()
    createNotificationMock.mockClear()
    clearNotificationMock.mockClear()
    windowsUpdateMock.mockClear()
    tabsUpdateMock.mockClear()
    getPermissionLevelMock.mockResolvedValue('granted')
    getPlatformInfoMock.mockResolvedValue({
      os: 'win',
      arch: 'x86-64',
      nacl_arch: 'x86-64',
    })
    startResponseCompleteNotificationBackground()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('reports missing permission readiness without creating a notification', async () => {
    await setResponseCompleteNotificationEnabled(true)
    permissionsContainsMock.mockResolvedValue(false)

    const response = await sendRuntimeMessage({
      type: RESPONSE_COMPLETE_NOTIFICATION_CREATE_MESSAGE,
      payload: {
        title: 'Chat title',
        message: 'Response summary',
        timestamp: 123,
        responseType: 'text',
      },
    }, { tab: { id: 7, windowId: 9 } })

    expect(response).toEqual({
      ok: false,
      readiness: 'missing-extension-permission',
      error: 'permission-denied',
    })
    expect(createNotificationMock).not.toHaveBeenCalled()
  })

  it('requests optional notification permission from a setting panel message', async () => {
    permissionsRequestMock.mockResolvedValue(true)

    const response = await sendRuntimeMessage({
      type: RESPONSE_COMPLETE_NOTIFICATION_REQUEST_PERMISSION_MESSAGE,
    }, {})

    expect(permissionsRequestMock).toHaveBeenCalledWith({
      permissions: ['notifications'],
    })
    expect(response).toEqual({ ok: true })
  })

  it('reports blocked browser readiness without creating a notification', async () => {
    await setResponseCompleteNotificationEnabled(true)
    permissionsContainsMock.mockResolvedValue(true)
    getPermissionLevelMock.mockResolvedValue('denied')

    const response = await sendRuntimeMessage({
      type: RESPONSE_COMPLETE_NOTIFICATION_GET_READINESS_MESSAGE,
    }, {})

    expect(response).toEqual({
      ok: false,
      readiness: 'blocked-by-browser',
    })
  })

  it('creates notification from payload and focuses the original tab when clicked', async () => {
    await setResponseCompleteNotificationEnabled(true)
    permissionsContainsMock.mockResolvedValue(true)
    getPermissionLevelMock.mockResolvedValue('granted')

    const response = await sendRuntimeMessage({
      type: RESPONSE_COMPLETE_NOTIFICATION_CREATE_MESSAGE,
      payload: {
        title: 'Chat title',
        message: 'Response summary',
        timestamp: 123,
        responseType: 'text',
      },
    }, { tab: { id: 7, windowId: 9 } })

    expect(response).toEqual({
      ok: true,
      readiness: 'allowed',
    })
    expect(createNotificationMock).toHaveBeenCalledWith('response-complete:7:123', {
      type: 'basic',
      iconUrl: 'extension:///icon/512.png',
      title: 'Chat title',
      message: 'Response summary',
    })

    notificationClickListener?.('response-complete:7:123')
    await flushPromises()

    expect(windowsUpdateMock).toHaveBeenCalledWith(9, { focused: true })
    expect(tabsUpdateMock).toHaveBeenCalledWith(7, { active: true })
    expect(clearNotificationMock).toHaveBeenCalledWith('response-complete:7:123')
  })

  it('creates an image notification for a valid Chrome image payload', async () => {
    await setResponseCompleteNotificationEnabled(true)
    permissionsContainsMock.mockResolvedValue(true)
    getPermissionLevelMock.mockResolvedValue('granted')
    const imageDataUrl = `data:image/jpeg;base64,${'a'.repeat(128)}`

    const response = await sendRuntimeMessage({
      type: RESPONSE_COMPLETE_NOTIFICATION_CREATE_MESSAGE,
      payload: {
        title: 'Chat title',
        message: 'Your image is ready.',
        timestamp: 321,
        responseType: 'image',
        imageDataUrl,
      },
    }, { tab: { id: 7, windowId: 9 } })

    expect(response).toEqual({
      ok: true,
      readiness: 'allowed',
    })
    expect(createNotificationMock).toHaveBeenCalledWith('response-complete:7:321', {
      type: 'image',
      iconUrl: 'extension:///icon/512.png',
      title: 'Chat title',
      message: 'Your image is ready.',
      imageUrl: imageDataUrl,
    })
  })

  it('uses the generated image as the basic icon on Chrome macOS', async () => {
    await setResponseCompleteNotificationEnabled(true)
    permissionsContainsMock.mockResolvedValue(true)
    getPermissionLevelMock.mockResolvedValue('granted')
    getPlatformInfoMock.mockResolvedValue({
      os: 'mac',
      arch: 'x86-64',
      nacl_arch: 'x86-64',
    })
    const imageDataUrl = `data:image/jpeg;base64,${'a'.repeat(128)}`

    const response = await sendRuntimeMessage({
      type: RESPONSE_COMPLETE_NOTIFICATION_CREATE_MESSAGE,
      payload: {
        title: 'Chat title',
        message: 'Your image is ready.',
        timestamp: 3211,
        responseType: 'image',
        imageDataUrl,
      },
    }, { tab: { id: 7, windowId: 9 } })

    expect(response).toEqual({
      ok: true,
      readiness: 'allowed',
    })
    expect(createNotificationMock).toHaveBeenCalledWith('response-complete:7:3211', {
      type: 'basic',
      iconUrl: imageDataUrl,
      title: 'Chat title',
      message: 'Your image is ready.',
    })
  })

  it('falls back to a basic notification for invalid image payload data', async () => {
    await setResponseCompleteNotificationEnabled(true)
    permissionsContainsMock.mockResolvedValue(true)
    getPermissionLevelMock.mockResolvedValue('granted')

    await sendRuntimeMessage({
      type: RESPONSE_COMPLETE_NOTIFICATION_CREATE_MESSAGE,
      payload: {
        title: 'Chat title',
        message: 'Your image is ready.',
        timestamp: 322,
        responseType: 'image',
        imageDataUrl: 'data:image/png;base64,abc',
      },
    }, { tab: { id: 7, windowId: 9 } })

    expect(createNotificationMock).toHaveBeenCalledWith('response-complete:7:322', {
      type: 'basic',
      iconUrl: 'extension:///icon/512.png',
      title: 'Chat title',
      message: 'Your image is ready.',
    })
  })

  it('falls back to a basic notification for oversized image payload data', async () => {
    await setResponseCompleteNotificationEnabled(true)
    permissionsContainsMock.mockResolvedValue(true)
    getPermissionLevelMock.mockResolvedValue('granted')

    await sendRuntimeMessage({
      type: RESPONSE_COMPLETE_NOTIFICATION_CREATE_MESSAGE,
      payload: {
        title: 'Chat title',
        message: 'Your image is ready.',
        timestamp: 323,
        responseType: 'image',
        imageDataUrl: `data:image/jpeg;base64,${'a'.repeat(750_000)}`,
      },
    }, { tab: { id: 7, windowId: 9 } })

    expect(createNotificationMock).toHaveBeenCalledWith('response-complete:7:323', {
      type: 'basic',
      iconUrl: 'extension:///icon/512.png',
      title: 'Chat title',
      message: 'Your image is ready.',
    })
  })

  it('falls back to a basic notification when Firefox receives image payload data', async () => {
    vi.stubEnv('FIREFOX', 'true')
    await setResponseCompleteNotificationEnabled(true)
    permissionsContainsMock.mockResolvedValue(true)
    getPermissionLevelMock.mockResolvedValue('granted')

    await sendRuntimeMessage({
      type: RESPONSE_COMPLETE_NOTIFICATION_CREATE_MESSAGE,
      payload: {
        title: 'Chat title',
        message: 'Your image is ready.',
        timestamp: 324,
        responseType: 'image',
        imageDataUrl: `data:image/jpeg;base64,${'a'.repeat(128)}`,
      },
    }, { tab: { id: 7, windowId: 9 } })

    expect(createNotificationMock).toHaveBeenCalledWith('response-complete:7:324', {
      type: 'basic',
      iconUrl: 'extension:///icon/512.png',
      title: 'Chat title',
      message: 'Your image is ready.',
    })
    expect(getPlatformInfoMock).not.toHaveBeenCalled()
  })

  it('retries a basic notification when image notification creation fails', async () => {
    await setResponseCompleteNotificationEnabled(true)
    permissionsContainsMock.mockResolvedValue(true)
    getPermissionLevelMock.mockResolvedValue('granted')
    createNotificationMock.mockRejectedValueOnce(new Error('image template failed'))

    const response = await sendRuntimeMessage({
      type: RESPONSE_COMPLETE_NOTIFICATION_CREATE_MESSAGE,
      payload: {
        title: 'Chat title',
        message: 'Your image is ready.',
        timestamp: 325,
        responseType: 'image',
        imageDataUrl: `data:image/jpeg;base64,${'a'.repeat(128)}`,
      },
    }, { tab: { id: 7, windowId: 9 } })

    expect(response).toEqual({
      ok: true,
      readiness: 'allowed',
    })
    expect(createNotificationMock).toHaveBeenCalledTimes(2)
    expect(createNotificationMock).toHaveBeenNthCalledWith(2, 'response-complete:7:325', {
      type: 'basic',
      iconUrl: 'extension:///icon/512.png',
      title: 'Chat title',
      message: 'Your image is ready.',
    })
  })

  it('retries with the extension icon when the Chrome macOS image icon notification fails', async () => {
    await setResponseCompleteNotificationEnabled(true)
    permissionsContainsMock.mockResolvedValue(true)
    getPermissionLevelMock.mockResolvedValue('granted')
    getPlatformInfoMock.mockResolvedValue({
      os: 'mac',
      arch: 'x86-64',
      nacl_arch: 'x86-64',
    })
    createNotificationMock.mockRejectedValueOnce(new Error('image icon failed'))
    const imageDataUrl = `data:image/jpeg;base64,${'a'.repeat(128)}`

    const response = await sendRuntimeMessage({
      type: RESPONSE_COMPLETE_NOTIFICATION_CREATE_MESSAGE,
      payload: {
        title: 'Chat title',
        message: 'Your image is ready.',
        timestamp: 3251,
        responseType: 'image',
        imageDataUrl,
      },
    }, { tab: { id: 7, windowId: 9 } })

    expect(response).toEqual({
      ok: true,
      readiness: 'allowed',
    })
    expect(createNotificationMock).toHaveBeenCalledTimes(2)
    expect(createNotificationMock).toHaveBeenNthCalledWith(1, 'response-complete:7:3251', {
      type: 'basic',
      iconUrl: imageDataUrl,
      title: 'Chat title',
      message: 'Your image is ready.',
    })
    expect(createNotificationMock).toHaveBeenNthCalledWith(2, 'response-complete:7:3251', {
      type: 'basic',
      iconUrl: 'extension:///icon/512.png',
      title: 'Chat title',
      message: 'Your image is ready.',
    })
  })

  it('reports notification failure when image and basic notification creation fail', async () => {
    await setResponseCompleteNotificationEnabled(true)
    permissionsContainsMock.mockResolvedValue(true)
    getPermissionLevelMock.mockResolvedValue('granted')
    createNotificationMock
      .mockRejectedValueOnce(new Error('image template failed'))
      .mockRejectedValueOnce(new Error('basic template failed'))

    const response = await sendRuntimeMessage({
      type: RESPONSE_COMPLETE_NOTIFICATION_CREATE_MESSAGE,
      payload: {
        title: 'Chat title',
        message: 'Your image is ready.',
        timestamp: 326,
        responseType: 'image',
        imageDataUrl: `data:image/jpeg;base64,${'a'.repeat(128)}`,
      },
    }, { tab: { id: 7, windowId: 9 } })

    expect(response).toEqual({
      ok: false,
      readiness: 'allowed',
      error: 'notification-failed',
    })
  })

  it('normalizes and protects notification title and message', () => {
    expect(normalizeNotificationTitle('  ')).toBe('Gemini finished replying')
    expect(normalizeNotificationMessage('  ')).toBe('Your response is ready.')
    expect(normalizeNotificationMessage(` ${'word '.repeat(80)}`)).toHaveLength(200)
  })

  it('does not read tab url, title, or favicon fields', async () => {
    await setResponseCompleteNotificationEnabled(true)
    permissionsContainsMock.mockResolvedValue(true)
    getPermissionLevelMock.mockResolvedValue('granted')

    const sensitiveTab = {
      id: 7,
      windowId: 9,
      get url(): string {
        throw new Error('url should not be read')
      },
      get title(): string {
        throw new Error('title should not be read')
      },
      get favIconUrl(): string {
        throw new Error('favIconUrl should not be read')
      },
    }

    await expect(sendRuntimeMessage({
      type: RESPONSE_COMPLETE_NOTIFICATION_CREATE_MESSAGE,
      payload: {
        title: 'Safe title',
        message: 'Safe message',
        timestamp: 456,
        responseType: 'text',
      },
    }, { tab: sensitiveTab })).resolves.toMatchObject({
      ok: true,
    })
  })

  it('creates a test notification without chat content', async () => {
    await setResponseCompleteNotificationEnabled(true)
    permissionsContainsMock.mockResolvedValue(true)
    getPermissionLevelMock.mockResolvedValue('granted')

    await sendRuntimeMessage({
      type: RESPONSE_COMPLETE_NOTIFICATION_TEST_MESSAGE,
      payload: {
        timestamp: 789,
      },
    }, {})

    expect(createNotificationMock).toHaveBeenCalledWith('test:popup:789', expect.objectContaining({
      title: 'Gemini Power Kit notification test',
      message: 'Notifications are working.',
    }))

    notificationClosedListener?.('test:popup:789')
  })

  it('does not crash on startup when optional notifications API is unavailable', async () => {
    ;(browser as unknown as { notifications?: typeof browser.notifications }).notifications = undefined
    resetResponseCompleteNotificationBackgroundForTest()
    runtimeMessageListener = null
    notificationClickListener = null
    notificationClosedListener = null
    await setResponseCompleteNotificationEnabled(true)
    permissionsContainsMock.mockResolvedValue(true)

    expect(() => startResponseCompleteNotificationBackground()).not.toThrow()
    expect(notificationClickListener).toBeNull()

    await expect(sendRuntimeMessage({
      type: RESPONSE_COMPLETE_NOTIFICATION_CREATE_MESSAGE,
      payload: {
        title: 'Safe title',
        message: 'Safe message',
        timestamp: 999,
        responseType: 'text',
      },
    }, { tab: { id: 7, windowId: 9 } })).resolves.toEqual({
      ok: false,
      readiness: 'allowed-but-system-unknown',
      error: 'notification-failed',
    })
  })
})
