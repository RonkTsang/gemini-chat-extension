/**
 * Chat action utilities for chain prompt execution
 * Handles chat history detection and new chat creation
 */

import { hasChatHistory, getChatSummary, getDefaultChatWindow } from './messageUtils'

/**
 * Create a new chat by simulating click on the "New chat" button
 * Preserves Content Script state (unlike navigation-based approach)
 * @returns Promise<boolean> - true if successful, false otherwise
 */
export const createNewChatByClick = async (): Promise<boolean> => {
  try {
    // Get chat summary before creating new chat
    const beforeSummary = getChatSummary()
    const beforeCount = beforeSummary.messageCount
    
    // Button selectors (ordered by priority)
    const selectors = [
      // Primary selector (based on Gemini DOM structure)
      'side-navigation-v2 side-nav-action-button[data-test-id="new-chat-button"] a[aria-label="New chat"]',
      
      // Alternative selectors
      'a[aria-label="New chat"]',
      'side-nav-action-button[data-test-id="new-chat-button"] a',
      '[data-test-id="new-chat-button"]',
      
      // Generic fallbacks
      'button[aria-label*="New"]',
    ]
    
    let button: HTMLButtonElement | null = null
    let matchedSelector = ''
    
    for (const selector of selectors) {
      button = document.querySelector<HTMLButtonElement>(selector)
      if (button) {
        matchedSelector = selector
        console.log('[Chain Prompt] Found new chat button with selector:', selector)
        break
      }
    }
    
    if (!button) {
      console.error('[Chain Prompt] New chat button not found')
      return false
    }
    
    // Simulate click
    button.click()
    
    // Wait for new chat to be ready
    const success = await waitForNewChatReady(beforeCount)
    
    if (success) {
      console.log('[Chain Prompt] New chat created successfully')
    }
    
    return success
  } catch (error) {
    console.error('[Chain Prompt] Failed to create new chat:', error)
    return false
  }
}

/**
 * Wait for new chat to be ready after clicking "New chat" button
 * Uses polling to detect when the chat window is cleared and ready for input
 * @param previousMessageCount Message count before creating new chat
 * @returns Promise<boolean> - true if new chat is ready, false if timeout
 */
const waitForNewChatReady = (previousMessageCount: number): Promise<boolean> => {
  return new Promise((resolve) => {
    let resolved = false
    let checkCount = 0
    const maxChecks = 30 // 3 seconds max (100ms intervals)
    
    const checkReady = (): boolean => {
      checkCount++
      
      // Check 1: Chat window exists
      const chatWindow = getDefaultChatWindow()
      if (!chatWindow) {
        return false
      }
      
      // Check 2: No messages in current chat (using optimized check)
      const hasMessages = hasChatHistory(chatWindow)
      if (hasMessages) {
        return false
      }
      
      // Check 3: Input box is ready and enabled
      const inputBox = document.querySelector('rich-textarea')
      const inputReady = inputBox && !inputBox.hasAttribute('disabled')
      
      if (!inputReady) {
        return false
      }
      
      // Check 4: Verify we actually transitioned to a new chat
      // (message count went from > 0 to 0)
      if (previousMessageCount > 0) {
        const currentSummary = getChatSummary(chatWindow)
        return currentSummary.messageCount === 0
      }
      
      // If previous count was 0, just check that input is ready
      return true
    }
    
    // Immediate check
    if (checkReady()) {
      console.log('[Chain Prompt] New chat ready immediately')
      resolve(true)
      resolved = true
      return
    }
    
    // Poll every 100ms
    const interval = setInterval(() => {
      if (resolved) {
        clearInterval(interval)
        return
      }
      
      if (checkReady()) {
        const duration = checkCount * 100
        console.log(`[Chain Prompt] New chat ready after ${duration}ms`)
        clearInterval(interval)
        resolve(true)
        resolved = true
      } else if (checkCount >= maxChecks) {
        console.warn('[Chain Prompt] Timeout waiting for new chat (3s)')
        clearInterval(interval)
        resolve(false)
        resolved = true
      }
    }, 100)
  })
}

/**
 * Check if chat input is ready for user input
 * @returns boolean - true if input is ready
 */
export const isInputReady = (): boolean => {
  const inputBox = document.querySelector('rich-textarea')
  return !!inputBox && !inputBox.hasAttribute('disabled')
}
