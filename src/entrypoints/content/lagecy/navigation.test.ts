import { afterEach, describe, expect, it, vi } from 'vitest'
import { createOutlineNavigation } from './navigation'

vi.mock('@/utils/i18nCache', () => ({
  i18nCache: { get: (key: string) => key },
}))
vi.mock('@/utils/devLogger', () => ({ logDevEvent: vi.fn() }))

afterEach(() => document.body.replaceChildren())

function setupNavigation(promptOffsets: number[], maxScrollTop = 800) {
  const chatWindow = document.createElement('chat-window')
  const history = document.createElement('div')
  history.id = 'chat-history'
  const scroller = document.createElement('infinite-scroller')
  scroller.dataset.testId = 'chat-history-container'
  scroller.style.scrollPaddingTop = '56px'
  Object.defineProperties(scroller, {
    clientHeight: { value: 500 },
    scrollHeight: { value: 500 + maxScrollTop },
  })
  const queries = promptOffsets.map((_, index) => {
    const query = document.createElement('user-query')
    query.getBoundingClientRect = () => new DOMRect(0, promptOffsets[index] - scroller.scrollTop, 100, 40)
    scroller.append(query)
    return query
  })
  const scrollTo = vi.spyOn(scroller, 'scrollTo').mockImplementation(() => {})
  const finishScrollAt = (top: number) => {
    scroller.scrollTop = top
    scroller.dispatchEvent(new Event('scrollend'))
  }
  history.append(scroller)
  const controls = document.createElement('div')
  chatWindow.append(history, controls)
  document.body.append(chatWindow)
  const navigation = createOutlineNavigation(chatWindow, controls)
  const [previous, next] = controls.querySelectorAll('button')
  return { queries, scroller, navigation, previous, next, scrollTo, finishScrollAt }
}

describe('Chat Outline prompt navigation', () => {
  it('animates to adjacent prompts and handles more clicks before the scroll ends', () => {
    const { scroller, navigation, previous, next, scrollTo } = setupNavigation([70, 350, 750])
    scroller.scrollTop = 550
    navigation.refresh()

    next.click()
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 694, behavior: 'smooth' })
    expect(next.getAttribute('aria-label')).toBe('chatOutlineScrollToBottom')
    previous.click()
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 294, behavior: 'smooth' })
    previous.click()
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 14, behavior: 'smooth' })
    expect(previous.getAttribute('aria-label')).toBe('chatOutlineScrollToTop')
    navigation.destroy()
  })

  it('keeps stepping through prompts that share the same clamped position at the bottom', () => {
    const { scroller, navigation, previous, next, scrollTo } = setupNavigation([70, 350, 500], 200)
    scroller.scrollTop = 200
    navigation.refresh()

    previous.click()
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 200, behavior: 'smooth' })
    expect(next.getAttribute('aria-label')).toBe('chatOutlineNextPrompt')
    previous.click()
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 14, behavior: 'smooth' })
    navigation.destroy()
  })

  it('realigns to the same prompt when offscreen turns expand during the animation', () => {
    const offsets = [70, 350, 750]
    const { scroller, navigation, previous, scrollTo, finishScrollAt } = setupNavigation(offsets, 1500)
    scroller.scrollTop = 800

    previous.click()
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 294, behavior: 'smooth' })
    offsets[1] = 650
    offsets[2] = 1050
    finishScrollAt(294)
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 594, behavior: 'instant' })
    finishScrollAt(594)

    previous.click()
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 14, behavior: 'smooth' })
    navigation.destroy()
  })

  it('keeps the selected prompt when earlier history is prepended after the animation', () => {
    const offsets = [70, 750]
    const { scroller, navigation, previous, scrollTo, finishScrollAt } = setupNavigation(offsets, 1600)
    scroller.scrollTop = 800
    previous.click()
    finishScrollAt(14)

    offsets[0] = 670
    offsets[1] = 1350
    const olderPrompt = document.createElement('user-query')
    olderPrompt.getBoundingClientRect = () => new DOMRect(0, 70 - scroller.scrollTop, 100, 40)
    scroller.prepend(olderPrompt)
    navigation.refresh()
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 614, behavior: 'instant' })
    finishScrollAt(614)

    previous.click()
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 14, behavior: 'smooth' })
    navigation.destroy()
  })

  it('scrolls to the actual top and bottom from the first and last responses', () => {
    const { scroller, navigation, previous, next, scrollTo, finishScrollAt } = setupNavigation([70, 350, 750])
    scroller.scrollTop = 150
    navigation.refresh()

    previous.click()
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 0, behavior: 'smooth' })
    finishScrollAt(760)
    expect(next.getAttribute('aria-label')).toBe('chatOutlineScrollToBottom')
    next.click()
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 800, behavior: 'smooth' })
    navigation.destroy()
  })

  it('offers both scroll boundaries for a single prompt and hides the arrows in an empty chat', () => {
    const { queries, navigation, previous, next } = setupNavigation([70, 350])
    queries[1].remove()
    navigation.refresh()

    expect(previous.hidden).toBe(false)
    expect(next.hidden).toBe(false)
    expect(previous.title).toBe('chatOutlineScrollToTop')
    expect(next.title).toBe('chatOutlineScrollToBottom')

    queries[0].remove()
    navigation.refresh()
    expect(previous.hidden).toBe(true)
    expect(next.hidden).toBe(true)
    navigation.destroy()
  })
})
