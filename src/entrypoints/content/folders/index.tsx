import { createRoot, type Root } from 'react-dom/client'

import { FolderSideNav } from '@/components/folders/FolderSideNav'
import { Provider } from '@/components/ui/provider-shadow-dom'
import { queryFirstMatchingElement, geminiDomSelectors } from '@/services/gemini-dom/selectors'
import { folderRuntime } from './runtime'
import { FolderNativeMenuBridge } from './native-menu'
import { FolderRecentsVisibilityController } from './recents-visibility'

const SIDE_NAV_HOST_ATTRIBUTE = 'data-gpk-folders-side-nav-host'

export interface FoldersController {
  start: () => Promise<void>
  stop: () => void
}

/**
 * Keeps the Gemini DOM bridge deliberately small: all data access remains in
 * FolderRuntime and the injected UI is isolated in its own Shadow DOM tree.
 */
export function createFoldersController(): FoldersController {
  let started = false
  let observer: MutationObserver | undefined
  let reactRoot: Root | undefined
  let host: HTMLElement | undefined
  let reconcileQueued = false
  const nativeMenuBridge = new FolderNativeMenuBridge()
  const recentsVisibility = new FolderRecentsVisibilityController()

  const unmount = () => {
    reactRoot?.unmount()
    reactRoot = undefined
    host?.remove()
    host = undefined
  }

  const reconcile = () => {
    reconcileQueued = false
    if (!started) return
    const sideNav = queryFirstMatchingElement([document], geminiDomSelectors.sideNav.root)
    const chatsSection = sideNav && queryFirstMatchingElement([sideNav], geminiDomSelectors.sideNav.chatsSection)
    if (!sideNav || !chatsSection || !chatsSection.parentElement) {
      unmount()
      return
    }
    if (host?.isConnected && host.nextSibling === chatsSection) return
    unmount()
    host = document.createElement('div')
    host.setAttribute(SIDE_NAV_HOST_ATTRIBUTE, '')
    chatsSection.parentElement.insertBefore(host, chatsSection)
    reactRoot = createRoot(host)
    reactRoot.render(
      <Provider host={{ style: { background: 'transparent' } }}>
        <FolderSideNav />
      </Provider>,
    )
  }

  const queueReconcile = () => {
    if (!started || reconcileQueued) return
    reconcileQueued = true
    queueMicrotask(reconcile)
  }

  return {
    async start() {
      if (started) return
      started = true
      try {
        await folderRuntime.start()
        nativeMenuBridge.start()
        recentsVisibility.start()
        observer = new MutationObserver(queueReconcile)
        observer.observe(document.documentElement, { childList: true, subtree: true })
        reconcile()
      } catch (error) {
        // Folders is additive. Its startup must never block the rest of the
        // content entrypoint or leave native Recents partially hidden.
        console.warn('[Folders] Failed to start; Gemini UI remains unchanged', error)
        this.stop()
      }
    },

    stop() {
      if (!started) return
      started = false
      observer?.disconnect()
      observer = undefined
      nativeMenuBridge.stop()
      recentsVisibility.stop()
      unmount()
      folderRuntime.stop()
    },
  }
}
