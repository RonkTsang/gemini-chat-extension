import {
  GREETING_BASE_CONTENT_WIDTH,
  GREETING_FALLBACK_HEIGHT,
  GREETING_FALLBACK_WIDTH,
  GREETING_HEADER_HEIGHT,
  GREETING_TITLE_SELECTOR,
  GREETING_VERTICAL_OFFSET,
  SIDENAV_SELECTOR,
  type RectLike,
} from './types'

function getSidenavWidth(): number {
  if (typeof document === 'undefined') return 0
  const sideNav = document.querySelector(SIDENAV_SELECTOR) as HTMLElement | null
  if (!sideNav) return 0
  return sideNav.getBoundingClientRect().width
}

export function hasGreetingTitleElement(): boolean {
  if (typeof document === 'undefined') return false
  return Boolean(document.querySelector(GREETING_TITLE_SELECTOR))
}

export function getWelcomeGreetingRect(): RectLike {
  if (typeof document !== 'undefined') {
    const greetingTitle = document.querySelector(
      GREETING_TITLE_SELECTOR,
    ) as HTMLElement | null
    if (greetingTitle) {
      const rect = greetingTitle.getBoundingClientRect()
      return {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      }
    }
  }

  const viewportWidth = typeof window === 'undefined' ? 1366 : window.innerWidth
  const viewportHeight = typeof window === 'undefined' ? 768 : window.innerHeight
  const sideNavWidth = getSidenavWidth()

  return {
    width: GREETING_FALLBACK_WIDTH,
    height: GREETING_FALLBACK_HEIGHT,
    left:
      (viewportWidth - sideNavWidth - GREETING_BASE_CONTENT_WIDTH) / 2 + sideNavWidth,
    top:
      (viewportHeight - GREETING_HEADER_HEIGHT) / 2
      - GREETING_FALLBACK_HEIGHT * 2
      - GREETING_VERTICAL_OFFSET
      + GREETING_HEADER_HEIGHT,
  }
}
