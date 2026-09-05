import { geminiRpcClient } from '@/integrations/gemini-rpc/client'

import type { GeminiApiResult } from './types'
import type { DeleteConversationResponse } from '@/integrations/gemini-rpc/operations'

export interface DeleteConversationInput {
  /** Gemini's internal conversation resource ID, for example `c_a5cc61b9933a2743`. */
  conversationId: string
}

export async function deleteConversation(
  input: DeleteConversationInput,
  options?: { signal?: AbortSignal },
): Promise<GeminiApiResult<DeleteConversationResponse>> {
  return geminiRpcClient.execute<DeleteConversationResponse>(
    'conversation.delete',
    input,
    options,
  )
}
