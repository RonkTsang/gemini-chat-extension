import './lagecy/content';
import './prompt';

import { renderOverlay } from "./overlay"
import { chatChangeDetector } from '@/services/chatChangeDetector'
import { urlMonitor } from '@/services/urlMonitor'
import { tabTitleSync } from '@/services/tabTitleSync'
import { i18nCache } from '@/utils/i18nCache'
import { stuffPageModule } from './stuff-page'

export default defineContentScript({
  matches: ['*://gemini.google.com/*'],
  runAt: 'document_idle',
  async main(ctx) {
    // Log context creation
    console.log('[ContentScript] Context created, isValid:', ctx.isValid)

    // Initialize i18n cache ASAP (before context might be invalidated)
    i18nCache.initialize()

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

    // 4. Start tab title sync
    tabTitleSync.start()
    console.log('[ContentScript] Tab Title Sync started')

    // 5. Start stuff page module
    stuffPageModule.start()
    console.log('[ContentScript] Stuff Page Module started')

    // 6. Finally create the UI
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
    console.log('[ContentScript] UI mounted, context still valid:', ctx.isValid)
  },
});
