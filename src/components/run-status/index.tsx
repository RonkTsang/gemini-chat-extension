/**
 * RunStatusContainer Component
 * Run status container component - integrates brief status and detailed panel
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
  
  // Hover control functions
  const handleMouseEnter = () => {
    // Clear leave delay
    if (leaveTimeoutRef.current) {
      clearTimeout(leaveTimeoutRef.current)
      leaveTimeoutRef.current = null
    }
    
    // Add entry delay (200ms) to avoid accidental triggers
    hoverTimeoutRef.current = setTimeout(() => {
      setShowPanel(true)
    }, 200)
  }
  
  const handleMouseLeave = () => {
    // Clear entry delay
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current)
      hoverTimeoutRef.current = null
    }
    
    // Add leave delay (300ms) to avoid panel flickering when moving out quickly
    leaveTimeoutRef.current = setTimeout(() => {
      setShowPanel(false)
    }, 300)
  }
  
  // Keep visible when mouse enters the panel
  const handlePanelMouseEnter = () => {
    if (leaveTimeoutRef.current) {
      clearTimeout(leaveTimeoutRef.current)
      leaveTimeoutRef.current = null
    }
  }
  
  // Cleanup timers
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
  
  // Chat switch listener - automatically close run-status when switching chats
  useEffect(() => {
    // Listen for execution abort events (show Toast reminder)
    const handleExecutionAborted = (eventData: AppEvents['execution:aborted-by-chat-switch']) => {
      console.log('[RunStatusContainer] Execution aborted by chat switch:', eventData)
      
      // Only show Toast reminder; UI cleanup is handled by chatchange event
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

  // Cleanup on page unload
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
  
  // Do not render anything if status is pending
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

