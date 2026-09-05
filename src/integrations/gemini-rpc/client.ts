import {
  GEMINI_RPC_BRIDGE_SOURCE,
  GEMINI_RPC_CONFIG,
  GEMINI_RPC_PROTOCOL_VERSION,
} from './config'
import type {
  GeminiRpcExecuteOptions,
  GeminiRpcResult,
  GeminiRpcResultMessage,
} from './types'

interface PendingRequest {
  resolve: (result: GeminiRpcResult) => void
  timeoutId: number
}

export interface GeminiRpcClient {
  dispose: () => void
  ensureReady: (signal?: AbortSignal) => Promise<boolean>
  execute: <Output = unknown>(
    operation: string,
    input: unknown,
    options?: GeminiRpcExecuteOptions,
  ) => Promise<GeminiRpcResult<Output>>
}

function createRequestId(): string {
  return globalThis.crypto?.randomUUID?.()
    ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

function createFailure<Output = never>(
  code: Extract<GeminiRpcResult, { ok: false }>['code'],
  outcome: Extract<GeminiRpcResult, { ok: false }>['outcome'],
): GeminiRpcResult<Output> {
  return { ok: false, code, outcome }
}

function isReadyMessage(data: unknown): boolean {
  return isBridgeRecord(data) && data.type === 'ready'
}

function isResultMessage(data: unknown): data is GeminiRpcResultMessage {
  return isBridgeRecord(data)
    && data.type === 'result'
    && typeof data.requestId === 'string'
    && isResult(data.result)
}

function isBridgeRecord(data: unknown): data is Record<string, unknown> {
  return Boolean(data)
    && typeof data === 'object'
    && !Array.isArray(data)
    && (data as Record<string, unknown>).source === GEMINI_RPC_BRIDGE_SOURCE
    && (data as Record<string, unknown>).protocolVersion === GEMINI_RPC_PROTOCOL_VERSION
}

function isResult(data: unknown): data is GeminiRpcResult {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return false
  }

  const result = data as Record<string, unknown>
  if (result.ok === true) {
    return 'data' in result
  }

  return result.ok === false
    && typeof result.code === 'string'
    && typeof result.outcome === 'string'
}

export function createGeminiRpcClient(windowRef: Window): GeminiRpcClient {
  const pendingRequests = new Map<string, PendingRequest>()
  const readyWaiters = new Set<(ready: boolean) => void>()
  let ready = false
  let disposed = false

  const settleReadyWaiters = (value: boolean) => {
    for (const resolve of readyWaiters) {
      resolve(value)
    }
    readyWaiters.clear()
  }

  const handleMessage = (event: MessageEvent<unknown>) => {
    if (event.source !== windowRef || event.origin !== windowRef.location.origin) {
      return
    }

    if (isReadyMessage(event.data)) {
      ready = true
      settleReadyWaiters(true)
      return
    }

    if (!isResultMessage(event.data)) {
      return
    }

    const pending = pendingRequests.get(event.data.requestId)
    if (!pending) {
      return
    }

    windowRef.clearTimeout(pending.timeoutId)
    pendingRequests.delete(event.data.requestId)
    pending.resolve(event.data.result)
  }

  windowRef.addEventListener('message', handleMessage)

  const post = (message: object): boolean => {
    if (disposed) {
      return false
    }

    try {
      windowRef.postMessage(message, windowRef.location.origin)
      return true
    } catch {
      return false
    }
  }

  const ensureReady = (signal?: AbortSignal): Promise<boolean> => {
    if (ready) {
      return Promise.resolve(true)
    }
    if (disposed || signal?.aborted) {
      return Promise.resolve(false)
    }

    return new Promise((resolve) => {
      let retryId: number | null = null
      let finished = false
      const deadline = Date.now() + GEMINI_RPC_CONFIG.initializationTimeoutMs

      const finish = (value: boolean) => {
        if (finished) {
          return
        }
        finished = true
        if (retryId !== null) {
          windowRef.clearTimeout(retryId)
        }
        readyWaiters.delete(onReady)
        signal?.removeEventListener('abort', onAbort)
        resolve(value)
      }

      const onReady = (value: boolean) => finish(value)
      const onAbort = () => finish(false)

      const ping = () => {
        if (ready) {
          finish(true)
          return
        }
        if (Date.now() >= deadline || !post({
          source: GEMINI_RPC_BRIDGE_SOURCE,
          protocolVersion: GEMINI_RPC_PROTOCOL_VERSION,
          type: 'ping',
        })) {
          finish(false)
          return
        }
        if (!finished) {
          retryId = windowRef.setTimeout(
            ping,
            GEMINI_RPC_CONFIG.initializationRetryMs,
          )
        }
      }

      readyWaiters.add(onReady)
      signal?.addEventListener('abort', onAbort, { once: true })
      ping()
    })
  }

  const execute = async <Output = unknown>(
    operation: string,
    input: unknown,
    options: GeminiRpcExecuteOptions = {},
  ): Promise<GeminiRpcResult<Output>> => {
    if (!operation) {
      return createFailure('operation_unavailable', 'not-sent')
    }
    if (options.signal?.aborted) {
      return createFailure('aborted', 'not-sent')
    }
    if (pendingRequests.size >= GEMINI_RPC_CONFIG.maxPendingRequests) {
      return createFailure('too_many_requests', 'not-sent')
    }
    if (!(await ensureReady(options.signal))) {
      return createFailure(
        options.signal?.aborted ? 'aborted' : 'runtime_unavailable',
        'not-sent',
      )
    }

    const requestId = createRequestId()
    const timeoutMs = options.timeoutMs ?? GEMINI_RPC_CONFIG.requestTimeoutMs

    return new Promise((resolve) => {
      let settled = false
      const settle = (result: GeminiRpcResult<Output>) => {
        if (settled) {
          return
        }
        settled = true
        const pending = pendingRequests.get(requestId)
        if (pending) {
          windowRef.clearTimeout(pending.timeoutId)
          pendingRequests.delete(requestId)
        }
        options.signal?.removeEventListener('abort', onAbort)
        resolve(result)
      }
      const onAbort = () => settle(createFailure('aborted', 'unknown'))
      const timeoutId = windowRef.setTimeout(() => {
        settle(createFailure('timeout', 'unknown'))
      }, timeoutMs)

      pendingRequests.set(requestId, {
        resolve: (result) => settle(result as GeminiRpcResult<Output>),
        timeoutId,
      })
      options.signal?.addEventListener('abort', onAbort, { once: true })

      const posted = post({
        source: GEMINI_RPC_BRIDGE_SOURCE,
        protocolVersion: GEMINI_RPC_PROTOCOL_VERSION,
        type: 'execute',
        requestId,
        operation,
        input,
      })
      if (!posted) {
        settle(createFailure('runtime_unavailable', 'not-sent'))
      }
    })
  }

  return {
    dispose: () => {
      if (disposed) {
        return
      }
      disposed = true
      windowRef.removeEventListener('message', handleMessage)
      settleReadyWaiters(false)
      for (const [requestId, pending] of pendingRequests) {
        windowRef.clearTimeout(pending.timeoutId)
        pendingRequests.delete(requestId)
        pending.resolve(createFailure('runtime_unavailable', 'unknown'))
      }
    },
    ensureReady,
    execute,
  }
}

export const geminiRpcClient = createGeminiRpcClient(window)
