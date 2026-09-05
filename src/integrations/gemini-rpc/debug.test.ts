import { afterEach, describe, expect, it } from 'vitest'

import { installGeminiApiDebugGlobal } from './debug'
import { geminiApi } from '@/services/gemini-api'

describe('Gemini API debug global', () => {
  afterEach(() => {
    delete (window as Window & { geminiApi?: unknown }).geminiApi
  })

  it('exposes geminiApi while the Main World runtime is active', () => {
    const uninstall = installGeminiApiDebugGlobal()

    expect((window as Window & { geminiApi?: unknown }).geminiApi).toBe(geminiApi)

    uninstall()

    expect('geminiApi' in window).toBe(false)
  })

  it('restores an existing configurable page global when uninstalled', () => {
    const existingApi = { pageOwned: true }
    Object.defineProperty(window, 'geminiApi', {
      configurable: true,
      value: existingApi,
    })

    const uninstall = installGeminiApiDebugGlobal()
    uninstall()

    expect((window as Window & { geminiApi?: unknown }).geminiApi).toBe(existingApi)
  })
})
