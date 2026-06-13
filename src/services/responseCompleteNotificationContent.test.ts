import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  getResponseCompleteNotificationContent,
  resetResponseCompleteNotificationContentProviderForTest,
  startResponseCompleteNotificationContentProvider,
} from './responseCompleteNotificationContent'

type RuntimeMessageListener = (message: unknown) => unknown
let runtimeMessageListener: RuntimeMessageListener | null = null

vi.mock('wxt/browser', () => ({
  browser: {
    runtime: {
      onMessage: {
        addListener: vi.fn((listener: RuntimeMessageListener) => {
          runtimeMessageListener = listener
        }),
      },
    },
  },
}))

function setPageState(visibilityState: DocumentVisibilityState, hasFocus: boolean): void {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value: visibilityState,
  })
  document.hasFocus = vi.fn(() => hasFocus)
}

function renderTextResponse(text: string): void {
  document.body.innerHTML = `
    <top-bar-actions>
      <div class="conversation-title-container">Chat title</div>
    </top-bar-actions>
    <div class="conversation-container" id="turn-1">
      <model-response>
        <structured-content-container>
          <div id="model-response-message-content-1">${text}</div>
        </structured-content-container>
      </model-response>
    </div>
  `
}

describe('responseCompleteNotificationContent', () => {
  beforeEach(() => {
    resetResponseCompleteNotificationContentProviderForTest()
    runtimeMessageListener = null
    document.body.innerHTML = ''
    document.title = ''
    setPageState('hidden', false)
    vi.useRealTimers()
  })

  it('registers one content request listener', () => {
    startResponseCompleteNotificationContentProvider()
    startResponseCompleteNotificationContentProvider()

    expect(runtimeMessageListener).not.toBeNull()
  })

  it('extracts the latest text response and title', async () => {
    renderTextResponse('Final response text')

    await expect(getResponseCompleteNotificationContent()).resolves.toEqual({
      suppressed: false,
      title: 'Chat title',
      message: 'Final response text',
      responseType: 'text',
    })
  })

  it('suppresses content while the page is visible and focused', async () => {
    setPageState('visible', true)
    renderTextResponse('Final response text')

    await expect(getResponseCompleteNotificationContent()).resolves.toMatchObject({
      suppressed: true,
    })
  })

  it('retries until final DOM content is available', async () => {
    vi.useFakeTimers()
    const contentPromise = getResponseCompleteNotificationContent()
    setTimeout(() => renderTextResponse('Delayed response'), 150)

    await vi.advanceTimersByTimeAsync(300)

    await expect(contentPromise).resolves.toMatchObject({
      message: 'Delayed response',
      responseType: 'text',
    })
  })

  it('returns image response metadata on Firefox without image processing', async () => {
    vi.stubEnv('FIREFOX', 'true')
    document.body.innerHTML = `
      <div class="conversation-container" id="turn-1">
        <model-response>
          <structured-content-container>
            <div id="model-response-message-content-1">
              <generated-image>
                <single-image>
                  <div><div><button class="image-button"><img src="https://example.com/image.png"></button></div></div>
                </single-image>
              </generated-image>
            </div>
          </structured-content-container>
        </model-response>
      </div>
    `

    await expect(getResponseCompleteNotificationContent()).resolves.toMatchObject({
      suppressed: false,
      responseType: 'image',
    })
  })
})
