import './lagecy/content';
import './prompt';
import './power-kit-entry';

import { browser } from 'wxt/browser'
import { renderOverlay } from "./overlay"
import { chatChangeDetector } from '@/services/chatChangeDetector'
import { urlMonitor } from '@/services/urlMonitor'
import { tabTitleSync } from '@/services/tabTitleSync'
import { i18nCache } from '@/utils/i18nCache'
import { stuffPageModule } from './stuff-page'
import { initTheme, initThemeBackground } from './gemini-theme'
import {
  FIREFOX_INSTANCE_ID_ATTR,
  markFirefoxReloadRequired,
} from '@/utils/firefoxReloadNotice'
import {
  FIREFOX_GET_INSTANCE_ID_MESSAGE,
  type FirefoxGetInstanceIdResponse,
} from '@/types/runtime-messages'

async function checkFirefoxExtensionInstance(): Promise<void> {
  if (!import.meta.env.FIREFOX || typeof document === 'undefined') {
    return
  }

  try {
    const response = await browser.runtime.sendMessage({
      type: FIREFOX_GET_INSTANCE_ID_MESSAGE,
    }) as FirefoxGetInstanceIdResponse | undefined
    const currentInstanceId = response?.instanceId
    if (!currentInstanceId) {
      return
    }

    const root = document.documentElement
    const previousInstanceId = root.getAttribute(FIREFOX_INSTANCE_ID_ATTR)
    if (previousInstanceId && previousInstanceId !== currentInstanceId) {
      markFirefoxReloadRequired()
      console.log('[FirefoxReloadNotice] Instance mismatch detected', {
        previousInstanceId,
        currentInstanceId,
        href: window.location.href,
      })
      return
    }

    root.setAttribute(FIREFOX_INSTANCE_ID_ATTR, currentInstanceId)
  } catch (error) {
    console.warn('[FirefoxReloadNotice] Failed to check extension instance:', error)
  }
}

export default defineContentScript({
  matches: ['*://gemini.google.com/*'],
  runAt: 'document_idle',
  async main(ctx) {
    // Log context creation
    console.log('[ContentScript] Context created, isValid:', ctx.isValid)

    // Initialize i18n cache ASAP (before context might be invalidated)
    i18nCache.initialize()
    await checkFirefoxExtensionInstance()

    // Manually start service modules to ensure correct boot sequence
    console.log('[ContentScript] Starting services...')

    // 1. First inject the main world script
    console.log('[ContentScript] Injecting main world script...')
    await injectScript('/url-monitor-main-world.js', {
      keepInDom: true,
    })
    console.log('[ContentScript] Main world script injected')

    // 1.1 Inject theme sync bridge script (main world)
    console.log('[ContentScript] Injecting theme sync main world script...')
    await injectScript('/theme-sync-main-world.js', {
      keepInDom: true,
    })
    console.log('[ContentScript] Theme sync main world script injected')

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

    // Apply persisted theme (or default if none saved)
    void initTheme().then(() => initThemeBackground())

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
