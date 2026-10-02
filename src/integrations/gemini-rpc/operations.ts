import { defineGeminiOperation, type GeminiOperation } from './types'

/**
 * Only operations that have completed native-request and side-effect validation
 * belong in this registry.
 */
export const geminiOperations = {
  'conversation.delete': defineGeminiOperation<{ conversationId: string }, DeleteConversationResponse>({
    rpcId: 'GzXR5e',
    risk: 'destructive',
    parseInput: parseDeleteConversationInput,
    sourcePath: () => getCurrentSourcePath(),
    buildArgs: ({ conversationId }) => [conversationId],
    parseResponse: parseDeleteConversationResponse,
  }),
} as const

function parseDeleteConversationInput(input: unknown) {
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

export function getGeminiOperation(name: string): GeminiOperation | undefined {
  return (geminiOperations as Record<string, GeminiOperation>)[name]
}
