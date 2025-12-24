
import { Container, createRoot, Root } from "react-dom/client"
import { StrictMode, useEffect, useState } from "react"
import { PromptEntrance } from "@/components/prompt-entrance"

// Pure native JS implementation - supports remounting
let root: Root | null = null
let container: HTMLDivElement | null = null
let observer: MutationObserver | null = null
let remountTimeout: NodeJS.Timeout | null = null

const insertPromptButton = (forceRemount = false) => {
  const toolboxDrawer = document.querySelector('toolbox-drawer')
  if (!toolboxDrawer) return false

  // Check existing button status
  const existingContainer = document.getElementById('gemini-prompt-button-container') as HTMLDivElement
  if (existingContainer && !forceRemount) {
    // Check if button is still valid (in correct parent container)
    if (existingContainer.isConnected && toolboxDrawer.parentNode?.contains(existingContainer)) {
      return true
    }
    // Button exists but in wrong position, needs remounting
    cleanup()
  }

  // Create container
  container = document.createElement('div')
  container.id = 'gemini-prompt-button-container'
  
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
  if (container) {
    container.remove()
    container = null
  }
}

const ensurePromptButton = () => {
  const toolboxDrawer = document.querySelector('toolbox-drawer')
  if (!toolboxDrawer) return false

  // Check if remounting is needed
  const existingContainer = document.getElementById('gemini-prompt-button-container')
  if (!existingContainer || !existingContainer.isConnected) {
    return insertPromptButton(true)
  }

  // Check if button is in the correct position
  if (!toolboxDrawer.parentNode?.contains(existingContainer)) {
    cleanup()
    return insertPromptButton(true)
  }

  return true
}

// MutationObserver to listen for DOM changes
const startObserver = () => {
  if (observer) return

  observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'childList') {
        const addedNodes = Array.from(mutation.addedNodes)
        const removedNodes = Array.from(mutation.removedNodes)
        
        // Check if a new toolbox-drawer was added
        const hasNewToolboxDrawer = addedNodes.some(node => 
          node.nodeType === Node.ELEMENT_NODE && 
          (node as Element).tagName?.toLowerCase() === 'toolbox-drawer'
        )
        
        // Check if toolbox-drawer was removed
        const hasRemovedToolboxDrawer = removedNodes.some(node => 
          node.nodeType === Node.ELEMENT_NODE && 
          (node as Element).tagName?.toLowerCase() === 'toolbox-drawer'
        )

        // Check if existing button was removed
        const hasRemovedPromptButton = removedNodes.some(node => 
          node.nodeType === Node.ELEMENT_NODE && 
          (node as Element).id === 'gemini-prompt-button-container'
        )
        
        if (hasNewToolboxDrawer || hasRemovedToolboxDrawer || hasRemovedPromptButton) {
          // Debounce: avoid frequent remounting
          if (remountTimeout) clearTimeout(remountTimeout)
          remountTimeout = setTimeout(() => {
            ensurePromptButton()
            remountTimeout = null
          }, 100)
        }
      }
    })
  })

  // Start monitoring
  observer.observe(document.body, {
    childList: true,
    subtree: true
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