import { z } from 'zod'
import type { Browser } from 'wxt/browser'

/** The small common envelope shared by extension-runtime RPC users. */
export const extensionRpcRequestSchema = z.object({
  namespace: z.string().min(1).max(64),
  protocolVersion: z.literal(1),
  requestId: z.string().min(1).max(128),
  method: z.string().min(1).max(128),
}).passthrough()

export type ExtensionRpcRequest<TParams = unknown> = z.infer<typeof extensionRpcRequestSchema> & {
  params: TParams
}

export interface ExtensionRpcRoute<TRequest, TResponse> {
  namespace: string
  method: string
  requestSchema: z.ZodType<TRequest>
  responseSchema: z.ZodType<TResponse>
  validateSender: (sender: Browser.runtime.MessageSender) => boolean
  handle: (request: TRequest, sender: Browser.runtime.MessageSender) => Promise<TResponse>
}
