import { browser } from 'wxt/browser'
import type { z } from 'zod'

import type { ExtensionRpcRequest } from './contract'

export type ExtensionRpcTransport = (request: ExtensionRpcRequest) => Promise<unknown>

export class ExtensionRpcClient {
  constructor(private readonly transport: ExtensionRpcTransport = (request) => browser.runtime.sendMessage(request)) {}

  async request<TRequest, TResponse>(
    request: ExtensionRpcRequest<TRequest>,
    responseSchema: z.ZodType<TResponse>,
    options: { timeoutMs?: number; signal?: AbortSignal } = {},
  ): Promise<TResponse> {
    if (options.signal?.aborted) throw new DOMException('The RPC request was aborted', 'AbortError')
    const timeoutMs = options.timeoutMs ?? 15_000
    let timeout: ReturnType<typeof setTimeout> | undefined
    const aborted = new Promise<never>((_, reject) => {
      options.signal?.addEventListener('abort', () => reject(new DOMException('The RPC request was aborted', 'AbortError')), { once: true })
    })
    const timedOut = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => reject(new Error(`Extension RPC timed out after ${timeoutMs}ms`)), timeoutMs)
    })
    try {
      const result = await Promise.race([this.transport(request as ExtensionRpcRequest), aborted, timedOut])
      return responseSchema.parse(result)
    } finally {
      if (timeout) clearTimeout(timeout)
    }
  }
}
