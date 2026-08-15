import { eventBus } from '@/utils/eventbus'
import { tt } from '@/utils/i18n'
import type { ThemeBloomVisualState } from '@/common/event'
import { themeBloomService, type ThemeBloomService } from './service'
import {
  hasFileTransfer,
  hasSupportedThemeBloomImageTransfer,
  resolveThemeBloomDropDestination,
  subscribeToThemeBloomDrops,
  type ThemeBloomDropPayload,
} from './dropArbiter'

export {
  classifyThemeBloomDrop,
  isNativeThemeBloomUploadTarget,
} from './dropArbiter'

export interface ThemeBloomControllerOptions {
  window?: Window
  service?: ThemeBloomService
  emit?: (state: ThemeBloomVisualState) => void
}

function originFromEvent(event: DragEvent): { clientX: number; clientY: number } {
  return {
    clientX: event.clientX,
    clientY: event.clientY,
  }
}

export function createThemeBloomController(
  options: ThemeBloomControllerOptions = {},
) {
  const windowRef = options.window ?? window
  const service = options.service ?? themeBloomService
  const emit = options.emit ?? ((state) => {
    eventBus.emitSync('theme-bloom:state-change', state)
  })
  let dragDepth = 0
  let processing = false
  let abortController: AbortController | null = null
  let pendingResetTimer: number | null = null
  let unsubscribeFromDrops: (() => void) | null = null
  let started = false

  const setState = (state: ThemeBloomVisualState) => {
    emit(state)
  }
  const clearPendingReset = () => {
    if (pendingResetTimer === null) return
    windowRef.clearTimeout(pendingResetTimer)
    pendingResetTimer = null
  }
  const reset = () => {
    clearPendingReset()
    dragDepth = 0
    setState({ state: 'idle' })
  }
  const scheduleReset = () => {
    if (pendingResetTimer !== null) return
    pendingResetTimer = windowRef.setTimeout(() => {
      pendingResetTimer = null
      if (dragDepth === 0) reset()
    }, 0)
  }

  const onDragEnter = (event: DragEvent) => {
    if (processing || !hasSupportedThemeBloomImageTransfer(event.dataTransfer)) return
    const destination = resolveThemeBloomDropDestination(event)
    if (destination === 'unknown') return

    clearPendingReset()
    dragDepth += 1
    const origin = originFromEvent(event)
    if (destination === 'inside-native-input') {
      setState({ state: 'over-native-upload', origin })
      return
    }
    setState({ state: dragDepth === 1 ? 'eligible-drag' : 'over-theme', origin })
  }

  const onDragOver = (event: DragEvent) => {
    if (processing || !hasSupportedThemeBloomImageTransfer(event.dataTransfer)) return
    const destination = resolveThemeBloomDropDestination(event)
    if (destination === 'unknown') return

    clearPendingReset()
    const origin = originFromEvent(event)
    if (destination === 'inside-native-input') {
      setState({ state: 'over-native-upload', origin })
      return
    }
    setState({ state: 'over-theme', origin })
  }

  const onDragLeave = (event: DragEvent) => {
    if (processing || !hasSupportedThemeBloomImageTransfer(event.dataTransfer)) return
    dragDepth = Math.max(0, dragDepth - 1)
    if (dragDepth === 0) scheduleReset()
  }

  const onDragEnd = () => {
    if (!processing) reset()
  }

  const applyThemeBloomDrop = ({
    classification,
    origin,
  }: ThemeBloomDropPayload) => {
    if (processing) return
    clearPendingReset()
    if (classification.kind !== 'valid') {
      reset()
      return
    }

    processing = true
    dragDepth = 0
    abortController = new AbortController()
    let failed = false
    setState({ state: 'analyzing', origin })
    void service.apply({
      file: classification.file,
      origin,
      signal: abortController.signal,
      onPaletteResolved: (palette) => {
        setState({
          state: 'analyzing',
          origin,
          accentColor: palette.accentColor,
        })
      },
      onTransitionStart: (palette) => {
        setState({
          state: 'transitioning',
          origin,
          accentColor: palette.accentColor,
        })
      },
    }).catch((error) => {
      if (error instanceof DOMException && error.name === 'AbortError') return
      failed = true
      setState({
        state: 'error',
        message: tt(
          'settingPanel.theme.themeBloom.applyImageFailed',
          'Theme Bloom couldn’t apply this image.',
        ),
      })
    }).finally(() => {
      processing = false
      abortController = null
      if (failed) {
        windowRef.setTimeout(() => setState({ state: 'idle' }), 0)
      } else {
        setState({ state: 'idle' })
      }
    })
  }

  const onNativeDrop = (event: DragEvent) => {
    if (processing || !hasFileTransfer(event.dataTransfer)) return
    if (resolveThemeBloomDropDestination(event) !== 'outside-native-input') {
      reset()
    }
  }

  return {
    start() {
      if (started) return
      started = true
      unsubscribeFromDrops = subscribeToThemeBloomDrops(
        windowRef,
        applyThemeBloomDrop,
      )
      windowRef.addEventListener('dragenter', onDragEnter, true)
      windowRef.addEventListener('dragover', onDragOver, true)
      windowRef.addEventListener('dragleave', onDragLeave, true)
      windowRef.addEventListener('dragend', onDragEnd, true)
      windowRef.addEventListener('drop', onNativeDrop, true)
    },
    stop() {
      if (!started) return
      started = false
      windowRef.removeEventListener('dragenter', onDragEnter, true)
      windowRef.removeEventListener('dragover', onDragOver, true)
      windowRef.removeEventListener('dragleave', onDragLeave, true)
      windowRef.removeEventListener('dragend', onDragEnd, true)
      windowRef.removeEventListener('drop', onNativeDrop, true)
      unsubscribeFromDrops?.()
      unsubscribeFromDrops = null
      abortController?.abort()
      abortController = null
      processing = false
      reset()
    },
  }
}
