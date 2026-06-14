import { browser } from 'wxt/browser'
import {
  isResponseCompleteNotificationGetContentMessage,
  type ResponseCompletionKind,
  type ResponseCompleteNotificationContent,
  type ResponseNotificationContentType,
} from '@/types/runtime-messages'
import { extractModelResponseContent } from '@/utils/messageUtils'

const FINAL_TURN_SELECTOR = 'div.conversation-container[id]'
const STRUCTURED_CONTENT_SELECTOR = 'structured-content-container'
const MODEL_RESPONSE_MESSAGE_CONTENT_SELECTOR = '[id*="model-response-message-content"]'
const RESPONSE_CONTENT_SELECTOR = `${STRUCTURED_CONTENT_SELECTOR} ${MODEL_RESPONSE_MESSAGE_CONTENT_SELECTOR}`
const FINAL_IMAGE_SELECTOR = 'generated-image > single-image > div > div > button.image-button > img'
const DEEP_RESEARCH_TITLE_SELECTOR = 'immersive-entry-chip gem-processing-card .card-title'
const MAX_NOTIFICATION_MESSAGE_LENGTH = 200
const FALLBACK_NOTIFICATION_TITLE = 'Gemini finished replying'
const FALLBACK_NOTIFICATION_MESSAGE = 'Your response is ready.'
const FALLBACK_IMAGE_NOTIFICATION_MESSAGE = 'Your image is ready.'
const CONTENT_RETRY_ATTEMPTS = 10
const CONTENT_RETRY_DELAY_MS = 100
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
      return undefined
    }

    return getResponseCompleteNotificationContent(message.payload.completionKind)
  })
}

export async function getResponseCompleteNotificationContent(
  completionKind: ResponseCompletionKind = 'standard-response',
): Promise<ResponseCompleteNotificationContent> {
  if (document.visibilityState === 'visible' && document.hasFocus()) {
    return createFallbackContent(true)
  }

  for (let attempt = 0; attempt < CONTENT_RETRY_ATTEMPTS; attempt += 1) {
    const content = await readNotificationContent(completionKind)
    if (content) {
      return content
    }
    await delay(CONTENT_RETRY_DELAY_MS)
  }

  return createFallbackContent(false)
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
    return responseType === 'image'
      ? FALLBACK_IMAGE_NOTIFICATION_MESSAGE
      : FALLBACK_NOTIFICATION_MESSAGE
  }

  return normalized.slice(0, MAX_NOTIFICATION_MESSAGE_LENGTH)
}

async function readNotificationContent(
  completionKind: ResponseCompletionKind,
): Promise<ResponseCompleteNotificationContent | null> {
  const turn = getLastFinalTurn()
  if (!turn) {
    return null
  }

  const responseType = getResponseType(turn)
  const modelResponse = getLastNonEmptyModelResponse(turn)
  const finalImage = findFinalImageWithSource(turn)
  if (!modelResponse && !finalImage) {
    return null
  }

  const deepResearchTitle = completionKind === 'deep-research'
    ? getDeepResearchTitle(turn)
    : null
  if (completionKind === 'deep-research' && !deepResearchTitle) {
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
    suppressed: false,
    title: getCurrentChatNotificationTitle(),
    message: deepResearchTitle ?? getCompletedModelResponseSummary(modelResponse, responseType),
    responseType,
    ...(imageDataUrl ? { imageDataUrl } : {}),
  }
}

export function getDeepResearchTitle(turn: Element): string | null {
  const titleElements = turn.querySelectorAll<HTMLElement>(DEEP_RESEARCH_TITLE_SELECTOR)
  for (let index = titleElements.length - 1; index >= 0; index -= 1) {
    const title = normalizeWhitespace(titleElements.item(index).textContent ?? '')
    if (title) {
      return title.slice(0, MAX_NOTIFICATION_MESSAGE_LENGTH)
    }
  }
  return null
}

function createFallbackContent(suppressed: boolean): ResponseCompleteNotificationContent {
  return {
    suppressed,
    title: getCurrentChatNotificationTitle(),
    message: FALLBACK_NOTIFICATION_MESSAGE,
    responseType: 'text',
  }
}

function getLastFinalTurn(): HTMLElement | null {
  const turns = document.querySelectorAll<HTMLElement>(FINAL_TURN_SELECTOR)
  return turns.item(turns.length - 1) || null
}

function getResponseType(turn: HTMLElement): ResponseNotificationContentType {
  return turn.querySelector('generated-image single-image') ? 'image' : 'text'
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
