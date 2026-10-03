import { geminiRpcClient } from '@/integrations/gemini-rpc/client'

import type { GeminiApiResult } from './types'
import type {
  DeleteConversationResponse,
  RenameConversationResponse,
} from '@/integrations/gemini-rpc/operations'

export interface DeleteChatInput {
  /** Gemini's route chat ID, for example `a5cc61b9933a2743`. */
  chat_id: string
}

export interface RenameChatInput {
  /** Gemini's route chat ID or internal `c_` resource ID. */
  chat_id: string
  title: string
}

function toConversationResourceId(chatId: string): string {
  return chatId.startsWith('c_') ? chatId : `c_${chatId}`
}

export async function deleteChat(
  input: DeleteChatInput,
  options?: { signal?: AbortSignal },
): Promise<GeminiApiResult<DeleteConversationResponse>> {
  return geminiRpcClient.execute<DeleteConversationResponse>(
    'conversation.delete',
    { conversationId: toConversationResourceId(input.chat_id) },
    options,
  )
}

export async function renameChat(
  input: RenameChatInput,
  options?: { signal?: AbortSignal },
): Promise<GeminiApiResult<RenameConversationResponse>> {
  return geminiRpcClient.execute<RenameConversationResponse>(
    'conversation.rename',
    { conversationId: toConversationResourceId(input.chat_id), title: input.title },
    options,
  )
}
