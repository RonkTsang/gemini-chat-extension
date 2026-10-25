import { z } from 'zod'

export const streamGenerateActivitySchema = z.object({
  accountPath: z.string().regex(/^(?:\/u\/\d+)?$/u),
  conversationId: z.string().regex(/^c_[a-f0-9]+$/u),
})

export type StreamGenerateControl =
  | { action: 'arm'; token: string; accountPath: string }
  | { action: 'cancel'; token: string }

export interface StreamGenerateObservation {
  token: string
  phase: 'armed' | 'started' | 'metadata' | 'finished'
  requestId?: string
  conversationId?: string
  prompt?: string
  title?: string
}
