/**
 * Chat Change Detector Service
 * 负责检测聊天切换并发出事件
 */

import { ChatChangeEvent, URLChangeEvent } from '@/common/event'
import { urlMonitor } from './urlMonitor'
import { eventBus } from '@/utils/eventbus'


class ChatChangeDetector {
  private originalUrl: string
  private isActive = false
  private isNewChat = false
  private historyCheckTimer: NodeJS.Timeout | null = null

  constructor() {
    this.originalUrl = window.location.href
    this.updateNewChatStatus()
  }

  /**
   * 开始检测聊天切换
   */
  start(): void {
    if (this.isActive) return
    
    this.isActive = true
    console.log('[ChatChangeDetector] Starting chat change detection...')
    
    // 确保 URL 监听器已启动
    if (!urlMonitor.isMonitoring()) {
      urlMonitor.start()
    }
    
    // 监听事件总线
    eventBus.on('urlchange', this.handleURLChange)
  }

  /**
   * 停止检测聊天切换
   */
  stop(): void {
    if (!this.isActive) return
    
    this.isActive = false
    console.log('[ChatChangeDetector] Stopping chat change detection...')
    
    // 清理定时器
    this.clearHistoryCheckTimer()
    
    // 移除事件总线监听
    eventBus.off('urlchange', this.handleURLChange)
  }

  /**
   * 处理 URL 变化
   */
  private handleURLChange = (eventData: URLChangeEvent): void => {
    const currentUrl = eventData.url
    
    // 检查是否切换了聊天
    const originalBase = this.originalUrl.split('/app')[0] + '/app'
    const currentBase = currentUrl.split('/app')[0] + '/app'
    
    if (originalBase !== currentBase || this.originalUrl !== currentUrl) {
      // 保存当前的新聊天状态
      const wasFromNewChat = this.isNewChat
      
      const chatChangeEvent: ChatChangeEvent = {
        originalUrl: this.originalUrl,
        currentUrl: currentUrl,
        timestamp: eventData.timestamp,
        isFromNewChat: wasFromNewChat
      }
      
      console.log('[ChatChangeDetector] Chat switched:', chatChangeEvent)
      
      // 发出聊天切换事件
      this.emitChatChange(chatChangeEvent)
      
      // 更新原始 URL 和新聊天状态
      this.originalUrl = currentUrl
      this.updateNewChatStatus()
    }
  }

  /**
   * 发出聊天切换事件
   */
  private emitChatChange(eventData: ChatChangeEvent): void {
    // 发出事件总线事件
    eventBus.emit('chatchange', eventData)
  }

  /**
   * 获取当前聊天 ID
   */
  getCurrentChatId(): string | null {
    const url = window.location.href
    const match = url.match(/\/app\/([a-f0-9]+)/)
    return match ? match[1] : null
  }

  /**
   * 检查是否正在检测
   */
  isDetecting(): boolean {
    return this.isActive
  }

  /**
   * 检查是否为空白的新聊天
   * 条件：URL 为 "gemini.google.com/app" 且当前聊天历史为空
   */
  private isBlankNewChat() {
    const url = window.location.href
    const isAppUrl = url === 'https://gemini.google.com/app' || url === 'http://gemini.google.com/app'
    
    return isAppUrl;
  }

  /**
   * 更新新聊天状态
   */
  private updateNewChatStatus() {
    this.isNewChat = this.isBlankNewChat()
    console.log('[ChatChangeDetector] New chat status updated:', this.isNewChat)
  }

  /**
   * 清理历史检查定时器
   */
  private clearHistoryCheckTimer(): void {
    if (this.historyCheckTimer) {
      clearTimeout(this.historyCheckTimer)
      this.historyCheckTimer = null
    }
  }

  /**
   * 获取当前是否为新聊天状态
   */
  getIsNewChat(): boolean {
    return this.isNewChat
  }
}

// 全局实例
export const chatChangeDetector = new ChatChangeDetector()
