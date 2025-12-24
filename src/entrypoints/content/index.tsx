import './lagecy/content';
import './prompt';

import { renderOverlay } from "./overlay"
import { chatChangeDetector } from '@/services/chatChangeDetector'
import { urlMonitor } from '@/services/urlMonitor'

export default defineContentScript({
  matches: ['*://gemini.google.com/*'],
  async main(ctx) {
    // Manually start service modules to ensure correct boot sequence
    console.log('[ContentScript] Starting services...')
    
    // 1. First inject the main world script
    console.log('[ContentScript] Injecting main world script...')
    await injectScript('/url-monitor-main-world.js', {
      keepInDom: true,
    })
    console.log('[ContentScript] Main world script injected')
    
    // 2. Start URL monitor (now listening to events from main world)
    urlMonitor.start()
    console.log('[ContentScript] URL Monitor started')
    
    // 3. Then start chat change detector (depends on urlMonitor)
    chatChangeDetector.start()
    console.log('[ContentScript] Chat Change Detector started')
    
    // 4. Finally create the UI
    const ui = createIntegratedUi(ctx, {
      position: 'modal',
      anchor: 'body',
      zIndex: 9999999999,
      tag: 'div',
      append: (anchor, ui) => {
        const uiElement = ui as HTMLDivElement
        uiElement.style.zIndex = '9999999999'
        uiElement.style.position = 'fixed'
        uiElement.style.top = '0'
        anchor.appendChild(ui)
      },
      onMount: (container) => {
        renderOverlay(container)
      },
    });

    ui.mount();
    console.log('[ContentScript] UI mounted')
  },
});
