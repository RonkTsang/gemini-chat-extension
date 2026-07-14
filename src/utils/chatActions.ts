/**
 * Chat action utilities for chain prompt execution
 * Handles chat history detection and new chat creation
 */

import { GEM_EXT_EVENTS } from '@/common/event'
import { hasChatHistory, getChatSummary, getDefaultChatWindow } from './messageUtils'

const NEW_CHAT_PATH = '/app'

const delay = (ms: number): Promise<void> => new Promise((resolve) => {
  window.setTimeout(resolve, ms)
})

function isElementVisible(element: HTMLElement): boolean {
  let currentElement: HTMLElement | null = element

  while (currentElement) {
    if (currentElement.hidden || currentElement.getAttribute('aria-hidden') === 'true') {
      return false
    }

    const styles = window.getComputedStyle(currentElement)
    if (styles.display === 'none' || styles.visibility === 'hidden') {
      return false
    }

    currentElement = currentElement.parentElement
  }

  return true
}

function findVisibleElement(selectors: readonly string[]): HTMLElement | null {
  for (const selector of selectors) {
    const element = Array.from(document.querySelectorAll<HTMLElement>(selector))
      .find(isElementVisible)
    if (element) {
      return element
    }
  }

  return null
}

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
      // Collapsed SideNav uses a compact gem-icon-button entry.
      'bard-sidenav.collapsed gem-icon-button > a[aria-label="New chat"][href="/app"]',

      // Primary selector (based on Gemini DOM structure)
      'side-navigation-v2 side-nav-action-button[data-test-id="new-chat-button"] a[aria-label="New chat"]',
      
      // Alternative selectors
      'a[aria-label="New chat"]',
      'side-nav-action-button[data-test-id="new-chat-button"] a',
      '[data-test-id="new-chat-button"]',
      
      // Generic fallbacks
      'button[aria-label*="New"]',
    ]
    
    const button = findVisibleElement(selectors)
    
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
 * Open a new chat by moving Gemini to the blank /app route.
 * Use this as a fallback when Gemini's native button is unavailable.
 */
export const openNewChatByRoute = async (): Promise<boolean> => {
  try {
    const beforeSummary = getChatSummary()
    const beforeCount = beforeSummary.messageCount

    if (window.location.pathname !== NEW_CHAT_PATH) {
      window.history.pushState({}, '', NEW_CHAT_PATH)
      window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }))
      window.dispatchEvent(new CustomEvent(GEM_EXT_EVENTS.URL_CHANGE, {
        detail: {
          url: window.location.href,
          timestamp: Date.now(),
        },
      }))
    }

    const success = await waitForNewChatReady(beforeCount)
    if (success) {
      return true
    }

    return false
  } catch (error) {
    console.error('[Shortcut] Failed to open new chat by route:', error)
    return false
  }
}

/**
 * Open a new chat with Gemini's native UI first, then fall back to route change.
 */
export const openNewChat = async (): Promise<boolean> => {
  const clicked = await createNewChatByClick()
  if (clicked) {
    return true
  }

  return openNewChatByRoute()
}

function clickTemporaryChatButton(): boolean {
  const temporaryChatButton = findVisibleElement([
    'temp-chat-button > gem-icon-button',
    'temp-chat-button gem-icon-button',
    'temp-chat-button button',
  ])

  if (!temporaryChatButton) {
    console.error('[Shortcut] Temporary chat button not found')
    return false
  }

  temporaryChatButton.click()
  return true
}

/**
 * Open a new temporary chat from Gemini's page controls.
 */
export const openTemporaryChatByClick = async (): Promise<boolean> => {
  // The temporary chat control is already available on Gemini's blank chat page.
  // Avoid waiting for a redundant new-chat transition in this common shortcut path.
  if (window.location.pathname === NEW_CHAT_PATH) {
    return clickTemporaryChatButton()
  }

  const newChatReady = await openNewChat()
  if (!newChatReady) {
    return false
  }

  await delay(500)
  return clickTemporaryChatButton()
}

function openSideNavEntry(selectors: readonly string[], label: string): boolean {
  const entry = findVisibleElement(selectors)
  if (entry) {
    entry.click()
    return true
  }

  console.error(`[Shortcut] ${label} side navigation entry not found`)
  return false
}

/**
 * Open Gemini's native Library page from the side navigation.
 */
export const openLibrary = (): boolean => openSideNavEntry([
  'bard-sidenav [data-test-id="my-stuff-side-nav-entry-button"] a[href="library"]',
  'bard-sidenav [data-test-id="my-stuff-side-nav-entry-button"] a[aria-label="Library"]',
  'bard-sidenav a[href="/library"]',
  'bard-sidenav a[href="library"]',
], 'Library')

/**
 * Open Gemini's native Gems page from the side navigation.
 */
export const openGems = (): boolean => openSideNavEntry([
  'bard-sidenav [data-test-id="gems-side-nav-entry-button"] a[href="/gems/view"]',
  'bard-sidenav [data-test-id="gems-side-nav-entry-button"] a[aria-label="Gems"]',
  'bard-sidenav a[href="/gems/view"]',
], 'Gems')

/**
 * Toggle Gemini's sidebar by clicking the visible native control.
 */
export const toggleSidebar = (): boolean => {
  const closeButton = document.querySelector<HTMLElement>('bard-sidenav button.close-sidenav-button')
  if (closeButton) {
    closeButton.click()
    return true
  }

  const openButton = document.querySelector<HTMLElement>('side-nav-sparkle-button > button')
  if (openButton) {
    openButton.click()
    return true
  }

  console.error('[Shortcut] Sidebar toggle button not found')
  return false
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
