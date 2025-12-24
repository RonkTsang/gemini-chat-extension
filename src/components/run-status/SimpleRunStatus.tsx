/**
 * SimpleRunStatus Component
 * Brief status indicator - displayed above the Gemini input box
 */

import React from 'react'
import { Box, Flex, IconButton, Text, ProgressCircle } from '@chakra-ui/react'
import { LuCheck, LuX } from 'react-icons/lu'
import { useChainPromptStore } from '@/stores/chainPromptStore'
import { Tooltip } from '@/components/ui/tooltip'
import { t } from '@/utils/i18n'

export const SimpleRunStatus: React.FC = React.memo(() => {
  const { running, clearRunStatus, abortRun } = useChainPromptStore()
  
  // Do not render if status is pending
  if (running.status === 'pending') {
    return null
  }
  
  const { promptName, status, currentStepIndex, totalSteps, steps } = running
  
  // Calculate number of completed steps
  const completedSteps = steps.filter(s => s.status === 'succeeded').length
  const progress = totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0
  
  const renderStatusIcon = () => {
    switch (status) {
      case 'running':
        return (
          <ProgressCircle.Root value={progress} size="xs">
            <ProgressCircle.Circle>
              <ProgressCircle.Track stroke="var(--gem-sys-color--surface-container)" />
              <ProgressCircle.Range stroke="var(--gem-sys-color--on-primary-container)" strokeLinecap="round" />
            </ProgressCircle.Circle>
          </ProgressCircle.Root>
        )
      
      case 'succeeded':
        return (
          <IconButton
            aria-label="Success"
            variant="solid"
            colorPalette="green"
            borderRadius="full"
            size="2xs"
            pointerEvents="none"
          >
            <LuCheck size={14} />
          </IconButton>
        )
      
      case 'failed':
      case 'aborted':
        return (
          <IconButton
            aria-label="Failed"
            variant="solid"
            colorPalette="red"
            borderRadius="full"
            size="2xs"
            pointerEvents="none"
          >
            <LuX size={14} />
          </IconButton>
        )
      
      default:
        return null
    }
  }
  
  const getStatusText = () => {
    switch (status) {
      case 'running':
        return `${promptName || 'Chain Prompt'} is running (${currentStepIndex + 1}/${totalSteps})`
      case 'succeeded':
        return `${promptName || 'Chain Prompt'} is success`
      case 'failed':
        return `${promptName || 'Chain Prompt'} failed`
      case 'aborted':
        return `${promptName || 'Chain Prompt'} aborted`
      default:
        return promptName || 'Chain Prompt'
    }
  }
  
  return (
    <Flex
      align="center"
      gap={2}
      px={3}
      py={1}
      bg="color-mix(in oklab, var(--chakra-colors-bg-panel) 85%, transparent)"
      borderRadius="lg"
      transition="opacity 0.2s"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      aria-label={`Chain prompt execution status: ${getStatusText()}`}
    >
      {renderStatusIcon()}
      
      <Text flex={1} fontSize="sm" fontWeight="normal">
        {getStatusText()}
      </Text>
      
      {status === 'running' && (
        <Tooltip content={t('settingPanel.runStatus.tooltip.abortRun')}>
          <IconButton
            aria-label="Stop execution"
            variant="ghost"
            size="2xs"
            colorPalette="red"
            onClick={(e) => {
              e.stopPropagation()
              abortRun()
            }}
          >
            <LuX />
          </IconButton>
        </Tooltip>
      )}
      
      {(status === 'succeeded' || status === 'failed' || status === 'aborted') && (
        <Tooltip content={t('settingPanel.runStatus.tooltip.closeStatus')}>
          <IconButton
            aria-label="Close"
            variant="ghost"
            size="2xs"
            onClick={(e) => {
              e.stopPropagation()
              clearRunStatus()
            }}
          >
            <LuX />
          </IconButton>
        </Tooltip>
      )}
    </Flex>
  )
})

SimpleRunStatus.displayName = 'SimpleRunStatus'

