import { geminiRpcClient } from '@/integrations/gemini-rpc/client'

import * as conversations from './conversations'
import type { GeminiApiAvailability } from './types'

/**
 * Public business boundary for verified Gemini resource APIs.
 * Resource methods are added only after their backing Operation is validated.
 */
export const geminiApi = {
  conversations,
  async getAvailability(): Promise<GeminiApiAvailability> {
    return {
      ready: await geminiRpcClient.ensureReady(),
    }
  },
}

export type { GeminiApiAvailability, GeminiApiResult } from './types'
