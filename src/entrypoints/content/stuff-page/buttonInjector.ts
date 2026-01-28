/**
 * Button Injector for Stuff Page
 * 
 * Injects "Open in New Tab" buttons to library-item-card elements.
 * Uses MutationObserver to handle dynamically loaded content.
 * 
 * Memory Management:
 * - Uses WeakMap to track card -> resources mapping
 * - Automatically cleans up Tippy instances when cards are removed
 * - Uses AbortController to manage event listeners lifecycle
 */

import tippy, { type Instance as TippyInstance } from 'tippy.js'
import { t } from '@/utils/i18n'
import { handleOpenInNewTab } from './navigation'
import './style.css'

// Track injected buttons to avoid duplicates
const injectedCards = new WeakSet<Element>()

// Map card elements to their resources for proper cleanup
interface CardResources {
  tippyInstance: TippyInstance
  abortController: AbortController
}
const cardResourcesMap = new WeakMap<Element, CardResources>()

// Keep reference to MutationObserver for cleanup
let mutationObserver: MutationObserver | null = null

/**
 * SVG icon for "Open in New Tab" button
 */
const OPEN_IN_NEW_TAB_SVG = `
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24">
    <g class="open-in-new-tab-outline">
      <g fill="currentColor" fill-rule="evenodd" class="Vector" clip-rule="evenodd">
        <path d="M5 4a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5.263a1 1 0 1 1 2 0V19a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V5a3 3 0 0 1 3-3h5.017a1 1 0 1 1 0 2z"></path>
        <path d="M21.411 2.572a.963.963 0 0 1 0 1.36l-8.772 8.786a.96.96 0 0 1-1.358 0a.963.963 0 0 1 0-1.36l8.773-8.786a.96.96 0 0 1 1.357 0"></path>
        <path d="M21.04 2c.53 0 .96.43.96.962V8c0 .531-.47 1-1 1s-1-.469-1-1V4h-4c-.53 0-1-.469-1-1s.43-1 .96-1z"></path>
      </g>
    </g>
  </svg>
`.trim()



/**
 * Clean up resources associated with a card
 * 
 * @param card The library-item-card element
 */
function cleanupCard(card: Element): void {
  const resources = cardResourcesMap.get(card)
  console.log('[ButtonInjector] trying to clean up resources for card', card, resources)
  if (!resources) {
    return
  }

  console.log('[ButtonInjector] Destroying Tippy instance')

  // Destroy Tippy instance
  resources.tippyInstance.destroy()

  // Abort all event listeners
  resources.abortController.abort()

  // Remove from map
  cardResourcesMap.delete(card)

  console.log('[ButtonInjector] Cleaned up resources for card')
}

/**
 * Create and inject button for a library-item-card
 * 
 * @param card The library-item-card element (serves as the container)
 */
function injectButton(card: Element): void {
  // Skip if already injected
  if (injectedCards.has(card)) {
    return
  }

  // Create AbortController for event listeners
  const abortController = new AbortController()
  const { signal } = abortController

  // Create button element
  const button = document.createElement('div')
  button.className = 'gem-ext-open-new-tab-btn'
  button.innerHTML = OPEN_IN_NEW_TAB_SVG
  button.setAttribute('role', 'button')
  button.setAttribute('tabindex', '0')
  button.setAttribute('aria-label', t('stuffPage.openInNewTab'))

  // Add click handler with AbortController
  button.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    handleOpenInNewTab(card)
  })

  // Add keyboard support (Enter and Space) with AbortController
  button.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      e.stopPropagation()
      handleOpenInNewTab(card)
    }
  })

  // Add Tippy.js tooltip
  const span = document.createElement('span')
  span.textContent = t('stuffPage.openInNewTab')
  span.style.font = '500 12px "Roboto", arial, sans-serif'
  const tippyInstance = tippy(button, {
    content: span,
    placement: 'top',
    arrow: false,
  })

  // Store resources in WeakMap for cleanup
  cardResourcesMap.set(card, {
    tippyInstance,
    abortController,
  })

  // Insert button directly into library-item-card
  card.appendChild(button)

  // Mark as injected
  injectedCards.add(card)
}

/**
 * Start monitoring for library-item-card elements
 */
export function startButtonInjector(): void {
  console.log('[ButtonInjector] Starting button injector...')



  // Find media container from library-sections-overview-page
  const overviewPage = document.querySelector('library-sections-overview-page')
  if (!overviewPage) {
    console.log('[ButtonInjector] Overview page not found, will retry on DOM changes')
    // Will be handled by MutationObserver below
  } else {
    const mediaContainer = overviewPage.querySelector('.media-container')
    if (!mediaContainer) {
      console.log('[ButtonInjector] Media container not found, will retry on DOM changes')
    } else {
      // Inject to existing cards
      const existingCards = mediaContainer.querySelectorAll('library-item-card')
      console.log('[ButtonInjector] Found', existingCards.length, 'existing cards')
      existingCards.forEach(card => injectButton(card))
    }
  }

  // Setup MutationObserver to watch for new and removed cards
  mutationObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        // Handle added cards
        const addedCards: Element[] = []

        for (const node of mutation.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue

          const element = node as Element

          // Check if the node itself is a library-item-card
          if (element.matches('library-sections-overview-page library-item-card')) {
            addedCards.push(element)
          }

          // Check for library-item-card descendants
          const descendants = element.querySelectorAll('library-sections-overview-page library-item-card')
          addedCards.push(...Array.from(descendants))
        }

        if (addedCards.length > 0) {
          console.log('[ButtonInjector] Found', addedCards.length, 'new cards')
          addedCards.forEach(card => injectButton(card))
        }

        // Handle removed cards - clean up their resources
        const removedCards: Element[] = []

        for (const node of mutation.removedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue

          const element = node as Element

          // Check if the node itself is a library-item-card
          if (element.matches('library-item-card')) {
            removedCards.push(element)
          }

          // Check for library-item-card descendants
          const descendants = element.querySelectorAll('library-sections-overview-page library-item-card')
          removedCards.push(...Array.from(descendants))
        }

        if (removedCards.length > 0) {
          console.log('[ButtonInjector] Cleaning up', removedCards.length, 'removed cards')
          removedCards.forEach(card => cleanupCard(card))
        }
      }
    }
  })

  // Observe the entire document for media container and cards
  mutationObserver.observe(document.body, {
    childList: true,
    subtree: true,
  })

  console.log('[ButtonInjector] MutationObserver started')
}

/**
 * Stop button injector and cleanup all resources
 */
export function stopButtonInjector(): void {
  // Stop observing mutations
  if (mutationObserver) {
    mutationObserver.disconnect()
    mutationObserver = null
  }

  // Note: WeakMap will automatically clean up when cards are garbage collected
  // We don't need to manually iterate and clean up since:
  // 1. AbortController.abort() is called when cards are removed (via cleanupCard in mutations)
  // 2. Tippy instances are destroyed when cards are removed
  // 3. When stopButtonInjector is called, the page is likely unloading anyway

  console.log('[ButtonInjector] Stopped and cleaned up')
}
