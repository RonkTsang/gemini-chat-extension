import { startFirefoxBackground } from './firefox'
import { startResponseCompleteNotificationBackground } from './responseCompleteNotification'

const includeBrowsers = import.meta.env.COMMAND === 'serve'
  ? [import.meta.env.BROWSER]
  : ['chrome', 'firefox']

export default defineBackground({
  include: includeBrowsers,
  persistent: import.meta.env.FIREFOX,
  main() {
    startResponseCompleteNotificationBackground()

    if (import.meta.env.FIREFOX) {
      startFirefoxBackground()
    }
  },
})
