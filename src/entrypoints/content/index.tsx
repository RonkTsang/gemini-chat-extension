import './lagecy/content';
import './prompt';

import { renderOverlay } from "./overlay"
import { chatChangeDetector } from '@/services/chatChangeDetector'
import { urlMonitor } from '@/services/urlMonitor'

export default defineContentScript({
  matches: ['*://gemini.google.com/*'],
  async main(ctx) {
    // 手动启动服务模块，确保正确的启动顺序
    console.log('[ContentScript] Starting services...')
    
    // 1. 首先注入 main world 脚本
    console.log('[ContentScript] Injecting main world script...')
    await injectScript('/url-monitor-main-world.js', {
      keepInDom: true,
    })
    console.log('[ContentScript] Main world script injected')
    
    // 2. 启动 URL 监听器（现在监听来自 main world 的事件）
    urlMonitor.start()
    console.log('[ContentScript] URL Monitor started')
    
    // 3. 然后启动聊天切换检测器（依赖 urlMonitor）
    chatChangeDetector.start()
    console.log('[ContentScript] Chat Change Detector started')
    
    // 4. 最后创建 UI
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
