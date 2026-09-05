import { geminiApi } from '@/services/gemini-api'

const GEMINI_API_DEBUG_GLOBAL = 'geminiApi'

type GeminiApiDebugWindow = Window & {
  geminiApi?: typeof geminiApi
}

export function installGeminiApiDebugGlobal(
  windowRef: GeminiApiDebugWindow = window,
): () => void {
  if (!import.meta.env.DEV) {
    return () => undefined
  }

  const previousDescriptor = Object.getOwnPropertyDescriptor(
    windowRef,
    GEMINI_API_DEBUG_GLOBAL,
  )
  if (previousDescriptor && !previousDescriptor.configurable) {
    console.warn('[GeminiRpc] Cannot expose geminiApi: window.geminiApi is not configurable')
    return () => undefined
  }

  Object.defineProperty(windowRef, GEMINI_API_DEBUG_GLOBAL, {
    configurable: true,
    enumerable: false,
    value: geminiApi,
    writable: false,
  })

  return () => {
    if (windowRef.geminiApi !== geminiApi) {
      return
    }

    if (previousDescriptor) {
      Object.defineProperty(windowRef, GEMINI_API_DEBUG_GLOBAL, previousDescriptor)
      return
    }

    delete windowRef.geminiApi
  }
}
