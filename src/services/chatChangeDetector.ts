/**
 * Chat Change Detector Service
 * Responsible for detecting chat switches and emitting events
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
   * Start detecting chat switches
   */
  start(): void {
    if (this.isActive) return
    
    this.isActive = true
    console.log('[ChatChangeDetector] Starting chat change detection...')
    
    // Ensure URL monitor is started
    if (!urlMonitor.isMonitoring()) {
      urlMonitor.start()
    }
    
    // Listen to event bus
    eventBus.on('urlchange', this.handleURLChange)
  }

  /**
   * Stop detecting chat switches
   */
  stop(): void {
    if (!this.isActive) return
    
    this.isActive = false
    console.log('[ChatChangeDetector] Stopping chat change detection...')
    
    // Cleanup timers
    this.clearHistoryCheckTimer()
    
    // Remove event bus listener
    eventBus.off('urlchange', this.handleURLChange)
  }

  /**
   * Handle URL change
   */
  private handleURLChange = (eventData: URLChangeEvent): void => {
    const currentUrl = eventData.url
    
    // Check if chat has switched
    const originalBase = this.originalUrl.split('/app')[0] + '/app'
    const currentBase = currentUrl.split('/app')[0] + '/app'
    
    if (originalBase !== currentBase || this.originalUrl !== currentUrl) {
      // Save current new chat status
      const wasFromNewChat = this.isNewChat
      
      const chatChangeEvent: ChatChangeEvent = {
        originalUrl: this.originalUrl,
        currentUrl: currentUrl,
        timestamp: eventData.timestamp,
        isFromNewChat: wasFromNewChat
      }
      
      console.log('[ChatChangeDetector] Chat switched:', chatChangeEvent)
      
      // Emit chat switch event
      this.emitChatChange(chatChangeEvent)
      
      // Update original URL and new chat status
      this.originalUrl = currentUrl
      this.updateNewChatStatus()
    }
  }

  /**
   * Emit chat switch event
   */
  private emitChatChange(eventData: ChatChangeEvent): void {
    // Emit event bus event
    eventBus.emit('chatchange', eventData)
  }

  /**
   * Get current chat ID
   */
  getCurrentChatId(): string | null {
    const url = window.location.href
    const match = url.match(/\/app\/([a-f0-9]+)/)
    return match ? match[1] : null
  }

  /**
   * Check if monitoring is active
   */
  isDetecting(): boolean {
    return this.isActive
  }

  /**
   * Check if it is a blank new chat
   * Condition: URL is "gemini.google.com/app" and current chat history is empty
   */
  private isBlankNewChat() {
    const url = window.location.href
    const isAppUrl = url === 'https://gemini.google.com/app' || url === 'http://gemini.google.com/app'
    
    return isAppUrl;
  }

  /**
   * Update new chat status
   */
  private updateNewChatStatus() {
    this.isNewChat = this.isBlankNewChat()
    console.log('[ChatChangeDetector] New chat status updated:', this.isNewChat)
  }

  /**
   * Cleanup history check timer
   */
  private clearHistoryCheckTimer(): void {
    if (this.historyCheckTimer) {
      clearTimeout(this.historyCheckTimer)
      this.historyCheckTimer = null
    }
  }

  /**
   * Get current new chat status
   */
  getIsNewChat(): boolean {
    return this.isNewChat
  }
}

// Global instance
export const chatChangeDetector = new ChatChangeDetector()
