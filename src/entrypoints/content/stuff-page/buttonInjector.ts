/**
 * Button Injector for Stuff Page
 * 
 * Injects "Open in New Tab" buttons to library-item-card elements.
 * Uses MutationObserver to handle dynamically loaded content.
 * 
 * - Uses WeakSet to track card injection state
 */

import { resolveOpenInNewTabUrl } from './navigation'
import { createOpenInNewTabButton } from './openInNewTabButton'
import './style.css'

// Track injected buttons to avoid duplicates
let injectedCards = new WeakSet<Element>()

// Keep reference to MutationObserver for cleanup
let mutationObserver: MutationObserver | null = null

function injectButton(card: Element, url: string): void {
  if (injectedCards.has(card)) return
  card.appendChild(createOpenInNewTabButton(url))
  injectedCards.add(card)
}

/**
 * Inject a button only when the card has resolvable navigation data.
 */
export function tryInjectButton(card: Element): boolean {
  if (injectedCards.has(card)) {
    return false
  }

  if (card.querySelector('.gem-ext-open-new-tab-btn')) {
    injectedCards.add(card)
    return false
  }

  const url = resolveOpenInNewTabUrl(card)
  if (!url) {
    return false
  }

  injectButton(card, url)
  return true
}

/**
 * Reconcile currently rendered cards after media data arrives.
 */
export function reconcileOpenInNewTabButtons(): void {
  const cards = document.querySelectorAll('library-sections-overview-page library-item-card')
  let injectedCount = 0

  cards.forEach((card) => {
    if (tryInjectButton(card)) {
      injectedCount++
    }
  })

  if (injectedCount > 0) {
    console.log('[ButtonInjector] Reconciled open-in-new-tab buttons:', injectedCount)
  }
}

/**
 * Start monitoring for library-item-card elements
 */
export function startButtonInjector(): void {
  console.log('[ButtonInjector] Starting button injector...')

  reconcileOpenInNewTabButtons()

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
          addedCards.forEach(card => tryInjectButton(card))
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
  injectedCards = new WeakSet<Element>()

  // Note: WeakSet (injectedCards) will automatically clean up when cards are garbage collected
  // DOM elements and event listeners are cleaned up when cards are removed from the DOM.
  console.log('[ButtonInjector] Stopped and cleaned up')
}
