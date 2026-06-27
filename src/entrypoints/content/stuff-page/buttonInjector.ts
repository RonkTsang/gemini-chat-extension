/**
 * Button Injector for Stuff Page
 * 
 * Injects "Open in New Tab" buttons to library-item-card elements.
 * Uses MutationObserver to handle dynamically loaded content.
 * 
 * - Uses WeakSet to track card injection state
 */

import { t } from '@/utils/i18n'
import { handleOpenInNewTab, resolveOpenInNewTabUrl } from './navigation'
import './style.css'

// Track injected buttons to avoid duplicates
let injectedCards = new WeakSet<Element>()

// Keep reference to MutationObserver for cleanup
let mutationObserver: MutationObserver | null = null

/**
 * SVG icon for "Open in New Tab" button
 */
function getOpenInNewTabSvg(): string {
  return `
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
}

/**
 * Create and inject button for a library-item-card
 * 
 * @param card The library-item-card element (serves as the container)
 * @param url The pre-resolved absolute navigation URL.
 */
function injectButton(card: Element, url: string): void {
  // Skip if already injected
  if (injectedCards.has(card)) {
    return
  }

  // Create button element
  const button = document.createElement('div')
  button.className = 'gem-ext-open-new-tab-btn'
  button.innerHTML = getOpenInNewTabSvg()
  button.setAttribute('role', 'button')
  button.setAttribute('tabindex', '0')
  button.setAttribute('aria-label', t('stuffPage.openInNewTab'))
  button.dataset.openUrl = url

  // Add click handler
  button.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    handleOpenInNewTab(url)
  })

  // Add keyboard support (Enter and Space)
  button.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      e.stopPropagation()
      handleOpenInNewTab(url)
    }
  })

  // Create Tooltip element
  const tooltip = document.createElement('div')
  tooltip.className = 'gem-ext-tooltip'
  tooltip.textContent = t('stuffPage.openInNewTab')
  button.appendChild(tooltip)

  // Insert button directly into library-item-card
  card.appendChild(button)

  // Mark as injected
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
