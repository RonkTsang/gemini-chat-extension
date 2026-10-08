import { createRoot, type Root } from 'react-dom/client'

import { FolderSideNav } from '@/components/folders/FolderSideNav'
import { Provider } from '@/components/ui/provider-shadow-dom'
import { queryFirstMatchingElement, geminiDomSelectors } from '@/services/gemini-dom/selectors'
import { folderRuntime } from './runtime'
import { FolderNativeMenuBridge } from './native-menu'
import { FolderRecentsVisibilityController } from './recents-visibility'
import { folderNewChat } from './new-chat'
import { resolveFolderLabelAnchor } from './new-chat.dom'
import { FolderNewChatLabel } from '@/components/folders/FolderNewChatLabel'

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
  let labelRoot: Root | undefined
  let labelHost: HTMLElement | undefined
  let unsubscribeNewChat: (() => void) | undefined
  const nativeMenuBridge = new FolderNativeMenuBridge()
  const recentsVisibility = new FolderRecentsVisibilityController()

  const unmount = () => {
    reactRoot?.unmount()
    reactRoot = undefined
    host?.remove()
    host = undefined
  }

  const unmountLabel = () => {
    labelRoot?.unmount()
    labelRoot = undefined
    labelHost?.remove()
    labelHost = undefined
  }

  const reconcileLabel = () => {
    const intent = folderNewChat.getSnapshot()
    const anchor = intent && intent.phase !== 'opening' && (intent.phase !== 'saved' || intent.error)
      ? resolveFolderLabelAnchor() : null
    if (!anchor?.parentElement) { unmountLabel(); return }
    if (labelHost?.isConnected && labelHost.nextSibling === anchor) return
    unmountLabel()
    labelHost = document.createElement('div')
    labelHost.setAttribute('data-gpk-folder-new-chat-host', '')
    anchor.parentElement.insertBefore(labelHost, anchor)
    labelRoot = createRoot(labelHost)
    labelRoot.render(<Provider host={{ style: { background: 'transparent' } }}><FolderNewChatLabel /></Provider>)
  }

  const reconcile = () => {
    reconcileQueued = false
    if (!started) return
    reconcileLabel()
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
        folderNewChat.start()
        unsubscribeNewChat = folderNewChat.subscribe(queueReconcile)
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
      unsubscribeNewChat?.()
      unsubscribeNewChat = undefined
      folderNewChat.stop()
      unmountLabel()
      unmount()
      folderRuntime.stop()
    },
  }
}
