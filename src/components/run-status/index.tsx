/**
 * RunStatusContainer Component
 * 运行状态容器组件 - 整合简要状态和详细面板
 */

import React, { useEffect, useState, useRef } from 'react'
import { Box } from '@chakra-ui/react'
import { SimpleRunStatus } from './SimpleRunStatus'
import { RunStatusPanel } from './RunStatusPanel'
import { useChainPromptStore } from '@/stores/chainPromptStore'
import { eventBus } from '@/utils/eventbus'
import { toaster } from '@/components/ui/toaster'
import { t } from '@/utils/i18n'
import { useEvent } from '@/hooks/useEventBus'
import { AppEvents, ChatChangeEvent } from '@/common/event'

export const RunStatusContainer: React.FC = () => {
  const { running, clearRunStatus, abortRun } = useChainPromptStore()
  const [showPanel, setShowPanel] = useState(false)
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const leaveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  
  // Hover 控制函数
  const handleMouseEnter = () => {
    // 清除离开延迟
    if (leaveTimeoutRef.current) {
      clearTimeout(leaveTimeoutRef.current)
      leaveTimeoutRef.current = null
    }
    
    // 添加进入延迟（200ms），避免误触发
    hoverTimeoutRef.current = setTimeout(() => {
      setShowPanel(true)
    }, 200)
  }
  
  const handleMouseLeave = () => {
    // 清除进入延迟
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current)
      hoverTimeoutRef.current = null
    }
    
    // 添加离开延迟（300ms），避免快速移出时面板闪烁
    leaveTimeoutRef.current = setTimeout(() => {
      setShowPanel(false)
    }, 300)
  }
  
  // 鼠标进入面板时保持显示
  const handlePanelMouseEnter = () => {
    if (leaveTimeoutRef.current) {
      clearTimeout(leaveTimeoutRef.current)
      leaveTimeoutRef.current = null
    }
  }
  
  // 清理定时器
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current)
      }
      if (leaveTimeoutRef.current) {
        clearTimeout(leaveTimeoutRef.current)
      }
    }
  }, [])

  useEvent('chatchange', (eventData: ChatChangeEvent) => {
    if (eventData.isFromNewChat) {
      return;
    }
    console.log('[RunStatusContainer] Chat switched, clearing run status...', {
      original: eventData.originalUrl,
      current: eventData.currentUrl
    })
    setShowPanel(false)
    clearRunStatus()
  })
  
  // 聊天切换监听 - 切换聊天时自动关闭 run-status
  useEffect(() => {
    // 监听执行中止事件（显示 Toast 提醒）
    const handleExecutionAborted = (eventData: AppEvents['execution:aborted-by-chat-switch']) => {
      console.log('[RunStatusContainer] Execution aborted by chat switch:', eventData)
      
      // 只显示 Toast 提醒，UI 清理由 chatchange 事件处理
      toaster.create({
        title: t('executionCoordinator.toast.chatSwitched.title'),
        description: t('executionCoordinator.toast.chatSwitched.description'),
        type: 'warning',
        duration: 3000
      })
    }

    eventBus.on('execution:aborted-by-chat-switch', handleExecutionAborted)

    return () => {
      eventBus.off('execution:aborted-by-chat-switch', handleExecutionAborted)
    }
  }, [running.isRunning, clearRunStatus])

  // 页面卸载清理
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (running.isRunning) {
        clearRunStatus()
      }
    }
    
    const handleNavigation = () => {
      const isChatPage = window.location.pathname.includes('/chat')
      if (!isChatPage && running.isRunning) {
        clearRunStatus()
      }
    }
    
    window.addEventListener('beforeunload', handleBeforeUnload)
    window.addEventListener('popstate', handleNavigation)
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      window.removeEventListener('popstate', handleNavigation)
    }
  }, [running.isRunning, clearRunStatus])
  
  // 不渲染任何内容如果状态为 pending
  if (running.status === 'pending') {
    return null
  }
  
  return (
    <Box 
      position="relative"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {showPanel && (
        <Box onMouseEnter={handlePanelMouseEnter} onMouseLeave={handleMouseLeave}>
          <RunStatusPanel />
        </Box>
      )}
      <SimpleRunStatus />
    </Box>
  )
}

export default RunStatusContainer
export { SimpleRunStatus, RunStatusPanel }
export type { RunStatusData, StepData } from './types'

