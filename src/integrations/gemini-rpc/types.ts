import type { z } from 'zod'

import {
  GEMINI_RPC_BRIDGE_SOURCE,
  GEMINI_RPC_PROTOCOL_VERSION,
} from './config'

export type GeminiOperationRisk = 'read' | 'write' | 'destructive'

export interface GeminiOperation<Input = unknown, Output = unknown> {
  inputSchema: z.ZodType<Input>
  rpcId: string
  risk: GeminiOperationRisk
  sourcePath: (input: Input) => string
  buildArgs: (input: Input) => unknown[]
  parseResponse: (responseText: string) => Output
}

export function defineGeminiOperation<Input, Output>(
  operation: GeminiOperation<Input, Output>,
): GeminiOperation<Input, Output> {
  return operation
}

export interface GeminiRuntimeParameters {
  at: string
  fSid: string
  bl: string
  capturedAt: number
  source: 'xhr' | 'wiz-global-data'
}

export type GeminiRpcErrorCode =
  | 'aborted'
  | 'duplicate_request'
  | 'http_error'
  | 'invalid_input'
  | 'network_error'
  | 'operation_failed'
  | 'operation_unavailable'
  | 'response_parse_error'
  | 'runtime_parameters_unavailable'
  | 'runtime_unavailable'
  | 'timeout'
  | 'too_many_requests'

export type GeminiRpcFailureOutcome = 'not-sent' | 'rejected' | 'unknown'

export type GeminiRpcResult<Output = unknown> =
  | {
      ok: true
      data: Output
    }
  | {
      ok: false
      code: GeminiRpcErrorCode
      outcome: GeminiRpcFailureOutcome
    }

export interface GeminiRpcPingMessage {
  source: typeof GEMINI_RPC_BRIDGE_SOURCE
  protocolVersion: typeof GEMINI_RPC_PROTOCOL_VERSION
  type: 'ping'
}

export interface GeminiRpcReadyMessage {
  source: typeof GEMINI_RPC_BRIDGE_SOURCE
  protocolVersion: typeof GEMINI_RPC_PROTOCOL_VERSION
  type: 'ready'
}

export interface GeminiRpcCommand {
  source: typeof GEMINI_RPC_BRIDGE_SOURCE
  protocolVersion: typeof GEMINI_RPC_PROTOCOL_VERSION
  type: 'execute'
  requestId: string
  operation: string
  input: unknown
}

export interface GeminiRpcResultMessage {
  source: typeof GEMINI_RPC_BRIDGE_SOURCE
  protocolVersion: typeof GEMINI_RPC_PROTOCOL_VERSION
  type: 'result'
  requestId: string
  result: GeminiRpcResult
}

export type GeminiRpcBridgeMessage =
  | GeminiRpcPingMessage
  | GeminiRpcReadyMessage
  | GeminiRpcCommand
  | GeminiRpcResultMessage

export interface GeminiRpcExecuteOptions {
  signal?: AbortSignal
  timeoutMs?: number
}
