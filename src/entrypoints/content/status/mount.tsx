/**
 * Run Status UI Mount Manager
 * Responsible for mounting the run status UI above the Gemini input box
 */

import { createRoot, type Root } from 'react-dom/client'
import { Provider } from '@/components/ui/provider-shadow-dom'
import { RunStatusContainer } from '@/components/run-status'
import { getDefaultChatWindow } from '@/utils/messageUtils'
import { useChainPromptStore } from '@/stores/chainPromptStore'

type MountResult = { mountEl: HTMLDivElement; root: Root } | null

// Semantic-first selector chain (based on docs/dom/input.html)
const INPUT_SELECTORS = [
  'input-container input-area-v2 [data-node-type="input-area"]',
  'input-container [data-node-type="input-area"]',
  '[data-node-type="input-area"]',
]

/**
 * Find input area root element
 */
function findInputAreaRoot(scope: ParentNode): HTMLElement | null {
  // 1) Semantic selector priority
  for (const s of INPUT_SELECTORS) {
    const el = scope.querySelector(s) as HTMLElement | null
    if (el) return el
  }
  
  // 2) Fallback: find nearest input area container based on rich-textarea
  const rta = scope.querySelector('rich-textarea') as HTMLElement | null
  if (rta) {
    const byAttr = rta.closest<HTMLElement>('[data-node-type="input-area"]')
    if (byAttr) return byAttr
    const byClass = rta.closest<HTMLElement>('.text-input-field')
    if (byClass) return byClass
  }
  
  // 3) Final fallback: based on aria-label of send/stop buttons
  const sendBtn = scope.querySelector(
    'button[aria-label="Send message"], button[aria-label="Stop response"]'
  ) as HTMLElement | null
  if (sendBtn) {
    const container = sendBtn.closest<HTMLElement>('[data-node-type="input-area"]')
      ?? sendBtn.closest<HTMLElement>('.text-input-field')
    if (container) return container
  }
  
  return null
}

let statusRoot: Root | null = null
let statusMountEl: HTMLDivElement | null = null
let statusObserver: MutationObserver | null = null
let remountTimeout: NodeJS.Timeout | null = null

/**
 * DOM lookup retry helper function
 */
async function findInputAreaRootWithRetry(
  scope: ParentNode,
  maxRetries = 3,
  delay = 300
): Promise<HTMLElement | null> {
  for (let i = 0; i < maxRetries; i++) {
    const el = findInputAreaRoot(scope)
    if (el) return el
    
    if (i < maxRetries - 1) {
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }
  return null
}

/**
 * Mount run status UI
 */
export async function mountRunStatusUI(remount = false): Promise<MountResult> {
  const chatScope = getDefaultChatWindow() ?? document
  
  // Use retry mechanism to find input area (adapts to SPA navigation delay)
  const inputRoot = await findInputAreaRootWithRetry(chatScope)
  if (!inputRoot) {
    console.warn('[RunStatus] Input area not found after retries')
    return null
  }

  if (statusRoot && !remount) {
    return { mountEl: statusMountEl!, root: statusRoot }
  }
  
  if (remount) {
    unmountRunStatusUI()
  }

  // To place SimpleRunStatus at the top-right outside the input box (referencing design),
  // set the mount point to absolute positioning, anchored to the top-right of the input area container.
  // If the input area container is 'static', temporarily set it to 'relative' as a positioning reference.
  const originalPosition = getComputedStyle(inputRoot).position
  if (originalPosition === 'static') {
    // Mark, restore on unmount
    ;(inputRoot as any)._geminiWxtOriginalPosition = 'static'
    inputRoot.style.position = 'relative'
  }

  statusMountEl = document.createElement('div')
  statusMountEl.id = 'gemini-wxt-run-status'
  // Absolute position to the top-right of the input area (outside the input box)
  statusMountEl.style.cssText = [
    'position:absolute',
    'right:0',
    'bottom:calc(100% + 8px)',
    'z-index:100000',
    'pointer-events:auto'
  ].join(';')
  inputRoot.appendChild(statusMountEl)

  statusRoot = createRoot(statusMountEl)
  statusRoot.render(
    <Provider host={{ style: { backgroundColor: 'unset' } }}>
      <RunStatusContainer />
    </Provider>
  )

  ensureStatusObserver()
  return { mountEl: statusMountEl, root: statusRoot }
}

/**
 * Unmount run status UI
 */
export function unmountRunStatusUI() {
  // Cleanup debounce timer
  if (remountTimeout) {
    clearTimeout(remountTimeout)
    remountTimeout = null
  }
  
  // Unmount React component
  statusRoot?.unmount()
  statusRoot = null
  
  // Remove DOM element
  statusMountEl?.remove()
  statusMountEl = null
  
  // Disconnect observer
  statusObserver?.disconnect()
  statusObserver = null

  // Restore input area container positioning style (if set by us)
  const chatScope = getDefaultChatWindow() ?? document
  const inputRoot = findInputAreaRoot(chatScope)
  if (inputRoot && (inputRoot as any)._geminiWxtOriginalPosition === 'static') {
    inputRoot.style.position = ''
    delete (inputRoot as any)._geminiWxtOriginalPosition
  }
}

/**
 * Ensure DOM Observer is running
 */
function ensureStatusObserver() {
  if (statusObserver) return
  
  statusObserver = new MutationObserver(() => {
    const chatScope = getDefaultChatWindow() ?? document
    const currentRoot = findInputAreaRoot(chatScope)
    
    // Input area replaced or mount point detached from current input area → remount
    if (!currentRoot || !statusMountEl || !statusMountEl.isConnected || !currentRoot.contains(statusMountEl)) {
      // Debounce: avoid frequent remounting
      if (remountTimeout) clearTimeout(remountTimeout)
      remountTimeout = setTimeout(() => {
        // Check if there is a running Chain Prompt
        const { running } = useChainPromptStore.getState()
        if (running.isRunning) {
          // If there is a running Chain Prompt, cleanup state and unmount UI
          console.log('[RunStatus] Chat switched during execution, cleaning up...')
          const { clearRunStatus } = useChainPromptStore.getState()
          clearRunStatus()
          unmountRunStatusUI()
        } else {
          // No running Chain Prompt, try remounting
          mountRunStatusUI(true)
        }
        remountTimeout = null
      }, 100)
    }
  })
  
  // Optimization: only observe the chat window scope instead of the entire document.body
  const chatScope = getDefaultChatWindow()
  const observeTarget = chatScope ?? document.body
  statusObserver.observe(observeTarget, { 
    childList: true, 
    subtree: true 
  })
}

// Extension lifecycle: listen for extension uninstall/disable
if (typeof browser !== 'undefined' && browser.runtime?.onSuspend) {
  browser.runtime.onSuspend.addListener(() => {
    unmountRunStatusUI()
  })
}

