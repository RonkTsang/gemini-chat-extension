import type { GeminiRpcResult } from '@/integrations/gemini-rpc/types'

export type GeminiApiResult<Output = unknown> = GeminiRpcResult<Output>

export interface GeminiApiAvailability {
  ready: boolean
}
