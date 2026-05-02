import { startFirefoxBackground } from './firefox'

export default defineBackground({
  // Note: We intentionally do not support other browsers in the background script for now, as the background script is primarily responsible for managing the theme background assets and settings, which are only used in Firefox. Supporting other browsers would add unnecessary complexity and maintenance overhead without providing any user-facing benefits at this time.
  // In dev mode, we need to delete this line of code
  include: ['firefox'],
  persistent: true,
  main() {
    startFirefoxBackground()
  },
})
