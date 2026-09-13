import { startFirefoxBackground } from './firefox'
import { startResponseCompleteNotificationBackground } from './responseCompleteNotification'
import { startFolderDeviceIdProvider } from './folderDeviceId'
import { startFoldersBackground } from './folders'
import { installFolderSyncDebugGlobal } from '@/services/folder-sync/debug'

const includeBrowsers = import.meta.env.COMMAND === 'serve'
  ? [import.meta.env.BROWSER]
  : ['chrome', 'firefox']

export default defineBackground({
  include: includeBrowsers,
  persistent: import.meta.env.FIREFOX,
  main() {
    installFolderSyncDebugGlobal()
    startFolderDeviceIdProvider()
    startFoldersBackground()
    startResponseCompleteNotificationBackground()

    if (import.meta.env.FIREFOX) {
      startFirefoxBackground()
    }
  },
})
