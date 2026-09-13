import { extensionRpcRequestSchema, type ExtensionRpcRoute } from './contract'
import type { Browser } from 'wxt/browser'

export type ExtensionRpcMessageListener = (
  message: unknown,
  sender: Browser.runtime.MessageSender,
) => unknown

/**
 * Returns undefined for messages outside this RPC namespace so legacy runtime
 * message handlers keep their established behaviour.
 */
export function createExtensionRpcRouter(
  routes: readonly ExtensionRpcRoute<unknown, unknown>[],
): ExtensionRpcMessageListener {
  return (message, sender) => {
    const envelope = extensionRpcRequestSchema.safeParse(message)
    if (!envelope.success) return undefined
    const route = routes.find((candidate) => (
      candidate.namespace === envelope.data.namespace
      && (candidate.method === envelope.data.method || candidate.method === '*')
    ))
    if (!route) return undefined
    if (!route.validateSender(sender)) return Promise.resolve(undefined)
    const request = route.requestSchema.safeParse(message)
    if (!request.success) return Promise.resolve(undefined)
    return route.handle(request.data, sender)
      .then((response) => route.responseSchema.parse(response))
  }
}
