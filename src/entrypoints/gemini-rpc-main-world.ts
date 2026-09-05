import { startGeminiRpcRuntime } from '@/integrations/gemini-rpc/main-world-runtime'

export default defineUnlistedScript(() => {
  startGeminiRpcRuntime()
})
