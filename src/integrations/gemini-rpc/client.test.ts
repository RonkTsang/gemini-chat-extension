import { afterEach, describe, expect, it } from 'vitest'

import {
  GEMINI_RPC_BRIDGE_SOURCE,
  GEMINI_RPC_PROTOCOL_VERSION,
} from './config'
import { createGeminiRpcClient, geminiRpcClient } from './client'

function dispatchReady(): void {
  window.dispatchEvent(new MessageEvent('message', {
    source: window,
    origin: window.location.origin,
    data: {
      source: GEMINI_RPC_BRIDGE_SOURCE,
      protocolVersion: GEMINI_RPC_PROTOCOL_VERSION,
      type: 'ready',
    },
  }))
}

describe('Gemini RPC client', () => {
  const clients = [geminiRpcClient]

  afterEach(() => {
    for (const client of clients.splice(0)) {
      client.dispose()
    }
  })

  it('unblocks a waiting client after the Main World runtime replies ready', async () => {
    const client = createGeminiRpcClient(window)
    clients.push(client)

    const ready = client.ensureReady()
    dispatchReady()

    await expect(ready).resolves.toBe(true)
  })

  it('returns a not-sent abort result before it posts an operation', async () => {
    const client = createGeminiRpcClient(window)
    clients.push(client)
    const controller = new AbortController()
    controller.abort()

    await expect(client.execute('conversation.delete', {}, {
      signal: controller.signal,
    })).resolves.toEqual({
      ok: false,
      code: 'aborted',
      outcome: 'not-sent',
    })
  })
})
