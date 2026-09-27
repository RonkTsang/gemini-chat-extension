import { startLibraryMonitor } from './main-world/library-monitor'

export default defineContentScript({
  matches: ['*://gemini.google.com/*'],
  world: 'MAIN',
  runAt: 'document_start',
  main() {
    startLibraryMonitor()
  },
})
