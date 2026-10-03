import { defineGeminiOperation, type GeminiOperation } from './types'

/**
 * Operations use captured native request/response contracts. Callers must verify
 * observable state before retrying a write whose outcome is unknown.
 */
export const geminiOperations = {
  'conversation.delete': defineGeminiOperation<{ conversationId: string }, DeleteConversationResponse>({
    rpcId: 'GzXR5e',
    risk: 'destructive',
    parseInput: parseConversationIdInput,
    sourcePath: () => getCurrentSourcePath(),
    buildArgs: ({ conversationId }) => [conversationId],
    parseResponse: parseDeleteConversationResponse,
  }),
  'conversation.rename': defineGeminiOperation<RenameConversationInput, RenameConversationResponse>({
    rpcId: 'MUAZcd',
    risk: 'write',
    parseInput: parseRenameConversationInput,
    sourcePath: () => getCurrentSourcePath(),
    buildArgs: ({ conversationId, title }) => [null, [['title']], [conversationId, title]],
    parseResponse: parseRenameConversationResponse,
  }),
} as const

interface RenameConversationInput {
  conversationId: string
  title: string
}

function parseRenameConversationInput(input: unknown) {
  const parsedConversation = parseConversationIdInput(input)
  if (!parsedConversation.success) {
    return { success: false } as const
  }

  const title = (input as Record<string, unknown>).title
  if (typeof title !== 'string' || !title.trim()) {
    return { success: false } as const
  }

  return { success: true, data: { ...parsedConversation.data, title } } as const
}

export interface RenameConversationResponse {
  accepted: true
  conversationId: string
  title: string
}

function parseConversationIdInput(input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { success: false } as const
  }

  const conversationId = (input as Record<string, unknown>).conversationId
  if (typeof conversationId !== 'string' || !/^c_[a-z0-9]+$/i.test(conversationId)) {
    return { success: false } as const
  }

  return { success: true, data: { conversationId } } as const
}

export interface DeleteConversationResponse {
  accepted: true
}

function getCurrentSourcePath(): string {
  const accountPrefix = window.location.pathname.match(/^\/u\/\d+(?=\/|$)/)?.[0] ?? ''
  const sourcePath = window.location.pathname.slice(accountPrefix.length)

  return sourcePath || '/app'
}

function parseBatchExecuteFrames(responseText: string): unknown[] {
  const frames: unknown[] = []

  for (const line of responseText.split(/\r?\n/)) {
    const candidate = line.trim()
    if (!candidate.startsWith('[')) {
      continue
    }

    try {
      frames.push(JSON.parse(candidate))
    } catch {
      // Length-prefixed responses may contain unrelated non-JSON frames.
    }
  }

  if (frames.length === 0) {
    throw new Error('No batchexecute response frames found')
  }

  return frames
}

function containsDeleteAcknowledgement(value: unknown): boolean {
  if (!Array.isArray(value)) {
    return false
  }

  if (
    value[0] === 'wrb.fr'
    && value[1] === 'GzXR5e'
    && value[2] === '[]'
  ) {
    return true
  }

  return value.some(containsDeleteAcknowledgement)
}

export function parseDeleteConversationResponse(responseText: string): DeleteConversationResponse {
  const hasDeleteAcknowledgement = parseBatchExecuteFrames(responseText)
    .some(containsDeleteAcknowledgement)

  if (!hasDeleteAcknowledgement) {
    throw new Error('Delete conversation RPC acknowledgement missing')
  }

  return { accepted: true }
}

function findRenameAcknowledgement(value: unknown): RenameConversationResponse | undefined {
  if (!Array.isArray(value)) {
    return undefined
  }

  if (value[0] === 'wrb.fr' && value[1] === 'MUAZcd') {
    if (typeof value[2] !== 'string') {
      throw new Error('Rename conversation RPC payload missing')
    }

    const payload: unknown = JSON.parse(value[2])
    if (!Array.isArray(payload) || payload[0] !== null || !Array.isArray(payload[1])) {
      throw new Error('Invalid rename conversation RPC payload')
    }

    const parsedConversation = parseRenameConversationInput({
      conversationId: payload[1][0],
      title: payload[1][1],
    })
    if (!parsedConversation.success) {
      throw new Error('Invalid rename conversation RPC result')
    }

    return { accepted: true, ...parsedConversation.data }
  }

  for (const child of value) {
    const acknowledgement = findRenameAcknowledgement(child)
    if (acknowledgement) {
      return acknowledgement
    }
  }

  return undefined
}

export function parseRenameConversationResponse(responseText: string): RenameConversationResponse {
  for (const frame of parseBatchExecuteFrames(responseText)) {
    const acknowledgement = findRenameAcknowledgement(frame)
    if (acknowledgement) {
      return acknowledgement
    }
  }

  throw new Error('Rename conversation RPC acknowledgement missing')
}

export function getGeminiOperation(name: string): GeminiOperation | undefined {
  return (geminiOperations as Record<string, GeminiOperation>)[name]
}
