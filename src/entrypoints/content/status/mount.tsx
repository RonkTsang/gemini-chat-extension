/**
 * Run Status UI Mount Manager
 * 负责在 Gemini 输入框上方挂载运行状态 UI
 */

import { createRoot, type Root } from 'react-dom/client'
import { Provider } from '@/components/ui/provider-shadow-dom'
import { RunStatusContainer } from '@/components/run-status'
import { getDefaultChatWindow } from '@/utils/messageUtils'
import { useChainPromptStore } from '@/stores/chainPromptStore'

type MountResult = { mountEl: HTMLDivElement; root: Root } | null

// 语义优先的选择器链（基于 docs/dom/input.html）
const INPUT_SELECTORS = [
  'input-container input-area-v2 [data-node-type="input-area"]',
  'input-container [data-node-type="input-area"]',
  '[data-node-type="input-area"]',
]

/**
 * 查找输入区域根元素
 */
function findInputAreaRoot(scope: ParentNode): HTMLElement | null {
  // 1) 语义化选择器优先
  for (const s of INPUT_SELECTORS) {
    const el = scope.querySelector(s) as HTMLElement | null
    if (el) return el
  }
  
  // 2) 回退：基于 rich-textarea 向上找最近输入区容器
  const rta = scope.querySelector('rich-textarea') as HTMLElement | null
  if (rta) {
    const byAttr = rta.closest<HTMLElement>('[data-node-type="input-area"]')
    if (byAttr) return byAttr
    const byClass = rta.closest<HTMLElement>('.text-input-field')
    if (byClass) return byClass
  }
  
  // 3) 最末回退：基于发送/停止按钮的 aria-label
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
 * DOM 查找重试辅助函数
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
 * 挂载运行状态 UI
 */
export async function mountRunStatusUI(remount = false): Promise<MountResult> {
  const chatScope = getDefaultChatWindow() ?? document
  
  // 使用重试机制查找输入区（适应 SPA 导航延迟）
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

  // 为了将 SimpleRunStatus 放在输入框外部的右上角（参照交互稿），
  // 将挂载点设置为绝对定位，锚定到输入区域容器的右上方。
  // 如果输入区域容器是 static 定位，则临时设置为 relative 以作为定位参照。
  const originalPosition = getComputedStyle(inputRoot).position
  if (originalPosition === 'static') {
    // 标记，卸载时还原
    ;(inputRoot as any)._geminiWxtOriginalPosition = 'static'
    inputRoot.style.position = 'relative'
  }

  statusMountEl = document.createElement('div')
  statusMountEl.id = 'gemini-wxt-run-status'
  // 绝对定位到输入区域的右上角（在输入框外部）
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
 * 卸载运行状态 UI
 */
export function unmountRunStatusUI() {
  // 清理防抖定时器
  if (remountTimeout) {
    clearTimeout(remountTimeout)
    remountTimeout = null
  }
  
  // 卸载 React 组件
  statusRoot?.unmount()
  statusRoot = null
  
  // 移除 DOM 元素
  statusMountEl?.remove()
  statusMountEl = null
  
  // 断开观察器
  statusObserver?.disconnect()
  statusObserver = null

  // 还原输入区域容器的定位样式（如果是我们设置的）
  const chatScope = getDefaultChatWindow() ?? document
  const inputRoot = findInputAreaRoot(chatScope)
  if (inputRoot && (inputRoot as any)._geminiWxtOriginalPosition === 'static') {
    inputRoot.style.position = ''
    delete (inputRoot as any)._geminiWxtOriginalPosition
  }
}

/**
 * 确保 DOM Observer 运行
 */
function ensureStatusObserver() {
  if (statusObserver) return
  
  statusObserver = new MutationObserver(() => {
    const chatScope = getDefaultChatWindow() ?? document
    const currentRoot = findInputAreaRoot(chatScope)
    
    // 输入区被替换或挂载点脱离了当前输入区 → 重挂载
    if (!currentRoot || !statusMountEl || !statusMountEl.isConnected || !currentRoot.contains(statusMountEl)) {
      // 防抖：避免频繁重挂载
      if (remountTimeout) clearTimeout(remountTimeout)
      remountTimeout = setTimeout(() => {
        // 检查是否有正在运行的 Chain Prompt
        const { running } = useChainPromptStore.getState()
        if (running.isRunning) {
          // 如果有正在运行的 Chain Prompt，清理状态并卸载 UI
          console.log('[RunStatus] Chat switched during execution, cleaning up...')
          const { clearRunStatus } = useChainPromptStore.getState()
          clearRunStatus()
          unmountRunStatusUI()
        } else {
          // 没有正在运行的 Chain Prompt，尝试重新挂载
          mountRunStatusUI(true)
        }
        remountTimeout = null
      }, 100)
    }
  })
  
  // 优化：只观察聊天窗口范围，而非整个 document.body
  const chatScope = getDefaultChatWindow()
  const observeTarget = chatScope ?? document.body
  statusObserver.observe(observeTarget, { 
    childList: true, 
    subtree: true 
  })
}

// 扩展生命周期：监听扩展卸载/禁用
if (typeof browser !== 'undefined' && browser.runtime?.onSuspend) {
  browser.runtime.onSuspend.addListener(() => {
    unmountRunStatusUI()
  })
}

