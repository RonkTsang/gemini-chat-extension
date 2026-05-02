
import { createRoot, Root } from "react-dom/client"
import { StrictMode } from "react"
import { PromptEntrance } from "@/components/prompt-entrance"

// Pure native JS implementation - supports remounting
let root: Root | null = null
let container: HTMLDivElement | null = null
let observer: MutationObserver | null = null
let remountTimeout: NodeJS.Timeout | null = null
const PROMPT_CONTAINER_ID = 'gemini-prompt-button-container'

type PromptContext = {
  toolboxDrawer: HTMLElement
  inputAreaRoot: HTMLElement | null
  inputAreaV2: HTMLElement | null
  textInputField: HTMLElement | null
}

const findPromptContext = (): PromptContext | null => {
  const toolboxDrawer = document.querySelector('toolbox-drawer') as HTMLElement | null
  if (!toolboxDrawer) return null

  const inputAreaRoot = toolboxDrawer.closest<HTMLElement>('[data-node-type="input-area"]')
  const inputAreaV2 = toolboxDrawer.closest<HTMLElement>('input-area-v2')
  const textInputField = inputAreaRoot?.querySelector<HTMLElement>('.text-input-field') ?? null

  return {
    toolboxDrawer,
    inputAreaRoot,
    inputAreaV2,
    textInputField,
  }
}

const isSingleLineInputMode = (context: PromptContext) => {
  const { inputAreaRoot, inputAreaV2, textInputField } = context
  if (!inputAreaV2?.classList.contains('single-line-input')) return false

  // Gemini's new single-line layout keeps `single-line-input` on the outer shell
  // even after expanding. Pair it with inner state classes to avoid false positives.
  if (inputAreaRoot?.querySelector('.single-line-format')) return true
  return !textInputField?.classList.contains('height-expanded-past-single-line')
}

const isPromptContainerValid = (
  existingContainer: HTMLElement,
  toolboxDrawer: HTMLElement,
) => {
  return existingContainer.isConnected
    && existingContainer.parentElement === toolboxDrawer.parentElement
    && toolboxDrawer.nextElementSibling === existingContainer
}

const isRelevantElement = (element: Element) => {
  if (element.id === PROMPT_CONTAINER_ID) return true
  if (element.matches('toolbox-drawer, input-area-v2, [data-node-type="input-area"], .text-input-field, .single-line-format')) {
    return true
  }

  return !!element.querySelector('toolbox-drawer, input-area-v2, [data-node-type="input-area"], .text-input-field, .single-line-format, #gemini-prompt-button-container')
}

const hasRelevantMutation = (mutation: MutationRecord) => {
  if (mutation.type === 'attributes') {
    return mutation.target instanceof Element && isRelevantElement(mutation.target)
  }

  if (mutation.type !== 'childList') return false

  return [...mutation.addedNodes, ...mutation.removedNodes].some(node =>
    node instanceof Element && isRelevantElement(node)
  )
}

const scheduleEnsurePromptButton = () => {
  if (remountTimeout) clearTimeout(remountTimeout)
  remountTimeout = setTimeout(() => {
    ensurePromptButton()
    remountTimeout = null
  }, 100)
}

const insertPromptButton = (forceRemount = false) => {
  const context = findPromptContext()
  if (!context) return false

  if (isSingleLineInputMode(context)) {
    cleanup()
    return false
  }

  const { toolboxDrawer } = context

  // Check existing button status
  const existingContainer = document.getElementById(PROMPT_CONTAINER_ID) as HTMLDivElement | null
  if (existingContainer && !forceRemount) {
    if (isPromptContainerValid(existingContainer, toolboxDrawer)) {
      return true
    }
    cleanup()
  }

  // Create container
  container = document.createElement('div')
  container.id = PROMPT_CONTAINER_ID
  
  // Insert after toolbox-drawer
  toolboxDrawer.parentNode?.insertBefore(container, toolboxDrawer.nextSibling)

  // React rendering
  root = createRoot(container)
  root.render(
    <StrictMode>
      <PromptEntrance />
    </StrictMode>
  )

  console.log('Prompt button inserted and rendered')
  return true
}

const cleanup = () => {
  if (root) {
    root.unmount()
    root = null
  }

  const mountedContainer = document.getElementById(PROMPT_CONTAINER_ID)
  mountedContainer?.remove()
  container = null
}

const ensurePromptButton = () => {
  const context = findPromptContext()
  if (!context) {
    cleanup()
    return false
  }

  if (isSingleLineInputMode(context)) {
    cleanup()
    return false
  }

  const { toolboxDrawer } = context

  // Check if remounting is needed
  const existingContainer = document.getElementById(PROMPT_CONTAINER_ID)
  if (!existingContainer || !existingContainer.isConnected) {
    return insertPromptButton(true)
  }

  if (!isPromptContainerValid(existingContainer, toolboxDrawer)) {
    cleanup()
    return insertPromptButton(true)
  }

  return true
}

// MutationObserver to listen for DOM changes
const startObserver = () => {
  if (observer) return

  observer = new MutationObserver((mutations) => {
    if (mutations.some(hasRelevantMutation)) {
      scheduleEnsurePromptButton()
    }
  })

  // Start monitoring
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class'],
  })
}

// Try inserting immediately
if (insertPromptButton()) {
  startObserver()
} else {
  startObserver()
}

// Cleanup on page unload
const globalCleanup = () => {
  if (observer) {
    observer.disconnect()
    observer = null
  }
  if (remountTimeout) {
    clearTimeout(remountTimeout)
    remountTimeout = null
  }
  cleanup()
}

window.addEventListener('beforeunload', globalCleanup)
