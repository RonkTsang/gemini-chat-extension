import { isAllowedBackgroundImageMimeType } from '@/entrypoints/content/gemini-theme/background/types'

const NATIVE_UPLOAD_BOUNDARY_SELECTORS = [
  'input-area-v2',
  '.input-area',
  '.text-input-field',
  'rich-textarea',
  'prompt-textarea',
  'model-prompt-input',
]
const NATIVE_UPLOAD_SELECTOR = [
  ...NATIVE_UPLOAD_BOUNDARY_SELECTORS,
  'input[type="file"]',
].join(', ')
const GEMINI_UPLOAD_DROPZONE_SELECTOR = '.xap-uploader-dropzone'
const DROP_CHANNEL_PROPERTY = '__gpkThemeBloomDropChannelV1__'
const DROP_ARBITER_PROPERTY = '__gpkThemeBloomDropArbiterV1__'

export type ThemeBloomFileClassification =
  | { kind: 'valid'; file: File }
  | { kind: 'invalid' | 'none' }

export interface ThemeBloomDropPayload {
  classification: ThemeBloomFileClassification
  origin: {
    clientX: number
    clientY: number
  }
}

export type ThemeBloomDropDestination = 'inside-native-input' | 'outside-native-input' | 'unknown'

interface ThemeBloomDropChannel {
  handler: ((payload: ThemeBloomDropPayload) => void) | null
  pending: ThemeBloomDropPayload | null
}

export interface ThemeBloomDropArbiterOptions {
  window?: Window
  isEnabled: () => boolean
}

interface ThemeBloomDropArbiter {
  start: () => void
  stop: () => void
}

function getDropChannel(windowRef: Window): ThemeBloomDropChannel {
  const channelHost = windowRef as unknown as Record<string, unknown>
  const existingChannel = channelHost[DROP_CHANNEL_PROPERTY]
  if (existingChannel) return existingChannel as ThemeBloomDropChannel

  const channel: ThemeBloomDropChannel = {
    handler: null,
    pending: null,
  }
  Object.defineProperty(channelHost, DROP_CHANNEL_PROPERTY, {
    configurable: true,
    value: channel,
  })
  return channel
}

function publishThemeBloomDrop(
  windowRef: Window,
  payload: ThemeBloomDropPayload,
): void {
  const channel = getDropChannel(windowRef)
  if (channel.handler) {
    channel.handler(payload)
    return
  }

  // A user cannot normally drop before the document-idle controller starts,
  // but retain at most one file so early registration never creates a queue.
  channel.pending = payload
}

export function subscribeToThemeBloomDrops(
  windowRef: Window,
  handler: (payload: ThemeBloomDropPayload) => void,
): () => void {
  const channel = getDropChannel(windowRef)
  channel.handler = handler
  const pending = channel.pending
  channel.pending = null
  if (pending) handler(pending)

  return () => {
    if (channel.handler === handler) channel.handler = null
  }
}

export function hasFileTransfer(dataTransfer: DataTransfer | null): boolean {
  return Boolean(dataTransfer?.types && Array.from(dataTransfer.types).includes('Files'))
}

export function hasSupportedThemeBloomImageTransfer(
  dataTransfer: DataTransfer | null,
): boolean {
  if (!hasFileTransfer(dataTransfer)) return false
  const items = Array.from(dataTransfer?.items ?? [])
  if (items.length > 0) {
    return items.length === 1
      && items[0].kind === 'file'
      && isAllowedBackgroundImageMimeType(items[0].type)
  }

  const files = Array.from(dataTransfer?.files ?? [])
  return files.length === 1 && isAllowedBackgroundImageMimeType(files[0].type)
}

export function classifyThemeBloomDrop(
  dataTransfer: DataTransfer | null,
): ThemeBloomFileClassification {
  if (!hasFileTransfer(dataTransfer)) return { kind: 'none' }
  const files = Array.from(dataTransfer?.files ?? [])
  if (files.length !== 1) {
    return { kind: 'invalid' }
  }
  if (!isAllowedBackgroundImageMimeType(files[0].type)) {
    return { kind: 'invalid' }
  }
  return { kind: 'valid', file: files[0] }
}

function getVisibleBoundaryRect(documentRef: Document): DOMRect | null {
  for (const selector of NATIVE_UPLOAD_BOUNDARY_SELECTORS) {
    const visibleRects = Array.from(documentRef.querySelectorAll(selector))
      .map((element) => element.getBoundingClientRect())
      .filter((rect) => rect.width > 0 && rect.height > 0)
    if (visibleRects.length === 1) return visibleRects[0]
    if (visibleRects.length > 1) return null
  }
  return null
}

function eventPathMatchesNativeInput(event: DragEvent): boolean {
  return event.composedPath().some((target) => (
    target instanceof Element && target.matches(NATIVE_UPLOAD_SELECTOR)
  ))
}

function hasNativeUploadCapability(documentRef: Document): boolean {
  return documentRef.querySelector(NATIVE_UPLOAD_SELECTOR) !== null
    || documentRef.querySelector(GEMINI_UPLOAD_DROPZONE_SELECTOR) !== null
}

function isWithinGeminiUploadDropzone(event: DragEvent): boolean {
  if (event.composedPath().some((target) => (
    target instanceof Element && target.matches(GEMINI_UPLOAD_DROPZONE_SELECTOR)
  ))) {
    return true
  }

  const targetDocument = event.target instanceof Node
    ? event.target.ownerDocument ?? document
    : document
  return Array.from(
    targetDocument.querySelectorAll(GEMINI_UPLOAD_DROPZONE_SELECTOR),
  ).some((element) => {
    const rect = element.getBoundingClientRect()
    return rect.width > 0
      && rect.height > 0
      && event.clientX >= rect.left
      && event.clientX <= rect.right
      && event.clientY >= rect.top
      && event.clientY <= rect.bottom
  })
}

function finishGeminiDragSession(
  sourceEvent: DragEvent,
  windowRef: Window,
  isEnabled: () => boolean,
  pendingTimers: Set<number>,
): void {
  const activeDropzones = Array.from(
    windowRef.document.querySelectorAll<HTMLElement>(
      `${GEMINI_UPLOAD_DROPZONE_SELECTOR}.xap-drag-in-progress`,
    ),
  )

  for (const dropzone of activeDropzones) {
    dropzone.dispatchEvent(new DragEvent('dragleave', {
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX: sourceEvent.clientX,
      clientY: sourceEvent.clientY,
      relatedTarget: windowRef.document.documentElement,
      dataTransfer: sourceEvent.dataTransfer,
    }))

    const timer = windowRef.setTimeout(() => {
      pendingTimers.delete(timer)
      if (!isEnabled()) return
      const stillShowsDragState = dropzone.classList.contains('xap-drag-in-progress')
        || dropzone.querySelector('file-drop-indicator') !== null
        || dropzone.querySelector('input-area-v2.file-drop-indicator-height') !== null
      if (!dropzone.isConnected || !stillShowsDragState) {
        return
      }

      const dataTransfer = typeof DataTransfer === 'function'
        ? new DataTransfer()
        : undefined
      dropzone.dispatchEvent(new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
        composed: true,
        clientX: sourceEvent.clientX,
        clientY: sourceEvent.clientY,
        dataTransfer,
      }))
    }, 0)
    pendingTimers.add(timer)
  }
}

export function resolveThemeBloomDropDestination(
  event: DragEvent,
): ThemeBloomDropDestination {
  const targetDocument = event.target instanceof Node
    ? event.target.ownerDocument ?? document
    : document

  if (eventPathMatchesNativeInput(event)) return 'inside-native-input'

  const pointElements = typeof targetDocument.elementsFromPoint === 'function'
    ? targetDocument.elementsFromPoint(event.clientX, event.clientY)
    : []
  if (pointElements.some((element) => (
    element.matches(NATIVE_UPLOAD_SELECTOR)
    || element.closest(NATIVE_UPLOAD_SELECTOR) !== null
  ))) {
    return 'inside-native-input'
  }

  const inputRect = getVisibleBoundaryRect(targetDocument)
  if (inputRect) {
    const isInside = event.clientX >= inputRect.left
      && event.clientX <= inputRect.right
      && event.clientY >= inputRect.top
      && event.clientY <= inputRect.bottom
    return isInside ? 'inside-native-input' : 'outside-native-input'
  }

  if (isWithinGeminiUploadDropzone(event)) return 'inside-native-input'

  // A chat surface with no unambiguous boundary may be mid-render or have a
  // changed DOM contract, so Gemini retains the drop. Non-chat surfaces do
  // not need a route allowlist: an actual upload control is the only reason
  // to preserve this unknown drop for Gemini.
  if (targetDocument.querySelector('chat-window') !== null) return 'unknown'
  if (hasNativeUploadCapability(targetDocument)) return 'unknown'
  return 'outside-native-input'
}

export function isNativeThemeBloomUploadTarget(event: DragEvent): boolean {
  return resolveThemeBloomDropDestination(event) === 'inside-native-input'
}

export function installThemeBloomDropArbiter(
  options: ThemeBloomDropArbiterOptions,
) {
  const windowRef = options.window ?? window
  const isEnabled = options.isEnabled
  let lastDragOrigin: ThemeBloomDropPayload['origin'] | null = null
  let started = false
  const pendingGeminiResetTimers = new Set<number>()

  const resetDragSession = () => {
    lastDragOrigin = null
  }

  const rememberDragOrigin = (event: DragEvent) => {
    lastDragOrigin = {
      clientX: event.clientX,
      clientY: event.clientY,
    }
  }

  const onDragEnter = (event: DragEvent) => {
    if (!isEnabled() || !hasSupportedThemeBloomImageTransfer(event.dataTransfer)) return
    rememberDragOrigin(event)
  }

  const onDragOver = (event: DragEvent) => {
    if (!isEnabled() || !hasSupportedThemeBloomImageTransfer(event.dataTransfer)) return
    rememberDragOrigin(event)
    const destination = resolveThemeBloomDropDestination(event)
    if (destination !== 'outside-native-input') return

    // Gemini already accepts dragover inside its own chat dropzone. Only make
    // extension-only regions such as the SideNav valid drop targets here.
    if (isWithinGeminiUploadDropzone(event)) return
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
  }

  const onDrop = (event: DragEvent) => {
    if (!isEnabled() || !hasFileTransfer(event.dataTransfer)) return
    const classification = classifyThemeBloomDrop(event.dataTransfer)
    if (classification.kind !== 'valid') {
      resetDragSession()
      return
    }
    const origin = lastDragOrigin ?? {
      clientX: event.clientX,
      clientY: event.clientY,
    }
    const destination = resolveThemeBloomDropDestination(event)
    if (destination !== 'outside-native-input') {
      resetDragSession()
      return
    }

    const payload: ThemeBloomDropPayload = {
      classification,
      origin,
    }
    event.preventDefault()
    event.stopImmediatePropagation()
    publishThemeBloomDrop(windowRef, payload)
    finishGeminiDragSession(
      event,
      windowRef,
      isEnabled,
      pendingGeminiResetTimers,
    )
    resetDragSession()
  }

  const onDragEnd = () => {
    if (!isEnabled()) {
      resetDragSession()
      return
    }
    resetDragSession()
  }

  let arbiter: ThemeBloomDropArbiter
  const unregisterArbiter = () => {
    const channelHost = windowRef as unknown as Record<string, unknown>
    if (channelHost[DROP_ARBITER_PROPERTY] === arbiter) {
      delete channelHost[DROP_ARBITER_PROPERTY]
    }
  }
  const registerArbiter = () => {
    const channelHost = windowRef as unknown as Record<string, unknown>
    const existingArbiter = channelHost[DROP_ARBITER_PROPERTY] as
      | ThemeBloomDropArbiter
      | undefined
    if (existingArbiter && existingArbiter !== arbiter) {
      existingArbiter.stop()
    }
    channelHost[DROP_ARBITER_PROPERTY] = arbiter
  }

  arbiter = {
    start() {
      if (started) return
      registerArbiter()
      started = true
      windowRef.addEventListener('dragenter', onDragEnter, true)
      windowRef.addEventListener('dragover', onDragOver, true)
      windowRef.addEventListener('drop', onDrop, true)
      windowRef.addEventListener('dragend', onDragEnd, true)
    },
    stop() {
      if (started) {
        started = false
        windowRef.removeEventListener('dragenter', onDragEnter, true)
        windowRef.removeEventListener('dragover', onDragOver, true)
        windowRef.removeEventListener('drop', onDrop, true)
        windowRef.removeEventListener('dragend', onDragEnd, true)
      }
      for (const timer of pendingGeminiResetTimers) {
        windowRef.clearTimeout(timer)
      }
      pendingGeminiResetTimers.clear()
      getDropChannel(windowRef).pending = null
      resetDragSession()
      unregisterArbiter()
    },
  }
  return arbiter
}
