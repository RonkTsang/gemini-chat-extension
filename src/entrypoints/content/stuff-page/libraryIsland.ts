import { LibraryMediaCache } from '@/utils/library/mediaCache'
import { extractGeminiAccountRoutePrefix } from '@/utils/geminiAccountRoute'
import type { LibraryMediaData } from '@/utils/library/mediaParser'
import { findIslandMediaImages, findInjectedIslandCards, inspectIslandRoot, resolveIslandImageHost } from './dom'
import { logLibraryTrace } from '@/utils/library/logger'
import { createOpenInNewTabButton } from './openInNewTabButton'
import './style.css'

const mediaCache = new LibraryMediaCache()
let activeRoot: Element | null = null
let observer: MutationObserver | null = null
let scheduled = false
let lastReconciliation = ''

export function receiveLibraryMediaData(data: LibraryMediaData): void {
  mediaCache.addItems(data.items, data.timestamp)
  logLibraryTrace('content:index-updated', () => ({ received: data.items.length,
    timestamp: data.timestamp, rootConnected: activeRoot?.isConnected ?? false, ...mediaCache.getStats() }))
  reconcileIslandButtons()
}

export function reconcileIslandButtons(): void {
  if (!activeRoot?.isConnected) return
  const counts = import.meta.env.DEV ? { images: 0, cards: 0, missingHost: 0, emptyIndex: 0, noUrlMatch: 0,
    ambiguous: 0, inserted: 0, updated: 0, existing: 0, removed: 0 } : null
  const samples: Array<Record<string, unknown>> | null = import.meta.env.DEV ? [] : null
  const targets = new Map<Element, string>()
  const ambiguousHosts = new Set<Element>()
  for (const image of findIslandMediaImages(activeRoot)) {
    if (counts) counts.images++
    const match = mediaCache.matchImageSource(image.src)
    const item = match.item
    if (!item) {
      if (counts) {
        if (match.reason === 'empty-index') counts.emptyIndex++
        else if (match.reason === 'ambiguous') counts.ambiguous++
        else counts.noUrlMatch++
        if (samples && samples.length < 3) {
          samples.push({ image: counts.images - 1,
            match: match.reason, candidates: match.candidateCount,
            srcPrefix: image.src.slice(0, 80), srcLength: image.src.length })
        }
      }
      continue
    }
    const host = resolveIslandImageHost(image, activeRoot)
    if (!host) {
      if (counts) counts.missingHost++
      continue
    }
    const conversationId = item.conversationId.slice(2)
    const requestId = item.requestId.slice(2)
    const accountRoutePrefix = extractGeminiAccountRoutePrefix(window.location.pathname)
    const url = new URL(`${accountRoutePrefix}/app/${conversationId}#${requestId}`, window.location.origin).href
    const previous = targets.get(host)
    if (previous && previous !== url) ambiguousHosts.add(host)
    targets.set(host, url)
  }
  for (const host of ambiguousHosts) targets.delete(host)
  if (counts) {
    counts.ambiguous += ambiguousHosts.size
    counts.cards = targets.size
  }

  for (const card of findInjectedIslandCards(activeRoot)) {
    if (targets.has(card)) continue
    const button = card.querySelector(':scope > .gem-ext-open-new-tab-btn')
    if (counts && button) counts.removed++
    button?.remove()
    card.classList.remove('gem-ext-library-island-card')
  }
  for (const [card, url] of targets) {
    const button = card.querySelector<HTMLElement>(':scope > .gem-ext-open-new-tab-btn')
    card.classList.add('gem-ext-library-island-card')
    if (button) {
      if (counts) {
        if (button.dataset.openUrl === url) counts.existing++
        else counts.updated++
      }
      button.dataset.openUrl = url
    } else {
      if (counts) counts.inserted++
      card.appendChild(createOpenInNewTabButton(url))
    }
  }
  if (import.meta.env.DEV && counts && samples) {
    const summary = JSON.stringify({ ...counts, samples })
    if (summary !== lastReconciliation) {
      lastReconciliation = summary
      const root = activeRoot
      logLibraryTrace('content:reconciled', () => ({ ...counts, samples,
        index: mediaCache.getStats(), root: inspectIslandRoot(root) }))
    }
  }
}

export function startIslandButtonInjector(root: Element): void {
  stopIslandButtonInjector()
  activeRoot = root
  lastReconciliation = ''
  logLibraryTrace('content:injector-start', () => ({ rootConnected: root.isConnected }))
  observer = new MutationObserver((mutations) => {
    const nativeChange = mutations.some((mutation) => {
      if (mutation.type === 'attributes') return true
      return [...mutation.addedNodes, ...mutation.removedNodes].some((node) => {
        return !(node instanceof Element && node.classList.contains('gem-ext-open-new-tab-btn'))
      })
    })
    if (!nativeChange || scheduled) return
    scheduled = true
    queueMicrotask(() => {
      scheduled = false
      reconcileIslandButtons()
    })
  })
  observer.observe(root, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['src'],
  })
  reconcileIslandButtons()
}

export function stopIslandButtonInjector(): void {
  observer?.disconnect()
  observer = null
  if (activeRoot) {
    for (const card of findInjectedIslandCards(activeRoot)) {
      card.querySelector(':scope > .gem-ext-open-new-tab-btn')?.remove()
      card.classList.remove('gem-ext-library-island-card')
    }
  }
  activeRoot = null
}

export function clearLibraryMediaCache(): void {
  mediaCache.clear()
}
