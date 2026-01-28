import { startStuffMonitor } from './main-world/stuff-monitor'

export default defineContentScript({
  matches: ['*://gemini.google.com/*'],
  world: 'MAIN',
  runAt: 'document_start',
  main() {
    startStuffMonitor()
  }
});