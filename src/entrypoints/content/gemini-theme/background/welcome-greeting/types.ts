export type WelcomeGreetingReadabilityMode = 'default' | 'auto' | 'force-light'
export type WelcomeGreetingResolved = 'default' | 'force-light'

export interface RectLike {
  left: number
  top: number
  width: number
  height: number
}

export interface WelcomeGreetingEstimateInput {
  imageBlob: Blob
  imageWidth?: number
  imageHeight?: number
  viewportWidth: number
  viewportHeight: number
  targetRect: RectLike
}

export interface WelcomeGreetingEstimateResult {
  resolved: WelcomeGreetingResolved
  luminance: number
  contrastWhite: number
  contrastDark: number
}

export const GREETING_TITLE_SELECTOR = 'greeting div.greeting-title'
export const GREETING_TARGET_SELECTOR
  = 'div.top-section-container.visible-primary-message'
export const SIDENAV_SELECTOR = 'bard-sidenav-container > bard-sidenav'

export const GREETING_FALLBACK_WIDTH = 350
export const GREETING_FALLBACK_HEIGHT = 80
export const GREETING_BASE_CONTENT_WIDTH = 760
export const GREETING_HEADER_HEIGHT = 48
export const GREETING_VERTICAL_OFFSET = 24

export const GREETING_SAMPLING_CANVAS_WIDTH = 48
export const GREETING_SAMPLING_CANVAS_HEIGHT = 24
export const GREETING_DARK_TEXT_LUMINANCE = 0.014444
export const GREETING_SWITCH_THRESHOLD = 0.4
