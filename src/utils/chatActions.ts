/**
 * Chat action utilities for Gemini page navigation and Chain Prompt execution.
 */

import { hasChatHistory, getChatSummary, getDefaultChatWindow } from './messageUtils'

const NEW_CHAT_PATH = '/app'
const NEW_CHAT_ROUTE_TIMEOUT_MS = 1000
const NEW_CHAT_ROUTE_POLL_INTERVAL_MS = 50

const NEW_CHAT_SELECTORS = [
  // Any one of these independent contracts identifies New chat in SideNav.
  'bard-sidenav a[href="/app"]',
  'bard-sidenav a[aria-label="New chat"]',
  'bard-sidenav gem-nav-list-item[data-test-id="new-chat-button"] > a',

  // Fallback for the compact top-level entry.
  'side-nav-sparkle-button > a[aria-label="New chat"]',

  // Gemini can move the same controls outside of the SideNav container.
  'a[aria-label="New chat"]',
  'gem-nav-list-item[data-test-id="new-chat-button"] > a',
] as const

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

function findFirstElement(selectors: readonly string[]): HTMLElement | null {
  for (const selector of selectors) {
    const element = document.querySelector<HTMLElement>(selector)
    if (element) {
      return element
    }
  }

  return null
}

function findNewChatButton(): HTMLElement | null {
  // Chain Prompt may invoke this while its confirmation dialog marks Gemini's
  // app root aria-hidden. New Chat is an explicit native target, so do not
  // reject it based on visibility state inherited from that dialog.
  return findFirstElement(NEW_CHAT_SELECTORS)
}

function isNewChatRoute(): boolean {
  return window.location.pathname === NEW_CHAT_PATH
}

function waitForNewChatRoute(): Promise<boolean> {
  if (isNewChatRoute()) {
    return Promise.resolve(true)
  }

  return new Promise((resolve) => {
    let intervalId = 0
    let timeoutId = 0

    const finish = (navigated: boolean) => {
      window.clearInterval(intervalId)
      window.clearTimeout(timeoutId)
      resolve(navigated)
    }

    intervalId = window.setInterval(() => {
      if (isNewChatRoute()) {
        finish(true)
      }
    }, NEW_CHAT_ROUTE_POLL_INTERVAL_MS)

    timeoutId = window.setTimeout(() => {
      finish(isNewChatRoute())
    }, NEW_CHAT_ROUTE_TIMEOUT_MS)
  })
}

function navigateToNewChatViaSpa(): void {
  window.history.pushState({}, '', NEW_CHAT_PATH)
  window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }))
}

/**
 * Create a new chat for Chain Prompt, then wait until its editor is ready.
 * This intentionally avoids hard navigation because the Chain Prompt run must
 * continue in the existing content-script context.
 * @returns Promise<boolean> - true if successful, false otherwise
 */
export const createNewChatForChainPrompt = async (): Promise<boolean> => {
  try {
    // Get chat summary before creating new chat
    const beforeSummary = getChatSummary()
    const beforeCount = beforeSummary.messageCount
    
    const button = findNewChatButton()
    
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
 * Open a new Gemini chat through the native control when possible.
 * Falls back to a SPA route transition when the control is unavailable or does
 * not update the route promptly.
 */
export const openNewChat = async (): Promise<void> => {
  if (isNewChatRoute()) {
    return
  }

  const button = findNewChatButton()
  if (!button) {
    navigateToNewChatViaSpa()
    return
  }

  try {
    button.click()
    if (await waitForNewChatRoute()) {
      return
    }
  } catch (error) {
    console.warn('[Chat Action] Failed to click New chat:', error)
  }

  navigateToNewChatViaSpa()
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
  // Gemini's native control handles the transition from either an existing chat
  // or the blank chat page. Avoid an unnecessary New Chat transition first.
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
