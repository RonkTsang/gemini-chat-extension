import { startStuffMonitor } from './main-world/stuff-monitor'
import { startGeminiRpcRuntime } from '@/integrations/gemini-rpc/main-world-runtime'

export default defineContentScript({
  include: ['chrome'],
  matches: ['*://gemini.google.com/*'],
  world: 'MAIN',
  runAt: 'document_start',
  main() {
    startGeminiRpcRuntime()
    startStuffMonitor()
  }
});
