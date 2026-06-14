import { beforeEach, describe, expect, it, vi } from 'vitest'
import { browser } from 'wxt/browser'
import {
  setResponseCompleteNotificationAudioEnabled,
  setResponseCompleteNotificationEnabled,
} from '@/services/responseCompleteNotificationSettings'
import {
  playResponseCompleteNotificationAudio,
  resetResponseCompleteNotificationAudioForTest,
} from './responseCompleteNotificationAudio'

const {
  getContextsMock,
  sendMessageMock,
  createDocumentMock,
  permissionsContainsMock,
} = vi.hoisted(() => ({
  getContextsMock: vi.fn(() => Promise.resolve<unknown[]>([])),
  sendMessageMock: vi.fn(() => Promise.resolve()),
  createDocumentMock: vi.fn(() => Promise.resolve()),
  permissionsContainsMock: vi.fn(() => Promise.resolve(true)),
}))

vi.mock('wxt/browser', () => ({
  browser: {
    runtime: {
      getURL: vi.fn((path: string) => `chrome-extension://extension-id${path}`),
      getContexts: getContextsMock,
      sendMessage: sendMessageMock,
    },
    offscreen: {
      createDocument: createDocumentMock,
    },
    permissions: {
      contains: permissionsContainsMock,
    },
  },
}))

describe('responseCompleteNotificationAudio', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
    resetResponseCompleteNotificationAudioForTest()
    await setResponseCompleteNotificationEnabled(false)
    await setResponseCompleteNotificationAudioEnabled(false)
    permissionsContainsMock.mockResolvedValue(true)
    getContextsMock.mockResolvedValue([])
    createDocumentMock.mockResolvedValue()
  })

  it('does nothing while audio is disabled', async () => {
    await setResponseCompleteNotificationEnabled(true)

    await playResponseCompleteNotificationAudio()

    expect(createDocumentMock).not.toHaveBeenCalled()
    expect(sendMessageMock).not.toHaveBeenCalled()
  })

  it('does nothing without offscreen permission', async () => {
    await setResponseCompleteNotificationEnabled(true)
    await setResponseCompleteNotificationAudioEnabled(true)
    permissionsContainsMock.mockResolvedValue(false)

    await playResponseCompleteNotificationAudio()

    expect(createDocumentMock).not.toHaveBeenCalled()
    expect(sendMessageMock).not.toHaveBeenCalled()
  })

  it('creates one offscreen document for concurrent playback requests', async () => {
    await setResponseCompleteNotificationEnabled(true)
    await setResponseCompleteNotificationAudioEnabled(true)

    await Promise.all([
      playResponseCompleteNotificationAudio(),
      playResponseCompleteNotificationAudio(),
    ])

    expect(createDocumentMock).toHaveBeenCalledTimes(1)
    expect(sendMessageMock).toHaveBeenCalledTimes(2)
  })

  it('reuses an existing offscreen document', async () => {
    await setResponseCompleteNotificationEnabled(true)
    await setResponseCompleteNotificationAudioEnabled(true)
    getContextsMock.mockResolvedValue([{}])

    await playResponseCompleteNotificationAudio()

    expect(createDocumentMock).not.toHaveBeenCalled()
    expect(sendMessageMock).toHaveBeenCalledWith({
      type: 'response-complete-notification-audio:play',
      target: 'offscreen',
    })
  })

  it('uses service worker clients before Chrome 116', async () => {
    await setResponseCompleteNotificationEnabled(true)
    await setResponseCompleteNotificationAudioEnabled(true)
    const runtime = browser.runtime as typeof browser.runtime & {
      getContexts?: typeof getContextsMock
    }
    const originalGetContexts = runtime.getContexts
    Object.defineProperty(runtime, 'getContexts', {
      configurable: true,
      value: undefined,
    })
    vi.stubGlobal('clients', {
      matchAll: vi.fn(() => Promise.resolve([
        { url: 'chrome-extension://extension-id/notification-audio-offscreen.html' },
      ])),
    })

    await playResponseCompleteNotificationAudio()

    expect(createDocumentMock).not.toHaveBeenCalled()
    expect(sendMessageMock).toHaveBeenCalledTimes(1)
    Object.defineProperty(runtime, 'getContexts', {
      configurable: true,
      value: originalGetContexts,
    })
  })

  it('does nothing on Firefox', async () => {
    vi.stubEnv('FIREFOX', 'true')
    await setResponseCompleteNotificationEnabled(true)
    await setResponseCompleteNotificationAudioEnabled(true)

    await playResponseCompleteNotificationAudio()

    expect(createDocumentMock).not.toHaveBeenCalled()
    expect(sendMessageMock).not.toHaveBeenCalled()
  })
})
