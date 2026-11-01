import { startLibraryMonitor } from './main-world/library-monitor'
import { startStreamGenerateMonitor } from './main-world/stream-generate-monitor'
import { startChatDeleteMonitor } from './main-world/chat-delete-monitor'

export default defineContentScript({
  matches: ['*://gemini.google.com/*'],
  world: 'MAIN',
  runAt: 'document_start',
  main() {
    // Shared MAIN-world bootstrap for both browser variants.
    startStreamGenerateMonitor()
    startChatDeleteMonitor()
    startLibraryMonitor()
  },
})
