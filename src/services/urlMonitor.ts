/**
 * URL Monitor Service
 * 负责监听 URL 变化并发出事件
 */

import { eventBus } from '@/utils/eventbus'
import { GEM_EXT_EVENTS, URLChangeEvent } from '@/common/event'

class URLMonitor {
  private isActive = false
  /**
   * 开始监听 URL 变化
   */
  start(): void {
    if (this.isActive) return
    
    this.isActive = true
    console.log('[URLMonitor] Starting URL monitoring...')
    
    // 监听来自 main world 的 CustomEvent
    window.addEventListener(GEM_EXT_EVENTS.URL_CHANGE, this.handleURLChange)
  }

  /**
   * 停止监听 URL 变化
   */
  stop(): void {
    if (!this.isActive) return
    
    this.isActive = false
    console.log('[URLMonitor] Stopping URL monitoring...')
    
    // 移除事件监听
    window.removeEventListener(GEM_EXT_EVENTS.URL_CHANGE, this.handleURLChange)
  }

  /**
   * 处理来自 main world 的 URL 变化事件
   */
  private handleURLChange = (event: Event): void => {
    const customEvent = event as CustomEvent<URLChangeEvent>
    const eventData = customEvent.detail
    
    console.log('[URLMonitor] URL changed from main world:', eventData.url)
    
    // 发出事件总线事件
    eventBus.emit('urlchange', eventData)
  }

  /**
   * 检查是否正在监听
   */
  isMonitoring(): boolean {
    return this.isActive
  }
}

// 全局实例
export const urlMonitor = new URLMonitor()
