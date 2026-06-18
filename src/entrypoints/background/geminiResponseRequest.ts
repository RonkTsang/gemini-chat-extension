const GEMINI_HOSTNAME = 'gemini.google.com'
const STREAM_GENERATE_PATH = '/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate'
const BATCH_EXECUTE_PATH = '/_/BardChatUi/data/batchexecute'
const CONVERSATION_SOURCE_PATH_PREFIX = '/app/'

export const GEMINI_RPC_IDS = {
  deepResearchPoll: 'kwDCne',
  conversationHistory: 'hNvQHb',
  finalAcknowledgement: 'VxUbXb',
  conversationConfirmation: 'k81mDb',
} as const

export type GeminiResponseRequest =
  | { kind: 'stream-generate' }
  | {
      kind: 'batchexecute'
      rpcId: string
      conversationId: string
    }
  | { kind: 'other' }

export function classifyGeminiResponseRequest(url: string): GeminiResponseRequest {
  let parsedUrl: URL
  try {
    parsedUrl = new URL(url)
  } catch {
    return { kind: 'other' }
  }

  if (parsedUrl.hostname !== GEMINI_HOSTNAME) {
    return { kind: 'other' }
  }

  if (parsedUrl.pathname === STREAM_GENERATE_PATH) {
    return { kind: 'stream-generate' }
  }

  if (parsedUrl.pathname !== BATCH_EXECUTE_PATH) {
    return { kind: 'other' }
  }

  const conversationId = getConversationId(parsedUrl.searchParams.get('source-path'))
  if (!conversationId) {
    return { kind: 'other' }
  }

  const rpcId = parsedUrl.searchParams.get('rpcids')
  if (rpcId) {
    return {
      kind: 'batchexecute',
      rpcId,
      conversationId,
    }
  }

  return { kind: 'other' }
}

function getConversationId(sourcePath: string | null): string | null {
  if (!sourcePath?.startsWith(CONVERSATION_SOURCE_PATH_PREFIX)) {
    return null
  }

  const conversationId = sourcePath.slice(CONVERSATION_SOURCE_PATH_PREFIX.length)
  if (!conversationId || conversationId.includes('/')) {
    return null
  }

  return conversationId
}
