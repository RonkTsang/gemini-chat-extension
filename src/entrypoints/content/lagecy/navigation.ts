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
const MIN_RETARGET_DISTANCE_PX = 16

interface JumpTarget {
  id: number
  query: HTMLElement
  boundary?: 'top' | 'bottom'
  top: number
  scrollHeight: number
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
  let jumpId = 0
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
    const scrollHeight = scroller.scrollHeight
    const id = ++jumpId
    logDevEvent('info', '[ChatOutline]', 'jump', () => ({
      jumpId: id, step, fromIndex: index, targetIndex: queries.indexOf(destination.query),
      boundary: destination.boundary, from: scroller?.scrollTop,
      targetTop: top, scrollHeight, promptCount: queries.length,
    }))
    scrollOutlineTo(scroller, top)
    // Fast clicks advance from the destination, including prompts that share a clamped offset.
    jumpTarget = {
      ...destination,
      id,
      top,
      scrollHeight,
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
      if (scroller && jumpTarget?.inProgress && scroller.scrollHeight !== jumpTarget.scrollHeight) {
        reconcileJump('scroll')
      }
      updateButtons()
    })
  }

  function reconcileJump(trigger: 'scroll' | 'scrollend' | 'history-prepended'): void {
    const target = jumpTarget
    if (!scroller || !target || !queries.includes(target.query)) return

    const stillScrolling = target.inProgress && trigger !== 'scrollend'
    const scrollHeight = scroller.scrollHeight
    target.scrollHeight = scrollHeight
    const requestedTop = target.top
    const measuredTop = getDestinationTop(scroller, target)
    const scrollTop = scroller.scrollTop
    const aligned = matchesScrollTop(scrollTop, measuredTop)
    const targetMoved = Math.abs(measuredTop - requestedTop) > (stillScrolling ? MIN_RETARGET_DISTANCE_PX : 1)
    // Reserve one correction for changes that appear when the animation finishes.
    const limit = stillScrolling ? MAX_REALIGNMENTS - 1 : MAX_REALIGNMENTS
    const realign = targetMoved && (!aligned || stillScrolling) && target.realignments < limit
    if (stillScrolling && !realign) return

    logDevEvent('info', '[ChatOutline]', realign ? 'realign' : 'settled', () => ({
      jumpId: target.id, trigger, targetIndex: queries.indexOf(target.query), boundary: target.boundary,
      requestedTop, measuredTop, scrollTop, scrollHeight,
      promptCount: queries.length, realignments: target.realignments,
    }))

    target.top = measuredTop
    target.inProgress = false
    if (realign) {
      target.realignments++
      // If already aligned, stop the obsolete animation before it scrolls past the prompt.
      scrollOutlineTo(scroller, measuredTop, aligned ? 'instant' : undefined)
      const afterScrollTop = scroller.scrollTop
      target.inProgress = !matchesScrollTop(afterScrollTop, measuredTop)
      logDevEvent('info', '[ChatOutline]', 'realign-applied', () => ({
        jumpId: target.id, trigger, realignments: target.realignments,
        beforeScrollTop: scrollTop, afterScrollTop, appliedDeltaPx: afterScrollTop - scrollTop,
      }))
    }
  }

  function onScrollEnd(event: Event): void {
    if (event.target !== scroller || !jumpTarget) return
    reconcileJump('scrollend')
    updateButtons()
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
        jumpId: jumpTarget?.id, jumpInProgress: jumpTarget?.inProgress,
        before: previousQueries.length, after: queries.length,
        firstPromptShift, scrollTop: scroller?.scrollTop, scrollHeight: scroller?.scrollHeight,
      }))
      if (firstPromptShift > 0) {
        reconcileJump('history-prepended')
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
      previous.remove()
      next.remove()
    },
  }
}
