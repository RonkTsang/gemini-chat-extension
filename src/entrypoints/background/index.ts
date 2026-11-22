import { browser } from 'wxt/browser'
import { EXTERNAL_LINKS } from '@/common/config'
import { startFirefoxBackground } from './firefox'
import { startResponseCompleteNotificationBackground } from './responseCompleteNotification'

const includeBrowsers = import.meta.env.COMMAND === 'serve'
  ? [import.meta.env.BROWSER]
  : ['chrome', 'firefox']

export default defineBackground({
  include: includeBrowsers,
  persistent: import.meta.env.FIREFOX,
  main() {
    browser.runtime.onInstalled.addListener(({ reason }) => {
      if (reason !== 'install' && reason !== 'update') return

      void browser.runtime.setUninstallURL(EXTERNAL_LINKS.UNINSTALL_SURVEY).catch((error) => {
        console.warn('[Background] Failed to register uninstall survey:', error)
      })
    })

    startResponseCompleteNotificationBackground()

    if (import.meta.env.FIREFOX) {
      startFirefoxBackground()
    }
  },
})
