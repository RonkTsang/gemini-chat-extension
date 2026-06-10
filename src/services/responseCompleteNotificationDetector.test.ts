import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { browser } from 'wxt/browser'

import { setResponseCompleteNotificationEnabled } from './responseCompleteNotificationSettings'
import {
  getCompletedModelResponseSummary,
  responseCompleteNotificationDetector,
} from './responseCompleteNotificationDetector'
import { RESPONSE_COMPLETE_NOTIFICATION_CREATE_MESSAGE } from '@/types/runtime-messages'
import { eventBus } from '@/utils/eventbus'

vi.mock('wxt/browser', () => ({
  browser: {
    runtime: {
      sendMessage: vi.fn(() => Promise.resolve({ ok: true })),
    },
  },
}))

const sendMessageMock = vi.mocked(browser.runtime.sendMessage)
let consoleInfoSpy: ReturnType<typeof vi.spyOn>

async function flushMutations(): Promise<void> {
  await Promise.resolve()
  await new Promise((resolve) => setTimeout(resolve, 0))
}

function getDetectorLogEvents(): string[] {
  return getDetectorLogPayloads().flatMap(payload => (
    typeof payload.event === 'string' ? [payload.event] : []
  ))
}

function getDetectorLogPayloads(): Array<Record<string, unknown>> {
  return consoleInfoSpy.mock.calls.flatMap((call: unknown[]) => {
    if (
      call[0] !== '[ResponseCompleteNotificationDetector]'
      || typeof call[1] !== 'string'
    ) {
      return []
    }

    return [JSON.parse(call[1]) as Record<string, unknown>]
  })
}

function setVisibilityState(visibilityState: DocumentVisibilityState): void {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value: visibilityState,
  })
}

function setHasFocus(hasFocus: boolean): void {
  Object.defineProperty(document, 'hasFocus', {
    configurable: true,
    value: () => hasFocus,
  })
}

function modelResponseHtml(id: string, message: string): string {
  return `
    <model-response data-response-id="${id}">
      <response-container>
        <structured-content-container>
          <message-content>
            <div id="${id}-model-response-message-content">
              <div class="markdown">${message}</div>
            </div>
          </message-content>
        </structured-content-container>
      </response-container>
    </model-response>
  `
}

function imageResponseHtml(
  id: string,
  options: { caption?: string; complete?: boolean; imageSrc?: string } = {},
): string {
  const { caption = '', complete = false, imageSrc } = options
  const completedContent = imageSrc
    ? `<single-image>
        <div><div><button class="image-button"><img src="${imageSrc}"></button></div></div>
      </single-image>`
    : '<single-image></single-image>'
  return `
    <model-response data-response-id="${id}">
      <response-container>
        <structured-content-container>
          <message-content>
            <div id="${id}-model-response-message-content">
              ${caption ? `<div class="markdown">${caption}</div>` : ''}
              <generated-image>
                ${complete ? completedContent : ''}
              </generated-image>
            </div>
          </message-content>
        </structured-content-container>
      </response-container>
    </model-response>
  `
}

function setupImageEncodingMocks(options: {
  blobType?: string
  bitmapWidth?: number
  bitmapHeight?: number
  outputBlob?: Blob
} = {}): {
  fetchMock: ReturnType<typeof vi.fn>
  drawImageMock: ReturnType<typeof vi.fn>
} {
  const {
    blobType = 'image/png',
    bitmapWidth = 1024,
    bitmapHeight = 512,
    outputBlob = new Blob(['jpeg'], { type: 'image/jpeg' }),
  } = options
  const fetchMock = vi.fn(() => Promise.resolve({
    ok: true,
    blob: () => Promise.resolve(new Blob(['source'], { type: blobType })),
  }))
  const drawImageMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('createImageBitmap', vi.fn(() => Promise.resolve({
    width: bitmapWidth,
    height: bitmapHeight,
    close: vi.fn(),
  })))
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage: drawImageMock,
  } as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((
    callback: BlobCallback,
  ) => {
    callback(outputBlob)
  })
  vi.stubGlobal('FileReader', class {
    result: string | ArrayBuffer | null = null
    onload: (() => void) | null = null
    onerror: (() => void) | null = null

    readAsDataURL(blob: Blob): void {
      this.result = `data:${blob.type};base64,amBlZw==`
      this.onload?.()
    }
  })
  return { fetchMock, drawImageMock }
}

function turnHtml(
  turnId: string,
  responses: Array<{ id: string; message: string }>,
): string {
  return `
    <div class="conversation-container" id="${turnId}">
      <user-query></user-query>
      ${responses.map((response) => modelResponseHtml(
        response.id,
        response.message,
      )).join('')}
    </div>
  `
}

function renderPage(baselineTurn?: {
  id: string
  message: string
}): void {
  document.body.innerHTML = `
    <top-bar-actions>
      <div class="conversation-title-container">Quarterly research</div>
    </top-bar-actions>
    <chat-window>
      <infinite-scroller data-test-id="chat-history-container">
        ${baselineTurn
          ? turnHtml(baselineTurn.id, [{
            id: `${baselineTurn.id}-response`,
            message: baselineTurn.message,
          }])
          : ''}
      </infinite-scroller>
    </chat-window>
    <input-area-v2>
      <button class="send-button submit" aria-label="Send message"></button>
    </input-area-v2>
  `
}

function getChatHistory(): HTMLElement {
  return document.querySelector<HTMLElement>('[data-test-id="chat-history-container"]')!
}

function appendTurn(
  turnId: string,
  responses: Array<{ id: string; message: string }>,
): HTMLElement {
  enterGeneratingState()
  getChatHistory().insertAdjacentHTML('beforeend', turnHtml(turnId, responses))
  return document.getElementById(turnId)!
}

function getSendButton(): HTMLElement {
  return document.querySelector<HTMLElement>('input-area-v2 button.send-button')!
}

function setSendButtonGenerating(isGenerating: boolean): void {
  const sendButton = getSendButton()
  sendButton.classList.toggle('submit', !isGenerating)
  sendButton.classList.toggle('stop', isGenerating)
  sendButton.setAttribute(
    'aria-label',
    isGenerating ? 'Stop generating' : 'Send message',
  )
}

function enterGeneratingState(): void {
  setSendButtonGenerating(false)
  setSendButtonGenerating(true)
}

function appendResponseText(responseId: string, text: string): void {
  document.querySelector(`[data-response-id="${responseId}"] .markdown`)!
    .appendChild(document.createTextNode(text))
}

function appendGeneratedImage(responseId: string): HTMLElement {
  const content = document.querySelector<HTMLElement>(
    `[data-response-id="${responseId}"] [id*="model-response-message-content"]`,
  )!
  content.insertAdjacentHTML('beforeend', '<generated-image></generated-image>')
  return content.querySelector('generated-image')!
}

describe('responseCompleteNotificationDetector', () => {
  beforeEach(async () => {
    responseCompleteNotificationDetector.stop()
    await setResponseCompleteNotificationEnabled(false)
    document.body.innerHTML = ''
    document.title = ''
    sendMessageMock.mockClear()
    consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    setVisibilityState('hidden')
    setHasFocus(false)
  })

  afterEach(() => {
    consoleInfoSpy.mockRestore()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('does not monitor or send while disabled', async () => {
    vi.useFakeTimers()
    renderPage()
    await responseCompleteNotificationDetector.start()

    appendTurn('turn-1', [{ id: 'response-1', message: 'Finished response' }])
    await vi.advanceTimersByTimeAsync(5_000)

    expect(sendMessageMock).not.toHaveBeenCalled()
  })

  it('treats an existing turn as baseline when monitoring starts', async () => {
    vi.useFakeTimers()
    await setResponseCompleteNotificationEnabled(true)
    renderPage({ id: 'baseline-turn', message: 'Historical response' })

    await responseCompleteNotificationDetector.start()
    await vi.advanceTimersByTimeAsync(10_000)

    expect(sendMessageMock).not.toHaveBeenCalled()
  })

  it('ignores an asynchronously loaded historical image turn without send button generation', async () => {
    vi.useFakeTimers()
    await setResponseCompleteNotificationEnabled(true)
    renderPage()
    await responseCompleteNotificationDetector.start()

    getChatHistory().insertAdjacentHTML('beforeend', `
      <div class="conversation-container" id="historical-turn">
        ${imageResponseHtml('historical-response', { complete: true })}
      </div>
    `)
    await vi.advanceTimersByTimeAsync(10_000)

    expect(sendMessageMock).not.toHaveBeenCalled()
    expect(getDetectorLogPayloads()).toContainEqual(expect.objectContaining({
      event: 'turn-ignored-generation-not-armed',
      turnId: 'historical-turn',
    }))
  })

  it('ignores provisional, id-less, and non-latest turns', async () => {
    vi.useFakeTimers()
    await setResponseCompleteNotificationEnabled(true)
    renderPage({ id: 'baseline-turn', message: 'Historical response' })
    await responseCompleteNotificationDetector.start()

    getChatHistory().insertAdjacentHTML('beforeend', `
      <pending-request class="conversation-container">
        ${modelResponseHtml('provisional-response', 'Provisional response')}
      </pending-request>
    `)
    getChatHistory().insertAdjacentHTML('beforeend', `
      <div class="conversation-container">
        ${modelResponseHtml('idless-response', 'Id-less response')}
      </div>
    `)
    getChatHistory().insertAdjacentHTML('afterbegin', turnHtml('historical-turn', [{
      id: 'historical-response',
      message: 'Loaded history',
    }]))
    await vi.advanceTimersByTimeAsync(10_000)

    expect(sendMessageMock).not.toHaveBeenCalled()
  })

  it('does not treat a final turn inserted before a newer provisional turn as latest', async () => {
    vi.useFakeTimers()
    await setResponseCompleteNotificationEnabled(true)
    renderPage()
    const provisionalTurn = document.createElement('pending-request')
    provisionalTurn.className = 'conversation-container'
    getChatHistory().appendChild(provisionalTurn)
    await responseCompleteNotificationDetector.start()

    provisionalTurn.insertAdjacentHTML('beforebegin', turnHtml('older-final-turn', [{
      id: 'older-response',
      message: 'Older final response',
    }]))
    await vi.advanceTimersByTimeAsync(10_000)

    expect(sendMessageMock).not.toHaveBeenCalled()
  })

  it('starts watching a newly added latest final turn and completes after five seconds', async () => {
    vi.useFakeTimers()
    await setResponseCompleteNotificationEnabled(true)
    renderPage()
    await responseCompleteNotificationDetector.start()

    appendTurn('turn-1', [{ id: 'response-1', message: 'Finished response' }])
    await vi.advanceTimersByTimeAsync(4_999)
    expect(sendMessageMock).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    expect(sendMessageMock).toHaveBeenCalledWith({
      type: RESPONSE_COMPLETE_NOTIFICATION_CREATE_MESSAGE,
      payload: expect.objectContaining({
        title: 'Quarterly research',
        message: 'Finished response',
        responseType: 'text',
      }),
    })
  })

  it('waits for a non-empty response content container before starting the timer', async () => {
    vi.useFakeTimers()
    await setResponseCompleteNotificationEnabled(true)
    renderPage()
    await responseCompleteNotificationDetector.start()

    const turn = appendTurn('turn-1', [{ id: 'response-1', message: '' }])
    await vi.advanceTimersByTimeAsync(10_000)
    expect(sendMessageMock).not.toHaveBeenCalled()
    expect(getDetectorLogPayloads()).not.toContainEqual(expect.objectContaining({
      event: 'response-type-detected',
      responseType: 'image',
    }))

    turn.querySelector('.markdown')!.textContent = 'Response appeared'
    await vi.advanceTimersByTimeAsync(4_999)
    expect(sendMessageMock).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    expect(sendMessageMock).toHaveBeenCalledTimes(1)
  })

  it('logs structured content and model response message content once when detected', async () => {
    vi.useFakeTimers()
    await setResponseCompleteNotificationEnabled(true)
    renderPage()
    await responseCompleteNotificationDetector.start()

    const turn = appendTurn('turn-1', [])
    await vi.advanceTimersByTimeAsync(0)
    expect(getDetectorLogEvents()).not.toContain('structured-content-container-detected')
    expect(getDetectorLogEvents()).not.toContain('model-response-message-content-detected')

    turn.insertAdjacentHTML('beforeend', `
      <model-response data-response-id="response-1">
        <response-container>
          <structured-content-container></structured-content-container>
        </response-container>
      </model-response>
    `)
    await vi.advanceTimersByTimeAsync(0)
    expect(getDetectorLogEvents().filter(
      event => event === 'structured-content-container-detected',
    )).toHaveLength(1)
    expect(getDetectorLogEvents()).not.toContain('model-response-message-content-detected')

    turn.querySelector('structured-content-container')!.insertAdjacentHTML('beforeend', `
      <message-content>
        <div id="response-1-model-response-message-content">
          <div class="markdown">Response appeared</div>
        </div>
      </message-content>
    `)
    await vi.advanceTimersByTimeAsync(0)
    appendResponseText('response-1', ' updated')
    await vi.advanceTimersByTimeAsync(0)

    expect(getDetectorLogEvents().filter(
      event => event === 'structured-content-container-detected',
    )).toHaveLength(1)
    expect(getDetectorLogEvents().filter(
      event => event === 'model-response-message-content-detected',
    )).toHaveLength(1)
  })

  it('detects an incomplete image response without completing it', async () => {
    vi.useFakeTimers()
    await setResponseCompleteNotificationEnabled(true)
    renderPage()
    await responseCompleteNotificationDetector.start()

    enterGeneratingState()
    getChatHistory().insertAdjacentHTML('beforeend', `
      <div class="conversation-container" id="turn-1">
        ${imageResponseHtml('response-1')}
      </div>
    `)
    await vi.advanceTimersByTimeAsync(10_000)

    expect(sendMessageMock).not.toHaveBeenCalled()
    expect(getDetectorLogPayloads()).toContainEqual(expect.objectContaining({
      event: 'response-type-detected',
      turnId: 'turn-1',
      responseType: 'image',
      completionMode: 'immediate',
    }))
    expect(getDetectorLogEvents()).not.toContain('response-type-completed')
  })

  it('falls back to a basic image notification after waiting for a missing final image', async () => {
    vi.useFakeTimers()
    await setResponseCompleteNotificationEnabled(true)
    renderPage()
    await responseCompleteNotificationDetector.start()

    enterGeneratingState()
    getChatHistory().insertAdjacentHTML('beforeend', `
      <div class="conversation-container" id="turn-1">
        ${imageResponseHtml('response-1')}
      </div>
    `)
    await vi.advanceTimersByTimeAsync(0)
    document.querySelector('generated-image')!
      .insertAdjacentHTML('beforeend', '<single-image></single-image>')
    await vi.advanceTimersByTimeAsync(4_999)
    expect(sendMessageMock).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)

    expect(sendMessageMock).toHaveBeenCalledTimes(1)
    expect(sendMessageMock).toHaveBeenCalledWith({
      type: RESPONSE_COMPLETE_NOTIFICATION_CREATE_MESSAGE,
      payload: expect.objectContaining({
        message: 'Your image is ready.',
        responseType: 'image',
      }),
    })
  })

  it('falls back after waiting when an initially complete image has no final image element', async () => {
    vi.useFakeTimers()
    await setResponseCompleteNotificationEnabled(true)
    renderPage()
    await responseCompleteNotificationDetector.start()

    enterGeneratingState()
    getChatHistory().insertAdjacentHTML('beforeend', `
      <div class="conversation-container" id="turn-1">
        ${imageResponseHtml('response-1', { complete: true })}
      </div>
    `)
    await vi.advanceTimersByTimeAsync(5_000)

    expect(sendMessageMock).toHaveBeenCalledTimes(1)
  })

  it('uses the final image as a compressed image notification preview when available', async () => {
    vi.useFakeTimers()
    const { fetchMock, drawImageMock } = setupImageEncodingMocks()
    await setResponseCompleteNotificationEnabled(true)
    renderPage()
    await responseCompleteNotificationDetector.start()

    enterGeneratingState()
    getChatHistory().insertAdjacentHTML('beforeend', `
      <div class="conversation-container" id="turn-1">
        ${imageResponseHtml('response-1', {
          complete: true,
          imageSrc: 'blob:https://gemini.google.com/image-1',
        })}
      </div>
    `)
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(0)
    await Promise.resolve()
    await vi.advanceTimersByTimeAsync(0)

    expect(fetchMock).toHaveBeenCalledWith(
      'blob:https://gemini.google.com/image-1',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
    expect(drawImageMock).toHaveBeenCalledWith(
      expect.anything(),
      0,
      0,
      512,
      256,
    )
    expect(sendMessageMock).toHaveBeenCalledWith({
      type: RESPONSE_COMPLETE_NOTIFICATION_CREATE_MESSAGE,
      payload: expect.objectContaining({
        responseType: 'image',
        imageDataUrl: expect.stringMatching(/^data:image\/jpeg;base64,/),
      }),
    })
    expect(getDetectorLogPayloads()).toContainEqual(expect.objectContaining({
      event: 'image-notification-data-created',
      width: 512,
      height: 256,
    }))
  })

  it('waits up to five seconds for the final image element to appear', async () => {
    vi.useFakeTimers()
    setupImageEncodingMocks()
    await setResponseCompleteNotificationEnabled(true)
    renderPage()
    await responseCompleteNotificationDetector.start()

    enterGeneratingState()
    getChatHistory().insertAdjacentHTML('beforeend', `
      <div class="conversation-container" id="turn-1">
        ${imageResponseHtml('response-1')}
      </div>
    `)
    await vi.advanceTimersByTimeAsync(0)
    document.querySelector('generated-image')!
      .insertAdjacentHTML('beforeend', '<single-image></single-image>')
    await vi.advanceTimersByTimeAsync(2_000)
    expect(sendMessageMock).not.toHaveBeenCalled()

    document.querySelector('single-image')!.insertAdjacentHTML('beforeend', `
      <div><div><button class="image-button">
        <img src="blob:https://gemini.google.com/image-1">
      </button></div></div>
    `)
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(0)
    await Promise.resolve()
    await vi.advanceTimersByTimeAsync(0)

    expect(sendMessageMock).toHaveBeenCalledWith({
      type: RESPONSE_COMPLETE_NOTIFICATION_CREATE_MESSAGE,
      payload: expect.objectContaining({
        responseType: 'image',
        imageDataUrl: expect.stringMatching(/^data:image\/jpeg;base64,/),
      }),
    })
  })

  it('waits for the final image element to receive a source before reading it', async () => {
    vi.useFakeTimers()
    const { fetchMock } = setupImageEncodingMocks()
    await setResponseCompleteNotificationEnabled(true)
    renderPage()
    await responseCompleteNotificationDetector.start()

    enterGeneratingState()
    getChatHistory().insertAdjacentHTML('beforeend', `
      <div class="conversation-container" id="turn-1">
        ${imageResponseHtml('response-1')}
      </div>
    `)
    await vi.advanceTimersByTimeAsync(0)
    document.querySelector('generated-image')!.insertAdjacentHTML('beforeend', `
      <single-image>
        <div><div><button class="image-button"><img></button></div></div>
      </single-image>
    `)
    await vi.advanceTimersByTimeAsync(2_000)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(sendMessageMock).not.toHaveBeenCalled()

    document.querySelector('button.image-button img')!
      .setAttribute('src', 'blob:https://gemini.google.com/image-1')
    await vi.advanceTimersByTimeAsync(100)
    await Promise.resolve()
    await vi.advanceTimersByTimeAsync(0)

    expect(fetchMock).toHaveBeenCalledWith(
      'blob:https://gemini.google.com/image-1',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
    expect(sendMessageMock).toHaveBeenCalledWith({
      type: RESPONSE_COMPLETE_NOTIFICATION_CREATE_MESSAGE,
      payload: expect.objectContaining({
        responseType: 'image',
        imageDataUrl: expect.stringMatching(/^data:image\/jpeg;base64,/),
      }),
    })
  })

  it('falls back when final image fetch does not return an image blob', async () => {
    vi.useFakeTimers()
    setupImageEncodingMocks({ blobType: 'text/plain' })
    await setResponseCompleteNotificationEnabled(true)
    renderPage()
    await responseCompleteNotificationDetector.start()

    enterGeneratingState()
    getChatHistory().insertAdjacentHTML('beforeend', `
      <div class="conversation-container" id="turn-1">
        ${imageResponseHtml('response-1', {
          complete: true,
          imageSrc: 'blob:https://gemini.google.com/image-1',
        })}
      </div>
    `)
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(0)
    await Promise.resolve()
    await vi.advanceTimersByTimeAsync(0)

    expect(sendMessageMock).toHaveBeenCalledWith({
      type: RESPONSE_COMPLETE_NOTIFICATION_CREATE_MESSAGE,
      payload: expect.not.objectContaining({
        imageDataUrl: expect.any(String),
      }),
    })
    expect(getDetectorLogPayloads()).toContainEqual(expect.objectContaining({
      event: 'image-notification-fallback-basic',
      reason: 'image-blob-invalid',
    }))
  })

  it('switches from text to image and clears the text inactivity timer', async () => {
    vi.useFakeTimers()
    await setResponseCompleteNotificationEnabled(true)
    renderPage()
    await responseCompleteNotificationDetector.start()

    appendTurn('turn-1', [{ id: 'response-1', message: 'Generating image' }])
    await vi.advanceTimersByTimeAsync(4_000)
    const generatedImage = appendGeneratedImage('response-1')
    await vi.advanceTimersByTimeAsync(6_000)
    expect(sendMessageMock).not.toHaveBeenCalled()

    generatedImage.insertAdjacentHTML('beforeend', '<single-image></single-image>')
    await vi.advanceTimersByTimeAsync(5_000)

    expect(sendMessageMock).toHaveBeenCalledTimes(1)
    expect(getDetectorLogPayloads().filter(
      payload => payload.event === 'response-type-detected',
    )).toEqual([
      expect.objectContaining({ responseType: 'text' }),
      expect.objectContaining({ responseType: 'image' }),
    ])
  })

  it('uses existing text as the summary for a completed image response', async () => {
    vi.useFakeTimers()
    await setResponseCompleteNotificationEnabled(true)
    renderPage()
    await responseCompleteNotificationDetector.start()

    enterGeneratingState()
    getChatHistory().insertAdjacentHTML('beforeend', `
      <div class="conversation-container" id="turn-1">
        ${imageResponseHtml('response-1', {
          caption: 'Generated landscape',
          complete: true,
        })}
      </div>
    `)
    await vi.advanceTimersByTimeAsync(5_000)

    expect(sendMessageMock).toHaveBeenCalledWith({
      type: RESPONSE_COMPLETE_NOTIFICATION_CREATE_MESSAGE,
      payload: expect.objectContaining({
        message: 'Generated landscape',
      }),
    })
  })

  it('does not fetch image data when the completed image turn is foreground-suppressed', async () => {
    vi.useFakeTimers()
    const { fetchMock } = setupImageEncodingMocks()
    await setResponseCompleteNotificationEnabled(true)
    setVisibilityState('visible')
    setHasFocus(true)
    renderPage()
    await responseCompleteNotificationDetector.start()

    enterGeneratingState()
    getChatHistory().insertAdjacentHTML('beforeend', `
      <div class="conversation-container" id="turn-1">
        ${imageResponseHtml('response-1', {
          complete: true,
          imageSrc: 'blob:https://gemini.google.com/image-1',
        })}
      </div>
    `)
    await vi.advanceTimersByTimeAsync(5_000)

    expect(fetchMock).not.toHaveBeenCalled()
    expect(sendMessageMock).not.toHaveBeenCalled()
  })

  it('does not notify an old image turn after it is replaced while waiting for an image', async () => {
    vi.useFakeTimers()
    await setResponseCompleteNotificationEnabled(true)
    renderPage()
    await responseCompleteNotificationDetector.start()

    enterGeneratingState()
    getChatHistory().insertAdjacentHTML('beforeend', `
      <div class="conversation-container" id="turn-1">
        ${imageResponseHtml('response-1', { complete: true })}
      </div>
    `)
    await vi.advanceTimersByTimeAsync(2_000)
    appendTurn('turn-2', [{ id: 'response-2', message: 'Latest response' }])
    await vi.advanceTimersByTimeAsync(5_000)

    expect(sendMessageMock).toHaveBeenCalledTimes(1)
    expect(sendMessageMock).toHaveBeenCalledWith({
      type: RESPONSE_COMPLETE_NOTIFICATION_CREATE_MESSAGE,
      payload: expect.objectContaining({
        message: 'Latest response',
        responseType: 'text',
      }),
    })
  })

  it('prioritizes and completes an image response across multiple candidates', async () => {
    vi.useFakeTimers()
    await setResponseCompleteNotificationEnabled(true)
    renderPage()
    await responseCompleteNotificationDetector.start()

    enterGeneratingState()
    getChatHistory().insertAdjacentHTML('beforeend', `
      <div class="conversation-container" id="turn-1">
        ${modelResponseHtml('response-text', 'Text candidate')}
        ${imageResponseHtml('response-image', { complete: true })}
      </div>
    `)
    await vi.advanceTimersByTimeAsync(5_000)

    expect(sendMessageMock).toHaveBeenCalledTimes(1)
    expect(getDetectorLogPayloads()).toContainEqual(expect.objectContaining({
      event: 'response-type-detected',
      responseType: 'image',
    }))
  })

  it('logs response type completion once with its completion mode', async () => {
    vi.useFakeTimers()
    await setResponseCompleteNotificationEnabled(true)
    renderPage()
    await responseCompleteNotificationDetector.start()

    enterGeneratingState()
    getChatHistory().insertAdjacentHTML('beforeend', `
      <div class="conversation-container" id="turn-1">
        ${imageResponseHtml('response-1', { complete: true })}
      </div>
    `)
    await vi.advanceTimersByTimeAsync(0)

    expect(getDetectorLogPayloads().filter(
      payload => payload.event === 'response-type-completed',
    )).toEqual([
      expect.objectContaining({
        turnId: 'turn-1',
        responseType: 'image',
        completionMode: 'immediate',
      }),
    ])
  })

  it('resets inactivity when a child node is added to response content', async () => {
    vi.useFakeTimers()
    await setResponseCompleteNotificationEnabled(true)
    renderPage()
    await responseCompleteNotificationDetector.start()

    appendTurn('turn-1', [{ id: 'response-1', message: 'Partial' }])
    await vi.advanceTimersByTimeAsync(4_000)
    appendResponseText('response-1', ' response')
    await vi.advanceTimersByTimeAsync(4_999)
    expect(sendMessageMock).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    expect(sendMessageMock).toHaveBeenCalledWith({
      type: RESPONSE_COMPLETE_NOTIFICATION_CREATE_MESSAGE,
      payload: expect.objectContaining({
        message: 'Partial response',
      }),
    })
  })

  it('resets inactivity when an existing text node changes', async () => {
    vi.useFakeTimers()
    await setResponseCompleteNotificationEnabled(true)
    renderPage()
    await responseCompleteNotificationDetector.start()

    appendTurn('turn-1', [{ id: 'response-1', message: 'AAAA' }])
    await vi.advanceTimersByTimeAsync(4_000)
    document.querySelector('[data-response-id="response-1"] .markdown')!
      .firstChild!.textContent = 'BBBB'
    await vi.advanceTimersByTimeAsync(4_999)
    expect(sendMessageMock).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    expect(sendMessageMock).toHaveBeenCalledWith({
      type: RESPONSE_COMPLETE_NOTIFICATION_CREATE_MESSAGE,
      payload: expect.objectContaining({
        message: 'BBBB',
      }),
    })
  })

  it('uses one shared inactivity timer for multiple candidates and summarizes the last non-empty one', async () => {
    vi.useFakeTimers()
    await setResponseCompleteNotificationEnabled(true)
    renderPage()
    await responseCompleteNotificationDetector.start()

    appendTurn('turn-1', [
      { id: 'response-a', message: 'First candidate' },
      { id: 'response-b', message: 'Second candidate' },
    ])
    await vi.advanceTimersByTimeAsync(4_000)
    appendResponseText('response-a', ' updated')
    await vi.advanceTimersByTimeAsync(4_999)
    expect(sendMessageMock).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    expect(sendMessageMock).toHaveBeenCalledWith({
      type: RESPONSE_COMPLETE_NOTIFICATION_CREATE_MESSAGE,
      payload: expect.objectContaining({
        message: 'Second candidate',
      }),
    })
  })

  it('replaces the active turn and ignores later changes from the older turn', async () => {
    vi.useFakeTimers()
    await setResponseCompleteNotificationEnabled(true)
    renderPage()
    await responseCompleteNotificationDetector.start()

    appendTurn('turn-1', [{ id: 'response-1', message: 'Old response' }])
    await vi.advanceTimersByTimeAsync(4_000)
    appendTurn('turn-2', [{ id: 'response-2', message: 'Latest response' }])
    appendResponseText('response-1', ' changed')
    await vi.advanceTimersByTimeAsync(5_000)

    expect(sendMessageMock).toHaveBeenCalledTimes(1)
    expect(sendMessageMock).toHaveBeenCalledWith({
      type: RESPONSE_COMPLETE_NOTIFICATION_CREATE_MESSAGE,
      payload: expect.objectContaining({
        message: 'Latest response',
      }),
    })
  })

  it('suppresses a completed active turn while the page is visible and focused', async () => {
    vi.useFakeTimers()
    await setResponseCompleteNotificationEnabled(true)
    setVisibilityState('visible')
    setHasFocus(true)
    renderPage()
    await responseCompleteNotificationDetector.start()

    appendTurn('turn-1', [{ id: 'response-1', message: 'Foreground response' }])
    await vi.advanceTimersByTimeAsync(5_000)
    setVisibilityState('hidden')
    setHasFocus(false)
    await vi.advanceTimersByTimeAsync(5_000)

    expect(sendMessageMock).not.toHaveBeenCalled()
  })

  it('rebinds chat history on chat change and treats the latest turn as baseline', async () => {
    vi.useFakeTimers()
    await setResponseCompleteNotificationEnabled(true)
    renderPage()
    await responseCompleteNotificationDetector.start()

    renderPage({ id: 'new-chat-baseline', message: 'Existing new chat response' })
    eventBus.emitSync('chatchange', {
      originalUrl: 'https://gemini.google.com/app/old',
      currentUrl: 'https://gemini.google.com/app/new',
      timestamp: Date.now(),
      isFromNewChat: false,
    })
    await vi.advanceTimersByTimeAsync(10_000)

    expect(sendMessageMock).not.toHaveBeenCalled()
  })

  it('preserves an active turn when a new chat receives its permanent url', async () => {
    vi.useFakeTimers()
    await setResponseCompleteNotificationEnabled(true)
    renderPage()
    await responseCompleteNotificationDetector.start()

    appendTurn('turn-1', [{ id: 'response-1', message: 'New chat response' }])
    await vi.advanceTimersByTimeAsync(0)
    eventBus.emitSync('chatchange', {
      originalUrl: 'https://gemini.google.com/app',
      currentUrl: 'https://gemini.google.com/app/new',
      timestamp: Date.now(),
      isFromNewChat: true,
    })
    await vi.advanceTimersByTimeAsync(5_000)

    expect(sendMessageMock).toHaveBeenCalledTimes(1)
  })

  it('cleans the completed active turn and does not notify again', async () => {
    vi.useFakeTimers()
    await setResponseCompleteNotificationEnabled(true)
    renderPage()
    await responseCompleteNotificationDetector.start()

    appendTurn('turn-1', [{ id: 'response-1', message: 'Completed response' }])
    await vi.advanceTimersByTimeAsync(5_000)
    appendResponseText('response-1', ' changed later')
    await vi.advanceTimersByTimeAsync(10_000)

    expect(sendMessageMock).toHaveBeenCalledTimes(1)
  })

  it('normalizes and truncates a specific model response summary', async () => {
    renderPage()
    const turn = appendTurn('turn-1', [{
      id: 'response-1',
      message: ` ${'word '.repeat(80)}`,
    }])
    await flushMutations()
    const response = turn.querySelector('model-response')!

    const summary = getCompletedModelResponseSummary(response)

    expect(summary).toHaveLength(200)
    expect(summary).not.toContain('\n')
    expect(summary.startsWith('word word')).toBe(true)
  })
})
