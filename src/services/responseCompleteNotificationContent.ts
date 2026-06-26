import { browser } from 'wxt/browser'
import {
  isResponseCompleteNotificationGetDeepResearchStatusMessage,
  isResponseCompleteNotificationGetContentMessage,
  type ResponseCompleteNotificationDeepResearchStatus,
  type ResponseCompletionKind,
  type ResponseCompleteNotificationContent,
  type ResponseCompleteNotificationVideoContent,
  type ResponseNotificationContentType,
} from '@/types/runtime-messages'
import { extractModelResponseContent } from '@/utils/messageUtils'

const FINAL_TURN_SELECTOR = 'div.conversation-container[id]'
const STRUCTURED_CONTENT_SELECTOR = 'structured-content-container'
const MODEL_RESPONSE_MESSAGE_CONTENT_SELECTOR = '[id*="model-response-message-content"]'
const RESPONSE_CONTENT_SELECTOR = `${STRUCTURED_CONTENT_SELECTOR} ${MODEL_RESPONSE_MESSAGE_CONTENT_SELECTOR}`
const FINAL_IMAGE_SELECTOR = 'generated-image > single-image > div > div > button.image-button > img'
const FINAL_VIDEO_SELECTOR = 'generated-video video-player video[src]'
const DEEP_RESEARCH_CARD_SELECTOR = 'gem-processing-card'
const DEEP_RESEARCH_TITLE_SELECTOR = '.card-title'
const MAX_NOTIFICATION_MESSAGE_LENGTH = 200
const FALLBACK_NOTIFICATION_TITLE = 'Gemini finished replying'
const FALLBACK_NOTIFICATION_MESSAGE = 'Your response is ready.'
const FALLBACK_IMAGE_NOTIFICATION_MESSAGE = 'Your image is ready.'
const FALLBACK_VIDEO_NOTIFICATION_MESSAGE = 'Your video is ready.'
const CONTENT_RETRY_ATTEMPTS = 10
const CONTENT_RETRY_DELAY_MS = 100
const IMAGE_SOURCE_RETRY_ATTEMPTS = 4
const IMAGE_SOURCE_RETRY_DELAY_MS = 1_000
const IMAGE_NOTIFICATION_MAX_DIMENSION = 512
const IMAGE_NOTIFICATION_MAX_BLOB_SIZE = 500_000
const IMAGE_NOTIFICATION_JPEG_QUALITIES = [0.8, 0.65, 0.5]

let hasStarted = false

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

export function startResponseCompleteNotificationContentProvider(): void {
  if (hasStarted) {
    return
  }

  hasStarted = true
  browser.runtime.onMessage.addListener((message) => {
    if (!isResponseCompleteNotificationGetContentMessage(message)) {
      if (isResponseCompleteNotificationGetDeepResearchStatusMessage(message)) {
        return Promise.resolve(getDeepResearchDomStatus())
      }
      return undefined
    }

    return getResponseCompleteNotificationContent(message.payload.completionKind)
  })
}

export function getDeepResearchDomStatus(): ResponseCompleteNotificationDeepResearchStatus {
  const turn = getLastFinalTurn()
  if (!turn) {
    return { state: 'absent' }
  }

  const conversationId = getCurrentConversationId()
  const cards = Array.from(turn.querySelectorAll<HTMLElement>(DEEP_RESEARCH_CARD_SELECTOR))
  for (let index = cards.length - 1; index >= 0; index -= 1) {
    const card = cards[index]
    const title = getDeepResearchCardTitle(card)
    if (card.classList.contains('completed') && !card.classList.contains('processing') && title) {
      return {
        state: 'completed',
        title,
        ...(conversationId ? { conversationId } : {}),
      }
    }

    if (card.classList.contains('processing')) {
      return {
        state: 'processing',
        ...(title ? { title } : {}),
        ...(conversationId ? { conversationId } : {}),
      }
    }
  }

  return { state: 'absent' }
}

export async function getResponseCompleteNotificationContent(
  completionKind: ResponseCompletionKind = 'standard-response',
): Promise<ResponseCompleteNotificationContent> {
  const isForeground = document.visibilityState === 'visible' && document.hasFocus()

  for (let attempt = 0; attempt < CONTENT_RETRY_ATTEMPTS; attempt += 1) {
    const content = await readNotificationContent(completionKind, isForeground)
    if (content) {
      return content
    }
    await delay(CONTENT_RETRY_DELAY_MS)
  }

  return createFallbackContent(isForeground, completionKind === 'deep-research' ? false : undefined)
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
  responseType: ResponseNotificationContentType = 'text',
): string {
  const extractedContent = modelResponse ? extractModelResponseContent(modelResponse) : ''
  const normalized = normalizeWhitespace(extractedContent || modelResponse?.textContent || '')
  if (!normalized) {
    if (responseType === 'image') {
      return FALLBACK_IMAGE_NOTIFICATION_MESSAGE
    }
    if (responseType === 'video') {
      return FALLBACK_VIDEO_NOTIFICATION_MESSAGE
    }
    return FALLBACK_NOTIFICATION_MESSAGE
  }

  return normalized.slice(0, MAX_NOTIFICATION_MESSAGE_LENGTH)
}

async function readNotificationContent(
  completionKind: ResponseCompletionKind,
  isForeground: boolean,
): Promise<ResponseCompleteNotificationContent | null> {
  const turn = getLastFinalTurn()
  if (!turn) {
    return null
  }

  const responseType = getResponseType(turn)
  const modelResponse = getLastNonEmptyModelResponse(turn)
  const finalVideo = responseType === 'video' ? findFinalVideo(turn) : null
  const finalImage = responseType === 'image' && !import.meta.env.FIREFOX
    ? await waitForFinalImageWithSource(turn)
    : findFinalImageWithSource(turn)
  if (!modelResponse && !finalImage && !finalVideo && responseType !== 'image') {
    return null
  }

  const deepResearchTitle = completionKind === 'deep-research'
    ? getDeepResearchTitle(turn)
    : null
  if (completionKind === 'deep-research' && !deepResearchTitle && responseType !== 'video') {
    return null
  }

  let imageDataUrl: string | undefined
  if (responseType === 'image' && finalImage && !import.meta.env.FIREFOX) {
    try {
      imageDataUrl = (await createNotificationImageData(finalImage)).dataUrl
    } catch (error) {
      console.warn('[ResponseCompleteNotificationContent] Failed to create image data:', error)
    }
  }

  return {
    isForeground,
    title: getCurrentChatNotificationTitle(),
    message: deepResearchTitle ?? getCompletedResponseSummary(modelResponse, responseType),
    responseType,
    ...(completionKind === 'deep-research' ? { completionConfirmed: true } : {}),
    ...(imageDataUrl ? { imageDataUrl } : {}),
    ...(finalVideo ? { video: finalVideo } : {}),
  }
}

function getCompletedResponseSummary(
  modelResponse: Element | null,
  responseType: ResponseNotificationContentType,
): string {
  if (responseType !== 'video') {
    return getCompletedModelResponseSummary(modelResponse, responseType)
  }

  if (!modelResponse) {
    return FALLBACK_VIDEO_NOTIFICATION_MESSAGE
  }

  const clone = modelResponse.cloneNode(true) as Element
  clone.querySelectorAll('generated-video').forEach(element => element.remove())
  const normalized = normalizeWhitespace(
    extractModelResponseContent(clone) || clone.textContent || '',
  )
  return normalized
    ? normalized.slice(0, MAX_NOTIFICATION_MESSAGE_LENGTH)
    : FALLBACK_VIDEO_NOTIFICATION_MESSAGE
}

export function getDeepResearchTitle(turn: Element): string | null {
  const cards = turn.querySelectorAll<HTMLElement>(DEEP_RESEARCH_CARD_SELECTOR)
  for (let index = cards.length - 1; index >= 0; index -= 1) {
    const card = cards.item(index)
    if (!card.classList.contains('completed') || card.classList.contains('processing')) {
      continue
    }

    const title = getDeepResearchCardTitle(card)
    if (title) {
      return title
    }
  }
  return null
}

function getDeepResearchCardTitle(card: Element): string {
  return normalizeWhitespace(
    card.querySelector<HTMLElement>(DEEP_RESEARCH_TITLE_SELECTOR)?.textContent ?? '',
  ).slice(0, MAX_NOTIFICATION_MESSAGE_LENGTH)
}

function getCurrentConversationId(): string | null {
  const match = window.location.pathname.match(/\/app\/([^/]+)/)
  return match?.[1] ?? null
}

function createFallbackContent(
  isForeground: boolean,
  completionConfirmed?: boolean,
): ResponseCompleteNotificationContent {
  return {
    isForeground,
    title: getCurrentChatNotificationTitle(),
    message: FALLBACK_NOTIFICATION_MESSAGE,
    responseType: 'text',
    ...(completionConfirmed === undefined ? {} : { completionConfirmed }),
  }
}

function getLastFinalTurn(): HTMLElement | null {
  const turns = document.querySelectorAll<HTMLElement>(FINAL_TURN_SELECTOR)
  return turns.item(turns.length - 1) || null
}

function getResponseType(turn: HTMLElement): ResponseNotificationContentType {
  if (findFinalVideo(turn)) {
    return 'video'
  }
  return turn.querySelector('generated-image single-image') ? 'image' : 'text'
}

function findFinalVideo(turn: HTMLElement): ResponseCompleteNotificationVideoContent | null {
  const video = turn.querySelector<HTMLVideoElement>(FINAL_VIDEO_SELECTOR)
  if (!video) {
    return null
  }

  const generatedVideo = video.closest('generated-video')
  if (!generatedVideo) {
    return null
  }

  const sourceUrl = video.currentSrc || video.getAttribute('src') || video.src
  if (!sourceUrl) {
    return null
  }

  const durationLabel = normalizeWhitespace(
    generatedVideo.querySelector<HTMLElement>('[role="timer"]')?.getAttribute('aria-label') ?? '',
  )
  const fileName = getVideoFileNameFromSourceUrl(sourceUrl)
  return {
    sourceUrl,
    ...(fileName ? { fileName } : {}),
    ...(durationLabel ? { durationLabel } : {}),
  }
}

function getVideoFileNameFromSourceUrl(value: string): string | undefined {
  try {
    const url = new URL(value)
    return url.searchParams.get('filename')
      ?? url.pathname.split('/').filter(Boolean).at(-1)
      ?? undefined
  } catch {
    return undefined
  }
}

function getLastNonEmptyModelResponse(turn: HTMLElement): Element | null {
  const contentContainers = Array.from(turn.querySelectorAll(RESPONSE_CONTENT_SELECTOR)).filter(
    content => normalizeWhitespace(content.textContent ?? '').length > 0,
  )
  for (let index = contentContainers.length - 1; index >= 0; index -= 1) {
    const modelResponse = contentContainers[index].closest('model-response')
    if (modelResponse) {
      return modelResponse
    }
  }
  return null
}

function findFinalImageWithSource(container: Element): HTMLImageElement | null {
  return Array.from(container.querySelectorAll<HTMLImageElement>(FINAL_IMAGE_SELECTOR))
    .find(image => Boolean(getImageSourceUrl(image))) ?? null
}

async function waitForFinalImageWithSource(container: Element): Promise<HTMLImageElement | null> {
  for (let attempt = 0; attempt < IMAGE_SOURCE_RETRY_ATTEMPTS; attempt += 1) {
    const image = findFinalImageWithSource(container)
    if (image) {
      return image
    }
    if (attempt === IMAGE_SOURCE_RETRY_ATTEMPTS - 1) {
      break
    }
    await delay(IMAGE_SOURCE_RETRY_DELAY_MS)
  }

  return null
}

async function createNotificationImageData(image: HTMLImageElement): Promise<NotificationImageData> {
  const sourceUrl = getImageSourceUrl(image)
  if (!sourceUrl) {
    throw new Error('image-source-missing')
  }

  const response = await fetch(sourceUrl)
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

function delay(milliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}

export function resetResponseCompleteNotificationContentProviderForTest(): void {
  hasStarted = false
}
