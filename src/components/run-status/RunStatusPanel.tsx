/**
 * RunStatusPanel Component
 * Detailed status panel - displays execution status of all steps
 */

import React from 'react'
import { Box, Text, VStack } from '@chakra-ui/react'
import {
  TimelineRoot,
  TimelineItem,
  TimelineConnector,
  TimelineSeparator,
  TimelineIndicator,
  TimelineContent,
  TimelineTitle
} from '@/components/ui/timeline'
import { LuCheck, LuX, LuLoader, LuCircle } from 'react-icons/lu'
import { useChainPromptStore } from '@/stores/chainPromptStore'

export const RunStatusPanel: React.FC = React.memo(() => {
  const { running } = useChainPromptStore()
  
  if (running.status === 'pending') {
    return null
  }
  
  const getStepIcon = (status: string) => {
    switch (status) {
      case 'succeeded':
        return <LuCheck color="white" />
      case 'failed':
        return <LuX color="white" />
      case 'running':
        return (
          <Box 
            as={LuLoader} 
            color="white"
            animation="spin 1s linear infinite"
          />
        )
      case 'pending':
        return <LuCircle color="white" opacity={0.6} />
      default:
        return null
    }
  }
  
  const getIndicatorColor = (status: string) => {
    switch (status) {
      case 'succeeded': return 'green.solid'
      case 'failed': return 'red.solid'
      case 'running': return 'blue.solid'
      case 'pending': return 'gray.300'
      default: return 'gray.300'
    }
  }
  
  return (
    <Box
      position="absolute"
      bottom="calc(100% + 8px)"
      left={0}
      right={0}
      bg="bg.panel"
      border="1px solid"
      borderColor="border"
      borderRadius="lg"
      p={4}
      shadow="lg"
      maxH="400px"
      overflowY="auto"
      role="dialog"
      aria-labelledby="run-status-title"
      aria-describedby="run-status-steps"
    >
      <VStack align="stretch" gap={4}>
        {/* Header */}
        <Box>
          <Text id="run-status-title" fontWeight="semibold" fontSize="sm" textAlign="start">
            {running.promptName || 'Chain Prompt'}
          </Text>
        </Box>
        
        {/* Steps Timeline */}
        <TimelineRoot size="md" variant="subtle">
          <Box id="run-status-steps">
            {running.steps.map((step, index) => (
              <TimelineItem key={step.stepIndex}>
                <TimelineConnector>
                  <TimelineSeparator />
                  <TimelineIndicator bg={getIndicatorColor(step.status)}>
                    {getStepIcon(step.status)}
                  </TimelineIndicator>
                </TimelineConnector>
                
                <TimelineContent pb={index === running.steps.length - 1 ? 0 : 3} textAlign="start">
                  <TimelineTitle fontSize="sm" fontWeight="medium" textAlign="start">
                    {step.stepName}
                  </TimelineTitle>
                  
                  <Text 
                    fontSize="xs" 
                    color="fg.muted"
                    lineClamp={3}
                    whiteSpace="pre-wrap"
                    textAlign="start"
                  >
                    {step.stepPrompt}
                  </Text>
                  
                  {step.error && (
                    <Text fontSize="xs" color="red.fg" mt={1}>
                      Error: {step.error}
                    </Text>
                  )}
                </TimelineContent>
              </TimelineItem>
            ))}
          </Box>
        </TimelineRoot>
      </VStack>
    </Box>
  )
})

RunStatusPanel.displayName = 'RunStatusPanel'

