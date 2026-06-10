import { browser } from 'wxt/browser'
import { RESPONSE_COMPLETE_NOTIFICATION_CREATE_MESSAGE } from '@/types/runtime-messages'
import { extractModelResponseContent } from '@/utils/messageUtils'
import { eventBus } from '@/utils/eventbus'
import {
  enableResponseCompleteNotification,
  getResponseCompleteNotificationEnabled,
} from './responseCompleteNotificationSettings'

const CHAT_HISTORY_SELECTOR = '[data-test-id="chat-history-container"]'
const TURN_SELECTOR = '.conversation-container'
const FINAL_TURN_SELECTOR = 'div.conversation-container[id]'
const STRUCTURED_CONTENT_SELECTOR = 'structured-content-container'
const MODEL_RESPONSE_MESSAGE_CONTENT_SELECTOR = '[id*="model-response-message-content"]'
const RESPONSE_CONTENT_SELECTOR = `${STRUCTURED_CONTENT_SELECTOR} ${MODEL_RESPONSE_MESSAGE_CONTENT_SELECTOR}`
const SEND_BUTTON_SELECTOR = 'input-area-v2 button.send-button'
const GENERATING_SEND_BUTTON_SELECTOR = `${SEND_BUTTON_SELECTOR}.stop`
const MAX_NOTIFICATION_MESSAGE_LENGTH = 200
const FALLBACK_NOTIFICATION_TITLE = 'Gemini finished replying'
const FALLBACK_NOTIFICATION_MESSAGE = 'Your response is ready.'
const FALLBACK_IMAGE_NOTIFICATION_MESSAGE = 'Your image is ready.'
const CHAT_HISTORY_BIND_RETRY_DELAY_MS = 500
const CHAT_HISTORY_BIND_MAX_ATTEMPTS = 20
const CONTENT_INACTIVITY_TIMEOUT_MS = 5_000
const IMAGE_ELEMENT_WAIT_TIMEOUT_MS = 5_000
const IMAGE_ELEMENT_WAIT_POLL_INTERVAL_MS = 100
const IMAGE_NOTIFICATION_MAX_DIMENSION = 512
const IMAGE_NOTIFICATION_MAX_BLOB_SIZE = 500_000
const IMAGE_NOTIFICATION_JPEG_QUALITIES = [0.8, 0.65, 0.5]
const FINAL_IMAGE_SELECTOR = 'generated-image > single-image > div > div > button.image-button > img'

type ResponseType = 'image' | 'text'
type CompletionMode = 'immediate' | 'inactivity'

interface ResponseTypeRule {
  type: ResponseType
  completionMode: CompletionMode
  detect(content: Element): boolean
  isComplete(content: Element): boolean
}

interface DetectedResponseType {
  rule: ResponseTypeRule
  isComplete: boolean
}

interface ActiveResponseTurn {
  turnId: string
  container: HTMLElement
  observer: MutationObserver
  inactivityTimer: ReturnType<typeof setTimeout> | null
  responseType: ResponseType | null
  isCompleting: boolean
  imageWaitTimer: ReturnType<typeof setTimeout> | null
  imageWaitResolve: ((image: HTMLImageElement | null) => void) | null
  imageFetchController: AbortController | null
  hasLoggedStructuredContent: boolean
  hasLoggedModelResponseMessageContent: boolean
}

function logDetectorEvent(
  event: string,
  details: Record<string, unknown> = {},
): void {
  console.info('[ResponseCompleteNotificationDetector]', JSON.stringify({
    timestamp: new Date().toISOString(),
    event,
    turnId: null,
    ...details,
  }))
}

export function getCurrentChatNotificationTitle(): string {
  const titleElement = document.querySelector<HTMLElement>(
    'top-bar-actions .conversation-title-container',
  )
  const title = normalizeWhitespace(titleElement?.textContent ?? '')
  if (title) {
    return title
  }

  const documentTitle = normalizeWhitespace(document.title)
  return documentTitle || FALLBACK_NOTIFICATION_TITLE
}

export function getCompletedModelResponseSummary(
  modelResponse?: Element | null,
  responseType: ResponseType = 'text',
): string {
  const normalized = normalizeWhitespace(
    modelResponse ? extractModelResponseContent(modelResponse) : '',
  )
  if (!normalized) {
    return responseType === 'image'
      ? FALLBACK_IMAGE_NOTIFICATION_MESSAGE
      : FALLBACK_NOTIFICATION_MESSAGE
  }

  return normalized.slice(0, MAX_NOTIFICATION_MESSAGE_LENGTH)
}

interface DecodedImage {
  width: number
  height: number
  source: CanvasImageSource
  cleanup(): void
}

interface NotificationImageData {
  dataUrl: string
  width: number
  height: number
  byteLength: number
}

async function createNotificationImageData(
  image: HTMLImageElement,
  signal: AbortSignal,
): Promise<NotificationImageData> {
  const sourceUrl = getImageSourceUrl(image)
  if (!sourceUrl) {
    throw new Error('image-source-missing')
  }

  const response = await fetch(sourceUrl, { signal })
  if (!response.ok) {
    throw new Error('image-fetch-failed')
  }
  const blob = await response.blob()
  if (!blob.type.startsWith('image/')) {
    throw new Error('image-blob-invalid')
  }

  const decoded = await decodeImageBlob(blob)
  try {
    const scale = Math.min(
      1,
      IMAGE_NOTIFICATION_MAX_DIMENSION / Math.max(decoded.width, decoded.height),
    )
    const width = Math.max(1, Math.round(decoded.width * scale))
    const height = Math.max(1, Math.round(decoded.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) {
      throw new Error('image-canvas-unavailable')
    }
    context.drawImage(decoded.source, 0, 0, width, height)

    for (const quality of IMAGE_NOTIFICATION_JPEG_QUALITIES) {
      const compressedBlob = await canvasToBlob(canvas, quality)
      if (compressedBlob.size <= IMAGE_NOTIFICATION_MAX_BLOB_SIZE) {
        return {
          dataUrl: await blobToDataUrl(compressedBlob),
          width,
          height,
          byteLength: compressedBlob.size,
        }
      }
    }
  } finally {
    decoded.cleanup()
  }

  throw new Error('image-compressed-too-large')
}

function getImageSourceUrl(image: HTMLImageElement): string {
  return image.currentSrc || image.getAttribute('src') || image.src
}

async function decodeImageBlob(blob: Blob): Promise<DecodedImage> {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(blob)
    return {
      width: bitmap.width,
      height: bitmap.height,
      source: bitmap,
      cleanup: () => bitmap.close(),
    }
  }

  const objectUrl = URL.createObjectURL(blob)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const nextImage = new Image()
      nextImage.onload = () => resolve(nextImage)
      nextImage.onerror = () => reject(new Error('image-decode-failed'))
      nextImage.src = objectUrl
    })
    return {
      width: image.naturalWidth,
      height: image.naturalHeight,
      source: image,
      cleanup: () => URL.revokeObjectURL(objectUrl),
    }
  } catch (error) {
    URL.revokeObjectURL(objectUrl)
    throw error
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob)
      } else {
        reject(new Error('image-compression-failed'))
      }
    }, 'image/jpeg', quality)
  })
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
      } else {
        reject(new Error('image-data-url-failed'))
      }
    }
    reader.onerror = () => reject(new Error('image-data-url-failed'))
    reader.readAsDataURL(blob)
  })
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

const RESPONSE_TYPE_RULES: ResponseTypeRule[] = [
  {
    type: 'image',
    completionMode: 'immediate',
    detect: content => Boolean(content.querySelector('generated-image')),
    isComplete: content => Boolean(content.querySelector('generated-image single-image')),
  },
  {
    type: 'text',
    completionMode: 'inactivity',
    detect: content => normalizeWhitespace(content.textContent ?? '').length > 0,
    isComplete: () => true,
  },
]

function getLastDirectTurn(chatHistory: Element): HTMLElement | null {
  let element = chatHistory.lastElementChild
  while (element) {
    if (element.matches(TURN_SELECTOR)) {
      return element as HTMLElement
    }
    element = element.previousElementSibling
  }
  return null
}

function getResponseContentContainers(turn: HTMLElement): Element[] {
  return Array.from(turn.querySelectorAll(RESPONSE_CONTENT_SELECTOR)).filter(
    (contentContainer) => contentContainer.closest(FINAL_TURN_SELECTOR) === turn,
  )
}

function getNonEmptyResponseContentContainers(turn: HTMLElement): Element[] {
  return getResponseContentContainers(turn).filter(
    (contentContainer) => normalizeWhitespace(contentContainer.textContent ?? '').length > 0,
  )
}

function detectResponseType(turn: HTMLElement): DetectedResponseType | null {
  const contentContainers = getResponseContentContainers(turn)
  for (const rule of RESPONSE_TYPE_RULES) {
    const matchingContainers = contentContainers.filter(rule.detect)
    if (matchingContainers.length > 0) {
      return {
        rule,
        isComplete: matchingContainers.some(rule.isComplete),
      }
    }
  }
  return null
}

function getLastNonEmptyModelResponse(turn: HTMLElement): Element | null {
  const contentContainers = getNonEmptyResponseContentContainers(turn)
  for (let index = contentContainers.length - 1; index >= 0; index -= 1) {
    const modelResponse = contentContainers[index].closest('model-response')
    if (modelResponse) {
      return modelResponse
    }
  }
  return null
}

function getMutationTargetElement(mutation: MutationRecord): Element | null {
  if (mutation.target instanceof Element) {
    return mutation.target
  }
  return mutation.target.parentElement
}

function nodeContainsResponseContent(node: Node): boolean {
  return node instanceof Element
    && (node.matches(RESPONSE_CONTENT_SELECTOR)
      || Boolean(node.querySelector(RESPONSE_CONTENT_SELECTOR)))
}

function mutationTouchesResponseContent(mutation: MutationRecord): boolean {
  const target = getMutationTargetElement(mutation)
  if (target?.closest(RESPONSE_CONTENT_SELECTOR)) {
    return true
  }

  return [...mutation.addedNodes, ...mutation.removedNodes]
    .some(nodeContainsResponseContent)
}

class ResponseCompleteNotificationDetector {
  private isStarted = false
  private isMonitoring = false
  private chatHistoryObserver: MutationObserver | null = null
  private sendButtonStateObserver: MutationObserver | null = null
  private chatHistory: HTMLElement | null = null
  private activeTurn: ActiveResponseTurn | null = null
  private isGenerationArmed = false
  private wasSendButtonGenerating = false
  private bindRetryTimer: ReturnType<typeof setTimeout> | null = null
  private bindAttempt = 0
  private unwatchSettings: (() => void) | null = null
  private unwatchChatChange: (() => void) | null = null

  async start(): Promise<void> {
    if (this.isStarted) {
      logDetectorEvent('start-skipped-already-started')
      return
    }

    this.isStarted = true
    const enabled = await getResponseCompleteNotificationEnabled()
    logDetectorEvent('started', { enabled })
    if (enabled) {
      this.startMonitoring()
    }

    this.unwatchSettings = enableResponseCompleteNotification.watch((enabled) => {
      logDetectorEvent('setting-changed', { enabled })
      if (enabled) {
        this.startMonitoring()
      } else {
        this.stopMonitoring('setting-disabled')
      }
    })
    this.unwatchChatChange = eventBus.on('chatchange', (event) => {
      if (!this.isMonitoring) {
        return
      }
      if (event.isFromNewChat && this.activeTurn) {
        logDetectorEvent('new-chat-url-assigned-active-turn-preserved', {
          turnId: this.activeTurn.turnId,
          currentUrl: event.currentUrl,
        })
        return
      }
      logDetectorEvent('chat-changed')
      this.rebindChatHistory()
    })
  }

  stop(): void {
    if (!this.isStarted) {
      return
    }

    this.isStarted = false
    logDetectorEvent('stopped')
    this.unwatchSettings?.()
    this.unwatchSettings = null
    this.unwatchChatChange?.()
    this.unwatchChatChange = null
    this.stopMonitoring('detector-stopped')
  }

  private startMonitoring(): void {
    if (this.isMonitoring) {
      logDetectorEvent('monitoring-start-skipped-already-active')
      return
    }

    this.isMonitoring = true
    this.bindAttempt = 0
    this.bindSendButtonStateObserver()
    this.bindChatHistory()
  }

  private stopMonitoring(reason: string): void {
    const wasMonitoring = this.isMonitoring
    this.isMonitoring = false
    this.clearBindRetry()
    this.disconnectChatHistoryObserver()
    this.disconnectSendButtonStateObserver()
    this.cleanupActiveTurn(reason)
    this.chatHistory = null
    this.isGenerationArmed = false
    this.wasSendButtonGenerating = false
    this.bindAttempt = 0
    if (wasMonitoring) {
      logDetectorEvent('monitoring-stopped', { reason })
    }
  }

  private rebindChatHistory(): void {
    this.clearBindRetry()
    this.disconnectChatHistoryObserver()
    this.disconnectSendButtonStateObserver()
    this.cleanupActiveTurn('chat-changed')
    this.chatHistory = null
    this.isGenerationArmed = false
    this.wasSendButtonGenerating = false
    this.bindAttempt = 0
    this.bindSendButtonStateObserver()
    this.bindChatHistory()
  }

  private bindSendButtonStateObserver(): void {
    if (!this.isMonitoring || this.sendButtonStateObserver) {
      return
    }

    const target = document.documentElement ?? document.body
    if (!target) {
      return
    }

    this.wasSendButtonGenerating = isSendButtonGenerating()
    this.sendButtonStateObserver = new MutationObserver(() => {
      this.refreshSendButtonGeneratingState(true)
    })
    this.sendButtonStateObserver.observe(target, {
      attributes: true,
      attributeFilter: ['class'],
      childList: true,
      subtree: true,
    })
  }

  private bindChatHistory(): void {
    if (!this.isMonitoring || this.chatHistoryObserver) {
      return
    }

    const chatHistory = document.querySelector<HTMLElement>(CHAT_HISTORY_SELECTOR)
    if (!chatHistory) {
      this.scheduleBindRetry()
      return
    }

    this.clearBindRetry()
    this.chatHistory = chatHistory
    logDetectorEvent('chat-history-bound', {
      tagName: chatHistory.tagName,
      baselineTurnId: getLastDirectTurn(chatHistory)?.id ?? null,
    })

    this.chatHistoryObserver = new MutationObserver((mutations) => {
      this.handleChatHistoryMutations(mutations)
    })
    this.chatHistoryObserver.observe(chatHistory, {
      childList: true,
      subtree: false,
    })
  }

  private scheduleBindRetry(): void {
    if (
      !this.isMonitoring
      || this.bindRetryTimer
      || this.bindAttempt >= CHAT_HISTORY_BIND_MAX_ATTEMPTS
    ) {
      if (this.bindAttempt >= CHAT_HISTORY_BIND_MAX_ATTEMPTS) {
        logDetectorEvent('chat-history-bind-abandoned', {
          attempts: this.bindAttempt,
        })
      }
      return
    }

    this.bindAttempt += 1
    this.bindRetryTimer = setTimeout(() => {
      this.bindRetryTimer = null
      this.bindChatHistory()
    }, CHAT_HISTORY_BIND_RETRY_DELAY_MS)
  }

  private clearBindRetry(): void {
    if (this.bindRetryTimer) {
      clearTimeout(this.bindRetryTimer)
      this.bindRetryTimer = null
    }
  }

  private disconnectChatHistoryObserver(): void {
    this.chatHistoryObserver?.disconnect()
    this.chatHistoryObserver = null
  }

  private disconnectSendButtonStateObserver(): void {
    this.sendButtonStateObserver?.disconnect()
    this.sendButtonStateObserver = null
  }

  private refreshSendButtonGeneratingState(armOnEnter: boolean): void {
    const isGenerating = isSendButtonGenerating()
    if (armOnEnter && isGenerating && !this.wasSendButtonGenerating) {
      this.isGenerationArmed = true
      logDetectorEvent('generation-armed-by-send-button')
    }
    if (!isGenerating && !this.activeTurn) {
      this.isGenerationArmed = false
    }
    this.wasSendButtonGenerating = isGenerating
  }

  private handleChatHistoryMutations(mutations: MutationRecord[]): void {
    const chatHistory = this.chatHistory
    if (!chatHistory) {
      return
    }

    this.refreshSendButtonGeneratingState(true)
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (
          !(node instanceof HTMLElement)
          || !node.matches(FINAL_TURN_SELECTOR)
          || getLastDirectTurn(chatHistory) !== node
        ) {
          continue
        }

        if (!this.isGenerationArmed) {
          logDetectorEvent('turn-ignored-generation-not-armed', {
            turnId: node.id,
          })
          continue
        }

        this.startActiveTurn(node)
      }
    }
  }

  private startActiveTurn(container: HTMLElement): void {
    if (this.activeTurn) {
      logDetectorEvent('active-turn-replaced', {
        turnId: this.activeTurn.turnId,
        replacementTurnId: container.id,
      })
      this.cleanupActiveTurn('replaced')
    }

    const activeTurn: ActiveResponseTurn = {
      turnId: container.id,
      container,
      observer: new MutationObserver((mutations) => {
        this.handleActiveTurnMutations(activeTurn, mutations)
      }),
      inactivityTimer: null,
      responseType: null,
      isCompleting: false,
      imageWaitTimer: null,
      imageWaitResolve: null,
      imageFetchController: null,
      hasLoggedStructuredContent: false,
      hasLoggedModelResponseMessageContent: false,
    }
    this.activeTurn = activeTurn
    activeTurn.observer.observe(container, {
      childList: true,
      characterData: true,
      subtree: true,
    })
    logDetectorEvent('active-turn-started', {
      turnId: activeTurn.turnId,
    })
    this.logDetectedResponseContainers(activeTurn)
    this.evaluateActiveTurn(activeTurn, true)
  }

  private handleActiveTurnMutations(
    activeTurn: ActiveResponseTurn,
    mutations: MutationRecord[],
  ): void {
    if (this.activeTurn !== activeTurn) {
      return
    }

    this.logDetectedResponseContainers(activeTurn)
    if (activeTurn.isCompleting) {
      this.resolveWaitingImage(activeTurn)
      return
    }
    this.evaluateActiveTurn(
      activeTurn,
      mutations.some(mutationTouchesResponseContent),
    )
  }

  private logDetectedResponseContainers(activeTurn: ActiveResponseTurn): void {
    if (this.activeTurn !== activeTurn) {
      return
    }

    if (!activeTurn.hasLoggedStructuredContent) {
      const structuredContentCount = activeTurn.container.querySelectorAll(
        STRUCTURED_CONTENT_SELECTOR,
      ).length
      if (structuredContentCount > 0) {
        activeTurn.hasLoggedStructuredContent = true
        logDetectorEvent('structured-content-container-detected', {
          turnId: activeTurn.turnId,
          containerCount: structuredContentCount,
        })
      }
    }

    if (!activeTurn.hasLoggedModelResponseMessageContent) {
      const modelResponseMessageContentCount = activeTurn.container.querySelectorAll(
        RESPONSE_CONTENT_SELECTOR,
      ).length
      if (modelResponseMessageContentCount > 0) {
        activeTurn.hasLoggedModelResponseMessageContent = true
        logDetectorEvent('model-response-message-content-detected', {
          turnId: activeTurn.turnId,
          containerCount: modelResponseMessageContentCount,
        })
      }
    }
  }

  private evaluateActiveTurn(
    activeTurn: ActiveResponseTurn,
    responseContentChanged: boolean,
  ): void {
    if (this.activeTurn !== activeTurn) {
      return
    }

    const detectedResponse = detectResponseType(activeTurn.container)
    if (!detectedResponse) {
      activeTurn.responseType = null
      this.clearInactivityTimer(activeTurn)
      return
    }

    const { rule, isComplete } = detectedResponse
    if (activeTurn.responseType !== rule.type) {
      activeTurn.responseType = rule.type
      this.clearInactivityTimer(activeTurn)
      logDetectorEvent('response-type-detected', {
        turnId: activeTurn.turnId,
        responseType: rule.type,
        completionMode: rule.completionMode,
      })
    }

    if (rule.completionMode === 'immediate') {
      this.clearInactivityTimer(activeTurn)
      if (isComplete) {
        this.completeActiveTurn(activeTurn, rule)
      }
      return
    }

    if (!activeTurn.inactivityTimer || responseContentChanged) {
      this.refreshInactivityTimer(activeTurn, rule)
    }
  }

  private refreshInactivityTimer(
    activeTurn: ActiveResponseTurn,
    rule: ResponseTypeRule,
  ): void {
    if (
      this.activeTurn !== activeTurn
      || rule.type !== 'text'
      || detectResponseType(activeTurn.container)?.rule.type !== rule.type
    ) {
      this.clearInactivityTimer(activeTurn)
      return
    }

    this.clearInactivityTimer(activeTurn)
    activeTurn.inactivityTimer = setTimeout(() => {
      activeTurn.inactivityTimer = null
      const detectedResponse = detectResponseType(activeTurn.container)
      if (
        detectedResponse?.rule.type === 'text'
        && detectedResponse.rule.completionMode === 'inactivity'
      ) {
        this.completeActiveTurn(activeTurn, detectedResponse.rule)
      }
    }, CONTENT_INACTIVITY_TIMEOUT_MS)
    logDetectorEvent('response-content-inactivity-timer-started', {
      turnId: activeTurn.turnId,
      inactivityMs: CONTENT_INACTIVITY_TIMEOUT_MS,
    })
  }

  private clearInactivityTimer(activeTurn: ActiveResponseTurn): void {
    if (activeTurn.inactivityTimer) {
      clearTimeout(activeTurn.inactivityTimer)
      activeTurn.inactivityTimer = null
    }
  }

  private completeActiveTurn(
    activeTurn: ActiveResponseTurn,
    rule: ResponseTypeRule,
  ): void {
    if (this.activeTurn !== activeTurn || activeTurn.isCompleting) {
      return
    }

    activeTurn.isCompleting = true
    this.clearInactivityTimer(activeTurn)
    logDetectorEvent('response-type-completed', {
      turnId: activeTurn.turnId,
      responseType: rule.type,
      completionMode: rule.completionMode,
    })
    const visibilityState = document.visibilityState
    const hasFocus = document.hasFocus()
    if (visibilityState === 'visible' && hasFocus) {
      logDetectorEvent('turn-suppressed-page-foreground', {
        turnId: activeTurn.turnId,
        visibilityState,
        hasFocus,
      })
      this.cleanupActiveTurn('foreground-suppressed')
      return
    }

    void this.sendCompletedTurnNotification(activeTurn, rule, visibilityState, hasFocus)
  }

  private async sendCompletedTurnNotification(
    activeTurn: ActiveResponseTurn,
    rule: ResponseTypeRule,
    visibilityState: DocumentVisibilityState,
    hasFocus: boolean,
  ): Promise<void> {
    let imageDataUrl: string | undefined
    if (rule.type === 'image' && !import.meta.env.FIREFOX) {
      imageDataUrl = await this.getNotificationImageDataUrl(activeTurn)
      if (this.activeTurn !== activeTurn) {
        return
      }
    }

    const modelResponse = getLastNonEmptyModelResponse(activeTurn.container)
    const payload = {
      title: getCurrentChatNotificationTitle(),
      message: getCompletedModelResponseSummary(modelResponse, rule.type),
      timestamp: Date.now(),
      responseType: rule.type,
      ...(imageDataUrl ? { imageDataUrl } : {}),
    }
    logDetectorEvent('turn-notification-sending', {
      turnId: activeTurn.turnId,
      visibilityState,
      hasFocus,
      title: payload.title,
      messageLength: payload.message.length,
      responseType: rule.type,
      hasImageDataUrl: Boolean(imageDataUrl),
      eventTimestamp: payload.timestamp,
    })

    void browser.runtime.sendMessage({
      type: RESPONSE_COMPLETE_NOTIFICATION_CREATE_MESSAGE,
      payload,
    }).then((response) => {
      logDetectorEvent('notification-message-response', {
        turnId: activeTurn.turnId,
        response,
        eventTimestamp: payload.timestamp,
      })
    }).catch((error) => {
      console.warn('[ResponseCompleteNotificationDetector]', JSON.stringify({
        timestamp: new Date().toISOString(),
        event: 'notification-message-failed',
        turnId: activeTurn.turnId,
        eventTimestamp: payload.timestamp,
        error: error instanceof Error ? error.message : String(error),
      }))
    })
    this.cleanupActiveTurn('notification-sent')
  }

  private async getNotificationImageDataUrl(
    activeTurn: ActiveResponseTurn,
  ): Promise<string | undefined> {
    logDetectorEvent('image-notification-wait-started', {
      turnId: activeTurn.turnId,
      waitMs: IMAGE_ELEMENT_WAIT_TIMEOUT_MS,
    })
    const image = await this.waitForFinalImage(activeTurn)
    if (!image || this.activeTurn !== activeTurn) {
      if (this.activeTurn === activeTurn) {
        logDetectorEvent('image-notification-fallback-basic', {
          turnId: activeTurn.turnId,
          reason: 'image-element-timeout',
        })
      }
      return undefined
    }

    const controller = new AbortController()
    activeTurn.imageFetchController = controller
    try {
      const imageData = await createNotificationImageData(image, controller.signal)
      logDetectorEvent('image-notification-data-created', {
        turnId: activeTurn.turnId,
        width: imageData.width,
        height: imageData.height,
        byteLength: imageData.byteLength,
      })
      return imageData.dataUrl
    } catch (error) {
      if (this.activeTurn === activeTurn) {
        logDetectorEvent('image-notification-fallback-basic', {
          turnId: activeTurn.turnId,
          reason: error instanceof Error ? error.message : 'image-processing-failed',
        })
      }
      return undefined
    } finally {
      if (activeTurn.imageFetchController === controller) {
        activeTurn.imageFetchController = null
      }
    }
  }

  private waitForFinalImage(activeTurn: ActiveResponseTurn): Promise<HTMLImageElement | null> {
    const existingImage = findFinalImageWithSource(activeTurn.container)
    if (existingImage) {
      return Promise.resolve(existingImage)
    }

    return new Promise((resolve) => {
      const startedAt = Date.now()
      activeTurn.imageWaitResolve = resolve
      const poll = () => {
        const image = findFinalImageWithSource(activeTurn.container)
        if (image) {
          activeTurn.imageWaitTimer = null
          activeTurn.imageWaitResolve = null
          resolve(image)
          return
        }

        if (Date.now() - startedAt >= IMAGE_ELEMENT_WAIT_TIMEOUT_MS) {
          activeTurn.imageWaitTimer = null
          activeTurn.imageWaitResolve = null
          resolve(null)
          return
        }

        activeTurn.imageWaitTimer = setTimeout(poll, IMAGE_ELEMENT_WAIT_POLL_INTERVAL_MS)
      }
      activeTurn.imageWaitTimer = setTimeout(poll, IMAGE_ELEMENT_WAIT_POLL_INTERVAL_MS)
    })
  }

  private resolveWaitingImage(activeTurn: ActiveResponseTurn): void {
    const image = findFinalImageWithSource(activeTurn.container)
    if (!image || !activeTurn.imageWaitResolve) {
      return
    }

    const resolve = activeTurn.imageWaitResolve
    activeTurn.imageWaitResolve = null
    if (activeTurn.imageWaitTimer) {
      clearTimeout(activeTurn.imageWaitTimer)
      activeTurn.imageWaitTimer = null
    }
    resolve(image)
  }

  private cleanupActiveTurn(reason: string): void {
    const activeTurn = this.activeTurn
    if (!activeTurn) {
      return
    }

    activeTurn.observer.disconnect()
    this.clearInactivityTimer(activeTurn)
    if (activeTurn.imageWaitTimer) {
      clearTimeout(activeTurn.imageWaitTimer)
      activeTurn.imageWaitTimer = null
    }
    activeTurn.imageWaitResolve?.(null)
    activeTurn.imageWaitResolve = null
    activeTurn.imageFetchController?.abort()
    activeTurn.imageFetchController = null
    this.activeTurn = null
    if (reason !== 'replaced') {
      this.isGenerationArmed = false
    }
    logDetectorEvent('active-turn-cleaned', {
      turnId: activeTurn.turnId,
      reason,
    })
  }
}

function findFinalImageWithSource(container: Element): HTMLImageElement | null {
  return Array.from(container.querySelectorAll<HTMLImageElement>(FINAL_IMAGE_SELECTOR))
    .find(image => Boolean(getImageSourceUrl(image))) ?? null
}

function isSendButtonGenerating(): boolean {
  return Boolean(document.querySelector(GENERATING_SEND_BUTTON_SELECTOR))
}

export const responseCompleteNotificationDetector = new ResponseCompleteNotificationDetector()
