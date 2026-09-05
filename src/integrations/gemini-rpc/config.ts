export const GEMINI_RPC_BRIDGE_SOURCE = 'gpk-gemini-rpc'
export const GEMINI_RPC_PROTOCOL_VERSION = 1

export const GEMINI_RPC_CONFIG = {
  endpoint: '/_/BardChatUi/data/batchexecute',
  runtimeMaxAgeMs: 5 * 60 * 1000,
  requestTimeoutMs: 15 * 1000,
  initializationTimeoutMs: 1500,
  initializationRetryMs: 50,
  maxPendingRequests: 8,
  wizGlobalData: {
    roots: ['WIZ_global_data'],
    fields: {
      at: ['SNlM0e'],
      fSid: ['FdrFJe'],
      bl: ['cfb2h'],
    },
  },
} as const
