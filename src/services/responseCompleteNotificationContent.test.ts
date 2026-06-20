import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  RESPONSE_COMPLETE_NOTIFICATION_GET_DEEP_RESEARCH_STATUS_MESSAGE,
  type ResponseCompleteNotificationDeepResearchStatus,
} from '@/types/runtime-messages'
import {
  getDeepResearchDomStatus,
  getDeepResearchTitle,
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

function renderDeepResearchResponse(title: string, responseText = 'Research completed'): void {
  document.body.innerHTML = `
    <top-bar-actions>
      <div class="conversation-title-container">Chat title</div>
    </top-bar-actions>
    <div class="conversation-container" id="turn-1">
      <model-response>
        <structured-content-container>
          <div id="model-response-message-content-1">
            <p>${responseText}</p>
            <immersive-entry-chip>
              <gem-processing-card class="selected completed">
                <div class="container">
                  <span class="card-title gds-body-l">${title}</span>
                </div>
              </gem-processing-card>
            </immersive-entry-chip>
          </div>
        </structured-content-container>
      </model-response>
    </div>
  `
}

function renderImageResponse(imageAttributes = ''): void {
  document.body.innerHTML = `
    <top-bar-actions>
      <div class="conversation-title-container">Image chat</div>
    </top-bar-actions>
    <div class="conversation-container" id="turn-1">
      <model-response>
        <structured-content-container>
          <div id="model-response-message-content-1">
            <generated-image>
              <single-image>
                <div><div><button class="image-button"><img ${imageAttributes}></button></div></div>
              </single-image>
            </generated-image>
          </div>
        </structured-content-container>
      </model-response>
    </div>
  `
}

function mockImageProcessing(): void {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(
    new Blob(['source-image'], { type: 'image/png' }),
  )))
  vi.stubGlobal('createImageBitmap', vi.fn(async () => ({
    width: 128,
    height: 64,
    close: vi.fn(),
  } as unknown as ImageBitmap)))
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => {
    callback(new Blob(['compressed-image'], { type: 'image/jpeg' }))
  })
}

describe('responseCompleteNotificationContent', () => {
  beforeEach(() => {
    resetResponseCompleteNotificationContentProviderForTest()
    runtimeMessageListener = null
    document.body.innerHTML = ''
    document.title = ''
    window.history.replaceState(null, '', '/')
    setPageState('hidden', false)
    vi.useRealTimers()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('registers one content request listener', () => {
    startResponseCompleteNotificationContentProvider()
    startResponseCompleteNotificationContentProvider()

    expect(runtimeMessageListener).not.toBeNull()
  })

  it('responds to Deep Research status messages with a promise', async () => {
    window.history.replaceState(null, '', '/app/c_1')
    renderDeepResearchResponse('Research report title')
    startResponseCompleteNotificationContentProvider()

    const response = runtimeMessageListener?.({
      type: RESPONSE_COMPLETE_NOTIFICATION_GET_DEEP_RESEARCH_STATUS_MESSAGE,
    })

    expect(response).toBeInstanceOf(Promise)
    await expect(response as Promise<ResponseCompleteNotificationDeepResearchStatus>).resolves.toEqual({
      state: 'completed',
      title: 'Research report title',
      conversationId: 'c_1',
    })
  })

  it('extracts the latest text response and title', async () => {
    renderTextResponse('Final response text')

    await expect(getResponseCompleteNotificationContent()).resolves.toEqual({
      isForeground: false,
      title: 'Chat title',
      message: 'Final response text',
      responseType: 'text',
    })
  })

  it('uses the processing card Title as Deep Research notification details', async () => {
    renderDeepResearchResponse('拼多多深度研究报告')

    await expect(getResponseCompleteNotificationContent('deep-research')).resolves.toEqual({
      isForeground: false,
      title: 'Chat title',
      message: '拼多多深度研究报告',
      responseType: 'text',
      completionConfirmed: true,
    })
  })

  it('reports Deep Research DOM status from the final turn', () => {
    window.history.replaceState(null, '', '/app/c_1')
    renderDeepResearchResponse('Research report title')
    expect(getDeepResearchDomStatus()).toEqual({
      state: 'completed',
      title: 'Research report title',
      conversationId: 'c_1',
    })

    document.querySelector('gem-processing-card')!.className = 'selected processing'
    expect(getDeepResearchDomStatus()).toEqual({
      state: 'processing',
      title: 'Research report title',
      conversationId: 'c_1',
    })

    document.body.innerHTML = ''
    expect(getDeepResearchDomStatus()).toEqual({ state: 'absent' })
  })

  it('detects Deep Research cards by card class without requiring an immersive-entry-chip ancestor', () => {
    window.history.replaceState(null, '', '/app/c_1')
    document.body.innerHTML = `
      <div class="conversation-container" id="turn-1">
        <model-response>
          <structured-content-container>
            <div id="model-response-message-content-1">
              <gem-processing-card class="selected processing gem-shimmer-active">
                <span class="card-title gds-body-l">Running report</span>
              </gem-processing-card>
            </div>
          </structured-content-container>
        </model-response>
      </div>
    `

    expect(getDeepResearchDomStatus()).toEqual({
      state: 'processing',
      title: 'Running report',
      conversationId: 'c_1',
    })

    document.querySelector('gem-processing-card')!.className = 'selected completed'
    expect(getDeepResearchDomStatus()).toEqual({
      state: 'completed',
      title: 'Running report',
      conversationId: 'c_1',
    })
    expect(getDeepResearchTitle(document.querySelector('.conversation-container')!)).toBe('Running report')
  })

  it('retries until the Deep Research Title is available', async () => {
    vi.useFakeTimers()
    renderTextResponse('Research completed')
    const contentPromise = getResponseCompleteNotificationContent('deep-research')
    setTimeout(() => {
      document.querySelector('model-response')!.insertAdjacentHTML(
        'beforeend',
        '<immersive-entry-chip><gem-processing-card class="completed"><span class="card-title">Delayed report title</span></gem-processing-card></immersive-entry-chip>',
      )
    }, 150)

    await vi.advanceTimersByTimeAsync(300)

    await expect(contentPromise).resolves.toMatchObject({
      message: 'Delayed report title',
      responseType: 'text',
      completionConfirmed: true,
    })
  })

  it('does not confirm Deep Research while the processing card is still running', async () => {
    vi.useFakeTimers()
    renderDeepResearchResponse('Research report title')
    document.querySelector('gem-processing-card')!.className = 'selected processing'
    const contentPromise = getResponseCompleteNotificationContent('deep-research')

    await vi.advanceTimersByTimeAsync(1_000)

    await expect(contentPromise).resolves.toMatchObject({
      completionConfirmed: false,
    })
  })

  it('uses the last non-empty Deep Research Title in the final turn', () => {
    renderDeepResearchResponse('First title')
    const turn = document.querySelector('.conversation-container')!
    turn.querySelector('gem-processing-card')!.insertAdjacentHTML(
      'afterend',
      '<gem-processing-card class="completed"><span class="card-title"> Final title </span></gem-processing-card>',
    )

    expect(getDeepResearchTitle(turn)).toBe('Final title')
  })

  it('keeps the standard response summary when a Deep Research card exists', async () => {
    renderDeepResearchResponse('Research report title', 'Standard response text')

    await expect(getResponseCompleteNotificationContent()).resolves.toMatchObject({
      message: expect.stringContaining('Standard response text'),
    })
  })

  it('reports foreground state while the page is visible and focused', async () => {
    setPageState('visible', true)
    renderTextResponse('Final response text')

    await expect(getResponseCompleteNotificationContent()).resolves.toMatchObject({
      isForeground: true,
      message: 'Final response text',
    })
  })

  it('reports non-foreground state while the page is visible but unfocused', async () => {
    setPageState('visible', false)
    renderTextResponse('Final response text')

    await expect(getResponseCompleteNotificationContent()).resolves.toMatchObject({
      isForeground: false,
      message: 'Final response text',
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

  it('waits for a delayed final image source before creating notification image data', async () => {
    vi.useFakeTimers()
    mockImageProcessing()
    renderImageResponse()

    const contentPromise = getResponseCompleteNotificationContent()
    setTimeout(() => {
      document.querySelector('img')!.setAttribute('src', 'https://example.com/image.png')
    }, 250)

    await vi.advanceTimersByTimeAsync(1_000)

    await expect(contentPromise).resolves.toMatchObject({
      isForeground: false,
      title: 'Image chat',
      message: 'Your image is ready.',
      responseType: 'image',
      imageDataUrl: expect.stringMatching(/^data:image\/jpeg;base64,/),
    })
    expect(fetch).toHaveBeenCalledWith('https://example.com/image.png')
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
      isForeground: false,
      responseType: 'image',
    })
  })
})
