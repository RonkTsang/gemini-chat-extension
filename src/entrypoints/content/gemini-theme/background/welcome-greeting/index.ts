export {
  applyWelcomeGreetingReadabilityFromState,
  clearWelcomeGreetingReadabilityStyle,
  resolveWelcomeGreetingReadabilitySettings,
  __resetWelcomeGreetingReadabilityServiceForTests,
} from './service'

export {
  decideWelcomeGreetingResolved,
  estimateWelcomeGreetingReadability,
  mapViewportRectToSourceRect,
} from './estimator'

export {
  getWelcomeGreetingRect,
  hasGreetingTitleElement,
} from './rect'

export type {
  RectLike,
  WelcomeGreetingEstimateInput,
  WelcomeGreetingEstimateResult,
  WelcomeGreetingReadabilityMode,
  WelcomeGreetingResolved,
} from './types'
