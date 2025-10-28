
import { Container, createRoot, Root } from "react-dom/client"
import { StrictMode, useEffect, useState } from "react"
import { PromptEntrance } from "@/components/prompt-entrance"

// 纯原生JS实现 - 支持重新挂载
let root: Root | null = null
let container: HTMLDivElement | null = null
let observer: MutationObserver | null = null
let remountTimeout: NodeJS.Timeout | null = null

const insertPromptButton = (forceRemount = false) => {
  const toolboxDrawer = document.querySelector('toolbox-drawer')
  if (!toolboxDrawer) return false

  // 检查现有按钮状态
  const existingContainer = document.getElementById('gemini-prompt-button-container') as HTMLDivElement
  if (existingContainer && !forceRemount) {
    // 检查按钮是否仍然有效（在正确的父容器中）
    if (existingContainer.isConnected && toolboxDrawer.parentNode?.contains(existingContainer)) {
      return true
    }
    // 按钮存在但位置不正确，需要重新挂载
    cleanup()
  }

  // 创建容器
  container = document.createElement('div')
  container.id = 'gemini-prompt-button-container'
  
  // 插入到toolbox-drawer之后
  toolboxDrawer.parentNode?.insertBefore(container, toolboxDrawer.nextSibling)

  // React渲染
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

  // 检查是否需要重新挂载
  const existingContainer = document.getElementById('gemini-prompt-button-container')
  if (!existingContainer || !existingContainer.isConnected) {
    return insertPromptButton(true)
  }

  // 检查按钮是否在正确的位置
  if (!toolboxDrawer.parentNode?.contains(existingContainer)) {
    cleanup()
    return insertPromptButton(true)
  }

  return true
}

// MutationObserver监听DOM变化
const startObserver = () => {
  if (observer) return

  observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'childList') {
        const addedNodes = Array.from(mutation.addedNodes)
        const removedNodes = Array.from(mutation.removedNodes)
        
        // 检查是否有新的 toolbox-drawer 添加
        const hasNewToolboxDrawer = addedNodes.some(node => 
          node.nodeType === Node.ELEMENT_NODE && 
          (node as Element).tagName?.toLowerCase() === 'toolbox-drawer'
        )
        
        // 检查是否有 toolbox-drawer 被移除
        const hasRemovedToolboxDrawer = removedNodes.some(node => 
          node.nodeType === Node.ELEMENT_NODE && 
          (node as Element).tagName?.toLowerCase() === 'toolbox-drawer'
        )

        // 检查现有按钮是否被移除
        const hasRemovedPromptButton = removedNodes.some(node => 
          node.nodeType === Node.ELEMENT_NODE && 
          (node as Element).id === 'gemini-prompt-button-container'
        )
        
        if (hasNewToolboxDrawer || hasRemovedToolboxDrawer || hasRemovedPromptButton) {
          // 防抖：避免频繁重新挂载
          if (remountTimeout) clearTimeout(remountTimeout)
          remountTimeout = setTimeout(() => {
            ensurePromptButton()
            remountTimeout = null
          }, 100)
        }
      }
    })
  })

  // 启动监听
  observer.observe(document.body, {
    childList: true,
    subtree: true
  })
}

// 立即尝试插入
if (insertPromptButton()) {
  startObserver()
} else {
  startObserver()
}

// 页面卸载时清理
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