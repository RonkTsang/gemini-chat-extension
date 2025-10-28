/**
 * URL Monitor Main World Script
 * 在 main world 中重写 history 接口，检测真实的页面导航
 */

import { GEM_EXT_EVENTS } from '@/common/event'

export default defineUnlistedScript(() => {
  console.log('[URLMonitor Main World] Starting URL monitoring in main world...')
  
  // 保存原始方法
  const originalPushState = history.pushState
  const originalReplaceState = history.replaceState
  
  // 重写 pushState
  history.pushState = (...args) => {
    originalPushState.apply(history, args)
    emitURLChange()
  }
  
  // 重写 replaceState
  history.replaceState = (...args) => {
    originalReplaceState.apply(history, args)
    emitURLChange()
  }
  
  // 监听 popstate 事件
  window.addEventListener('popstate', emitURLChange)
  
  // 发出 URL 变化事件
  function emitURLChange() {
    const eventData = {
      url: window.location.href,
      timestamp: Date.now()
    }
    
    // 发出 CustomEvent 到 isolated world
    window.dispatchEvent(new CustomEvent(GEM_EXT_EVENTS.URL_CHANGE, {
      detail: eventData
    }))
    
    console.log('[URLMonitor Main World] URL changed:', eventData.url)
  }
  
  console.log('[URLMonitor Main World] URL monitoring started successfully')
})
