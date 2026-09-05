import { GEMINI_RPC_BRIDGE_SOURCE, GEMINI_RPC_CONFIG, GEMINI_RPC_PROTOCOL_VERSION } from './config'
import { getGeminiOperation } from './operations'
import type {
  GeminiOperation,
  GeminiRpcCommand,
  GeminiRpcErrorCode,
  GeminiRpcFailureOutcome,
  GeminiRpcResult,
  GeminiRpcResultMessage,
  GeminiRuntimeParameters,
} from './types'
import { xhrInterceptor } from '@/utils/xhrInterceptor'

const BATCHEXECUTE_URL_PATTERN = /\/_\/BardChatUi\/data\/batchexecute(?:\?|$)/

interface CachedRuntimeParameters {
  accountPrefix: string
  parameters: GeminiRuntimeParameters
}

interface BatchExecuteRequest {
  body: string
  url: string
}

class GeminiRpcTransportError extends Error {
  constructor(
    readonly code: Extract<GeminiRpcErrorCode, 'http_error' | 'network_error' | 'timeout'>,
    readonly outcome: GeminiRpcFailureOutcome,
    readonly status?: number,
  ) {
    super(code)
  }
}

let started = false
let unregisterRequestInterceptor: (() => void) | null = null
let uninstallGeminiApiDebugGlobal: (() => void) | null = null
let latestRuntimeParameters: CachedRuntimeParameters | null = null
let nextRequestId = Math.floor(performance.now()) % 800_000
let runtimeGeneration = 0
const activeRequestIds = new Set<string>()

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function toNonEmptyString(value: unknown): string | null {
  if (typeof value === 'string') {
    return value.length > 0 ? value : null
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value)
  }

  return null
}

function readPath(root: Record<string, unknown>, path: string): unknown {
  let value: unknown = root

  for (const segment of path.split('.')) {
    if (!isRecord(value)) {
      return undefined
    }
    value = value[segment]
  }

  return value
}

function readFirstConfiguredValue(
  root: Record<string, unknown>,
  paths: readonly string[],
): string | null {
  for (const path of paths) {
    const value = toNonEmptyString(readPath(root, path))
    if (value) {
      return value
    }
  }

  return null
}

function readFormField(body: unknown, name: string): string | null {
  if (typeof body === 'string') {
    return new URLSearchParams(body).get(name)
  }

  if (body instanceof URLSearchParams) {
    return body.get(name)
  }

  if (typeof FormData !== 'undefined' && body instanceof FormData) {
    const value = body.get(name)
    return typeof value === 'string' ? value : null
  }

  return null
}

function getAccountPrefix(pathname = window.location.pathname): string {
  return pathname.match(/^\/u\/\d+(?=\/|$)/)?.[0] ?? ''
}

function getPageLanguage(): string {
  const language = document.documentElement.lang.trim().split('-')[0]
  return language || 'en'
}

function nextBatchRequestId(): string {
  nextRequestId = (nextRequestId + 1) % 800_000
  return String(100_000 + nextRequestId)
}

function createFailure(
  code: GeminiRpcErrorCode,
  outcome: GeminiRpcFailureOutcome,
): GeminiRpcResult {
  return { ok: false, code, outcome }
}

export function readWizRuntimeParameters(
  globalObject: Record<string, unknown> = window as unknown as Record<string, unknown>,
  capturedAt = Date.now(),
): GeminiRuntimeParameters | null {
  for (const rootName of GEMINI_RPC_CONFIG.wizGlobalData.roots) {
    const root = globalObject[rootName]
    if (!isRecord(root)) {
      continue
    }

    const at = readFirstConfiguredValue(root, GEMINI_RPC_CONFIG.wizGlobalData.fields.at)
    const fSid = readFirstConfiguredValue(root, GEMINI_RPC_CONFIG.wizGlobalData.fields.fSid)
    const bl = readFirstConfiguredValue(root, GEMINI_RPC_CONFIG.wizGlobalData.fields.bl)

    if (at && fSid && bl) {
      return {
        at,
        fSid,
        bl,
        capturedAt,
        source: 'wiz-global-data',
      }
    }
  }

  return null
}

export function extractRuntimeParametersFromXHR(
  url: string,
  body: unknown,
  capturedAt = Date.now(),
): GeminiRuntimeParameters | null {
  let requestUrl: URL
  try {
    requestUrl = new URL(url, window.location.origin)
  } catch {
    return null
  }

  const requestAccountPrefix = getAccountPrefix(requestUrl.pathname)
  if (requestUrl.pathname !== `${requestAccountPrefix}${GEMINI_RPC_CONFIG.endpoint}`) {
    return null
  }

  const at = toNonEmptyString(readFormField(body, 'at'))
  const fSid = toNonEmptyString(requestUrl.searchParams.get('f.sid'))
  const bl = toNonEmptyString(requestUrl.searchParams.get('bl'))

  if (!at || !fSid || !bl) {
    return null
  }

  return {
    at,
    fSid,
    bl,
    capturedAt,
    source: 'xhr',
  }
}

function resolveRuntimeParameters(): GeminiRuntimeParameters | null {
  const accountPrefix = getAccountPrefix()
  const cached = latestRuntimeParameters

  if (
    cached
    && cached.accountPrefix === accountPrefix
    && Date.now() - cached.parameters.capturedAt <= GEMINI_RPC_CONFIG.runtimeMaxAgeMs
  ) {
    return cached.parameters
  }

  latestRuntimeParameters = null
  return readWizRuntimeParameters()
}

function captureRuntimeParameters(url: string, method: string, body: unknown): void {
  if (method.toUpperCase() !== 'POST') {
    return
  }

  const parameters = extractRuntimeParametersFromXHR(url, body)
  if (!parameters) {
    return
  }

  latestRuntimeParameters = {
    accountPrefix: getAccountPrefix(new URL(url, window.location.origin).pathname),
    parameters,
  }
}

export function buildBatchExecuteRequest<Input>(
  operation: GeminiOperation<Input>,
  input: Input,
  parameters: GeminiRuntimeParameters,
): BatchExecuteRequest {
  const sourcePath = operation.sourcePath(input)
  if (!sourcePath.startsWith('/') || sourcePath.startsWith('/u/')) {
    throw new Error('Operation sourcePath must be an account-prefix-free absolute path')
  }

  const accountPrefix = getAccountPrefix()
  const fullSourcePath = `${accountPrefix}${sourcePath}`
  const requestUrl = new URL(
    `${accountPrefix}${GEMINI_RPC_CONFIG.endpoint}`,
    window.location.origin,
  )
  requestUrl.searchParams.set('rpcids', operation.rpcId)
  requestUrl.searchParams.set('source-path', fullSourcePath)
  requestUrl.searchParams.set('bl', parameters.bl)
  requestUrl.searchParams.set('f.sid', parameters.fSid)
  requestUrl.searchParams.set('hl', getPageLanguage())
  requestUrl.searchParams.set('_reqid', nextBatchRequestId())
  requestUrl.searchParams.set('rt', 'c')

  const args = operation.buildArgs(input)
  const fReq = JSON.stringify([[
    [operation.rpcId, JSON.stringify(args), null, 'generic'],
  ]])
  const body = new URLSearchParams({
    'f.req': fReq,
    at: parameters.at,
  }).toString()

  return {
    body,
    url: requestUrl.toString(),
  }
}

function sendXHR(request: BatchExecuteRequest): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()

    xhr.open('POST', request.url)
    xhr.timeout = GEMINI_RPC_CONFIG.requestTimeoutMs
    xhr.setRequestHeader(
      'Content-Type',
      'application/x-www-form-urlencoded;charset=UTF-8',
    )
    xhr.setRequestHeader('X-Same-Domain', '1')

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(xhr.responseText)
        return
      }

      reject(new GeminiRpcTransportError('http_error', 'rejected', xhr.status))
    }
    xhr.onerror = () => reject(new GeminiRpcTransportError('network_error', 'unknown'))
    xhr.ontimeout = () => reject(new GeminiRpcTransportError('timeout', 'unknown'))
    xhr.send(request.body)
  })
}

async function executeOperation(
  requestId: string,
  operationName: string,
  input: unknown,
): Promise<GeminiRpcResult> {
  if (activeRequestIds.has(requestId)) {
    return createFailure('duplicate_request', 'not-sent')
  }

  if (activeRequestIds.size >= GEMINI_RPC_CONFIG.maxPendingRequests) {
    return createFailure('too_many_requests', 'not-sent')
  }

  const operation = getGeminiOperation(operationName)
  if (!operation) {
    return createFailure('operation_unavailable', 'not-sent')
  }

  // Gemini enables Trusted Types reporting. Zod's object-schema JIT uses
  // Function(), so keep Main World validation on its interpreter path.
  const parsedInput = operation.inputSchema.safeParse(input, { jitless: true })
  if (!parsedInput.success) {
    return createFailure('invalid_input', 'not-sent')
  }

  const parameters = resolveRuntimeParameters()
  if (!parameters) {
    return createFailure('runtime_parameters_unavailable', 'not-sent')
  }

  activeRequestIds.add(requestId)
  try {
    const request = buildBatchExecuteRequest(operation, parsedInput.data, parameters)
    const responseText = await sendXHR(request)

    try {
      return {
        ok: true,
        data: operation.parseResponse(responseText),
      }
    } catch (error) {
      if (import.meta.env.DEV) {
        console.warn('[GeminiRpc] Failed to parse operation response', {
          operation: operationName,
          responseLength: responseText.length,
          rpcAcknowledgementPresent: responseText.includes(`"${operation.rpcId}"`),
          error,
        })
      }
      return createFailure('response_parse_error', 'unknown')
    }
  } catch (error) {
    if (error instanceof GeminiRpcTransportError) {
      if (error.code === 'http_error' && (error.status === 401 || error.status === 403)) {
        latestRuntimeParameters = null
      }
      return createFailure(error.code, error.outcome)
    }

    return createFailure('operation_failed', 'not-sent')
  } finally {
    activeRequestIds.delete(requestId)
  }
}

function postMessage(message: object): void {
  window.postMessage(message, window.location.origin)
}

function postReady(): void {
  postMessage({
    source: GEMINI_RPC_BRIDGE_SOURCE,
    protocolVersion: GEMINI_RPC_PROTOCOL_VERSION,
    type: 'ready',
  })
}

function postResult(requestId: string, result: GeminiRpcResult): void {
  const message: GeminiRpcResultMessage = {
    source: GEMINI_RPC_BRIDGE_SOURCE,
    protocolVersion: GEMINI_RPC_PROTOCOL_VERSION,
    type: 'result',
    requestId,
    result,
  }
  postMessage(message)
}

function isBridgeMessage(event: MessageEvent<unknown>): event is MessageEvent<Record<string, unknown>> {
  return event.source === window
    && event.origin === window.location.origin
    && isRecord(event.data)
    && event.data.source === GEMINI_RPC_BRIDGE_SOURCE
    && event.data.protocolVersion === GEMINI_RPC_PROTOCOL_VERSION
}

function isCommand(data: Record<string, unknown>): boolean {
  return data.type === 'execute'
    && typeof data.requestId === 'string'
    && data.requestId.length > 0
    && typeof data.operation === 'string'
    && data.operation.length > 0
}

function handleBridgeMessage(event: MessageEvent<unknown>): void {
  if (!isBridgeMessage(event)) {
    return
  }

  const data = event.data
  if (data.type === 'ping') {
    postReady()
    return
  }

  if (!isCommand(data)) {
    return
  }

  const command = data as unknown as GeminiRpcCommand
  void executeOperation(command.requestId, command.operation, command.input)
    .then((result) => postResult(command.requestId, result))
}

export function startGeminiRpcRuntime(): void {
  if (started) {
    return
  }

  started = true
  const generation = ++runtimeGeneration
  unregisterRequestInterceptor = xhrInterceptor.intercept({
    urlPattern: BATCHEXECUTE_URL_PATTERN,
    onRequest: captureRuntimeParameters,
  })
  if (import.meta.env.DEV) {
    void import('./debug').then(({ installGeminiApiDebugGlobal }) => {
      if (started && generation === runtimeGeneration) {
        uninstallGeminiApiDebugGlobal = installGeminiApiDebugGlobal()
      }
    })
  }
  window.addEventListener('message', handleBridgeMessage)
  window.addEventListener('pagehide', invalidateGeminiRpcRuntimeParameters, { once: true })
  postReady()
}

export function invalidateGeminiRpcRuntimeParameters(): void {
  latestRuntimeParameters = null
}

export function stopGeminiRpcRuntime(): void {
  if (!started) {
    return
  }

  unregisterRequestInterceptor?.()
  unregisterRequestInterceptor = null
  uninstallGeminiApiDebugGlobal?.()
  uninstallGeminiApiDebugGlobal = null
  runtimeGeneration++
  window.removeEventListener('message', handleBridgeMessage)
  window.removeEventListener('pagehide', invalidateGeminiRpcRuntimeParameters)
  activeRequestIds.clear()
  latestRuntimeParameters = null
  started = false
}
