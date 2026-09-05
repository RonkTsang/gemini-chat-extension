import { injectScript, type ScriptPublicPath } from 'wxt/utils/inject-script'

export default defineContentScript({
  include: ['firefox'],
  matches: ['*://gemini.google.com/*'],
  runAt: 'document_start',
  async main() {
    try {
      await injectScript('/gemini-rpc-main-world.js' as ScriptPublicPath, {
        keepInDom: true,
      })
    } catch (error) {
      console.warn('[GeminiRpc] Failed to inject Firefox Main World runtime', error)
    }
  },
})
