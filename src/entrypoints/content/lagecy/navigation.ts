import { i18nCache } from '@/utils/i18nCache'
import { logDevEvent } from '@/utils/devLogger'
import {
  findCurrentOutlineQuery,
  getOutlineQueryScrollTop,
  getOutlineScrollEnd,
  readOutlineQueries,
  resolveOutlineScroller,
  scrollOutlineTo,
} from './dom'

const MAX_REALIGNMENTS = 3

interface JumpTarget {
  query: HTMLElement
  boundary?: 'top' | 'bottom'
  top: number
  inProgress: boolean
  realignments: number
}

function getDestinationTop(scroller: HTMLElement, target: Pick<JumpTarget, 'query' | 'boundary'>): number {
  if (target.boundary === 'top') return 0
  if (target.boundary === 'bottom') return getOutlineScrollEnd(scroller)
  return getOutlineQueryScrollTop(scroller, target.query)
}

function matchesScrollTop(position: number, target: number): boolean {
  return Math.abs(position - target) <= 1
}

function createJumpButton(arrow: string): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'gemini-toc-jump-button'
  button.textContent = arrow
  return button
}

function setJumpButtonLabel(button: HTMLButtonElement, labelKey: string): void {
  const label = i18nCache.get(labelKey)
  if (button.title === label) return
  button.title = label
  button.setAttribute('aria-label', label)
}

export function createOutlineNavigation(chatWindow: HTMLElement, controls: HTMLElement): {
  refresh: () => void
  destroy: () => void
} {
  const previous = createJumpButton('↑')
  const next = createJumpButton('↓')
  controls.append(previous, next)

  let scroller: HTMLElement | undefined
  let queries: HTMLElement[] = []
  let jumpTarget: JumpTarget | undefined
  let frame: number | undefined

  function currentIndex(): number {
    if (!scroller) return 0
    if (jumpTarget) {
      const index = queries.indexOf(jumpTarget.query)
      if (index !== -1) {
        if (jumpTarget.inProgress || matchesScrollTop(scroller.scrollTop, jumpTarget.top)) return index

        // Gemini's scroll anchoring can move both the prompt and the scroll position together.
        const top = getDestinationTop(scroller, jumpTarget)
        if (matchesScrollTop(scroller.scrollTop, top)) {
          jumpTarget.top = top
          return index
        }
      }
    }
    jumpTarget = undefined
    return findCurrentOutlineQuery(scroller, queries)
  }

  function updateButtons(): void {
    previous.hidden = next.hidden = queries.length === 0
    const index = currentIndex()
    setJumpButtonLabel(previous, index === 0 ? 'chatOutlineScrollToTop' : 'chatOutlinePreviousPrompt')
    setJumpButtonLabel(next, index >= queries.length - 1 ? 'chatOutlineScrollToBottom' : 'chatOutlineNextPrompt')
  }

  function jump(event: MouseEvent, step: -1 | 1): void {
    event.stopPropagation()
    if (!scroller || queries.length === 0) return
    const index = currentIndex()
    const neighbor = queries[index + step]
    const destination: Pick<JumpTarget, 'query' | 'boundary'> = {
      query: neighbor ?? queries[index],
      boundary: neighbor ? undefined : step === -1 ? 'top' : 'bottom',
    }
    const top = getDestinationTop(scroller, destination)
    logDevEvent('info', '[ChatOutline]', 'jump', () => ({
      step, fromIndex: index, targetIndex: queries.indexOf(destination.query),
      boundary: destination.boundary, from: scroller?.scrollTop,
      targetTop: top, scrollHeight: scroller?.scrollHeight, promptCount: queries.length,
    }))
    scrollOutlineTo(scroller, top)
    // Fast clicks advance from the destination, including prompts that share a clamped offset.
    jumpTarget = {
      ...destination,
      top,
      inProgress: !matchesScrollTop(scroller.scrollTop, top),
      realignments: 0,
    }
    updateButtons()
  }

  previous.onclick = (event) => jump(event, -1)
  next.onclick = (event) => jump(event, 1)

  function onScroll(event: Event): void {
    if (event.target !== scroller || frame !== undefined) return
    frame = requestAnimationFrame(() => {
      frame = undefined
      updateButtons()
    })
  }

  function settleJump(): void {
    const target = jumpTarget
    if (!scroller || !target || !queries.includes(target.query)) return

    const scrollTop = scroller.scrollTop
    const requestedTop = target.top
    const measuredTop = getDestinationTop(scroller, target)
    const targetMoved = !matchesScrollTop(measuredTop, requestedTop)
    const realign = targetMoved && !matchesScrollTop(scrollTop, measuredTop)
      && target.realignments < MAX_REALIGNMENTS

    logDevEvent('info', '[ChatOutline]', realign ? 'realign' : 'settled', () => ({
      targetIndex: queries.indexOf(target.query), boundary: target.boundary,
      requestedTop, measuredTop, scrollTop, scrollHeight: scroller?.scrollHeight,
      promptCount: queries.length, realignments: target.realignments,
    }))

    target.top = measuredTop
    target.inProgress = false
    if (realign) {
      target.realignments++
      // Offscreen Gemini turns can expand from estimated heights during a smooth scroll.
      scrollOutlineTo(scroller, measuredTop, 'instant')
      target.inProgress = !matchesScrollTop(scroller.scrollTop, measuredTop)
    }
    updateButtons()
  }

  function onScrollEnd(event: Event): void {
    if (event.target === scroller) settleJump()
  }

  function onScrollInput(event: Event): void {
    if (event.target instanceof Node && !controls.contains(event.target)) {
      jumpTarget = undefined
    }
  }

  chatWindow.addEventListener('scroll', onScroll, { capture: true, passive: true })
  chatWindow.addEventListener('scrollend', onScrollEnd, true)
  chatWindow.addEventListener('wheel', onScrollInput, { capture: true, passive: true })
  chatWindow.addEventListener('pointerdown', onScrollInput, true)

  function refresh(): void {
    const nextScroller = resolveOutlineScroller(chatWindow)
    if (scroller !== nextScroller) jumpTarget = undefined
    const previousQueries = queries
    scroller = nextScroller
    queries = scroller ? readOutlineQueries(scroller) : []
    const firstPromptShift = previousQueries.length ? queries.indexOf(previousQueries[0]) : 0
    if (previousQueries.length !== queries.length || firstPromptShift !== 0) {
      logDevEvent('info', '[ChatOutline]', 'history-changed', () => ({
        before: previousQueries.length, after: queries.length,
        firstPromptShift, scrollTop: scroller?.scrollTop, scrollHeight: scroller?.scrollHeight,
      }))
      if (firstPromptShift > 0 && jumpTarget && !jumpTarget.inProgress && queries.includes(jumpTarget.query)) {
        settleJump()
        return
      }
    }
    updateButtons()
  }

  refresh()
  return {
    refresh,
    destroy() {
      chatWindow.removeEventListener('scroll', onScroll, true)
      chatWindow.removeEventListener('scrollend', onScrollEnd, true)
      chatWindow.removeEventListener('wheel', onScrollInput, true)
      chatWindow.removeEventListener('pointerdown', onScrollInput, true)
      if (frame !== undefined) cancelAnimationFrame(frame)
    },
  }
}
