import { z } from 'zod'

export const chatDeletedSchema = z.object({
  accountPath: z.string().regex(/^(?:\/u\/\d+)?$/u),
  conversationId: z.string().regex(/^c_[a-f0-9]+$/u),
})
