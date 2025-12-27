/**
 * Run Modal Component
 * Left: variable inputs, Right: preview of rendered prompts
 */

import React, { useEffect, useMemo, useState } from 'react'
import {
  Box,
  Button,
  Dialog,
  Field,
  Flex,
  Input,
  Portal,
  Separator,
  Spinner,
  Text,
  Textarea,
  Timeline,
  VStack
} from '@chakra-ui/react'
import { HiOutlinePlay, HiOutlinePencil } from 'react-icons/hi'
import type { ChainPrompt } from '@/domain/chain-prompt/types'
import { templateEngine } from '@/services/templateEngine'
import { executionCoordinator } from '@/services/executionCoordinator'
import { useChainPromptStore, startRun, updateStepStatus, completeRun } from '@/stores/chainPromptStore'
import { toaster } from '@/components/ui/toaster'
import { t } from '@/utils/i18n'
import { createNewChatByClick } from '@/utils/chatActions'
import { hasChatHistory, getChatSummary, getDefaultChatWindow } from '@/utils/messageUtils'
import { ConfirmNewChatDialog } from './ConfirmNewChatDialog'
import { useEventEmitter } from '@/hooks/useEventBus'

interface RunModalProps {
  prompt: ChainPrompt
  open: boolean
  onClose: () => void
  onEdit?: () => void
}

export function RunModal({ prompt, open, onClose, onEdit }: RunModalProps) {
  const [variableValues, setVariableValues] = useState<Record<string, string>>({})
  const [isExecuting, setIsExecuting] = useState(false)
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const [chatMessageCount, setChatMessageCount] = useState(0)
  const running = useChainPromptStore(state => state.running)
  const { emit } = useEventEmitter()

  // Initialize variable default values
  useEffect(() => {
    if (open) {
      const initialValues: Record<string, string> = {}
      prompt.variables.forEach(v => {
        initialValues[v.key] = v.defaultValue || ''
      })
      setVariableValues(initialValues)
      
      // Detect chat history
      const summary = getChatSummary()
      setChatMessageCount(summary.messageCount)
    }
  }, [open, prompt])

  // Preview: render all steps
  const previewSteps = useMemo(() => {
    const context = {
      variables: variableValues,
      stepOutputs: new Map<number, string>()
    }

    return prompt.steps.map((step, index) => {
      try {
        const { prompt: rendered } = templateEngine.renderWithValidation(step.prompt, context, index)
        // Simulate output for subsequent step preview (using placeholder)
        context.stepOutputs.set(index, `[Output of Step ${index + 1}]`)
        return {
          stepIndex: index,
          stepName: step.name || t('settingPanel.editor.placeholders.stepName', String(index + 1)),
          rendered,
          error: null,
        }
      } catch (error) {
        return {
          stepIndex: index,
          stepName: step.name || t('settingPanel.editor.placeholders.stepName', String(index + 1)),
          rendered: step.prompt,
          error: error instanceof Error ? error.message : t('settingPanel.runModal.toaster.unknownError')
        }
      }
    })
  }, [prompt, variableValues])

  const handleExecute = async () => {
    // Detect chat history
    if (hasChatHistory()) {
      setShowConfirmDialog(true)
      return
    }

    // No history found, execute directly
    await executeChainPrompt()
  }

  const handleContinueInCurrent = async () => {
    setShowConfirmDialog(false)
    await executeChainPrompt()
  }

  const handleCreateNewAndContinue = async () => {
    setShowConfirmDialog(false)

    // Create new chat
    const success = await createNewChatByClick()

    if (!success) {
      toaster.create({
        title: 'Failed to create new chat',
        description: 'Please create a new chat manually and try again',
        type: 'error',
        duration: 5000
      })
      return
    }

    // New chat created successfully, execute chain prompt
    await executeChainPrompt()
  }

  const handleEdit = () => {
    if (onEdit) {
      onEdit()
    }
  }

  const executeChainPrompt = async () => {
    setIsExecuting(true)
    
    // 1. Initialize run status
    startRun(prompt)
    
    // 2. Close all setting panels and modals (wait for animation to avoid flicker)
    onClose()
    
    // Close setting panel via event bus
    emit('settings:close', { from: 'run-modal', reason: 'execution-started' })
    
    await new Promise(resolve => setTimeout(resolve, 150))
    
    // 3. Mount run status UI (dynamic import to avoid errors in non-content script environments)
    try {
      const { mountRunStatusUI } = await import('@/entrypoints/content/status')
      await mountRunStatusUI()
    } catch (error) {
      console.warn('[RunModal] Failed to mount run status UI:', error)
    }

    try {
      // Get chat window and abort signal
      const chatWindow = getDefaultChatWindow() || undefined
      const abortSignal = running.abortController?.signal
      
      await executionCoordinator.executeChainPrompt(
        prompt,
        variableValues,
        {
          enableUrlMonitoring: true,
          onExecutionAborted: (reason) => {
            console.log('[RunModal] Execution aborted:', reason)
          }
        }
      )

      // Execution complete, update status
      const { running: currentRunning } = useChainPromptStore.getState()
      if (currentRunning.status === 'running') {
        completeRun({ status: 'succeeded', steps: [], startedAt: new Date().toISOString() })
      }

      // Show completion notification
      const { running: finalRunning } = useChainPromptStore.getState()
      if (finalRunning.status === 'succeeded') {
        toaster.create({
          title: t('settingPanel.runModal.toaster.completed'),
          type: 'success',
          duration: 3000
        })
      } else if (finalRunning.status === 'failed') {
        toaster.create({
          title: t('settingPanel.runModal.toaster.failed'),
          description: finalRunning.steps.find(s => s.error)?.error || t('settingPanel.runModal.toaster.unknownError'),
          type: 'error'
        })
      } else if (finalRunning.status === 'aborted') {
        toaster.create({
          title: t('settingPanel.runModal.toaster.aborted'),
          type: 'info'
        })
      }
    } catch (error) {
      toaster.create({
        title: t('settingPanel.runModal.toaster.executionFailed'),
        description: error instanceof Error ? error.message : t('settingPanel.runModal.toaster.unknownError'),
        type: 'error'
      })
    } finally {
      setIsExecuting(false)
    }
  }

  return (
    <Dialog.Root 
      open={open} 
      onOpenChange={(e) => !e.open && onClose()} 
      size="xl"
      closeOnInteractOutside={false}
    >
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content bg="bg" maxW="900px">
          <Dialog.Header>
            <Flex justify="space-between" align="center" width="100%">
              <Dialog.Title>{t('settingPanel.runModal.title', prompt.name)}</Dialog.Title>
              {onEdit && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleEdit}
                  disabled={isExecuting}
                >
                  <HiOutlinePencil />
                  {t('settingPanel.runModal.edit')}
                </Button>
              )}
            </Flex>
            </Dialog.Header>

            <Dialog.Body>
              <Flex gap={0} height="500px">
                {/* Left: Variable Inputs */}
                <Box
                  flex={1}
                  bg="bg.subtle"
                  p={4}
                  borderRadius="lg"
                  mr={3}
                >
                  <Text fontWeight="semibold" fontSize="md" mb={4}>
                    {t('settingPanel.runModal.inputVariables')}
                  </Text>

                  <VStack
                    align="stretch"
                    gap={3}
                    overflowY="auto"
                    maxH="calc(500px - 52px)"
                  >
                    {prompt.variables.length === 0 ? (
                      <Box
                        bg="bg.muted"
                        p={4}
                        borderRadius="md"
                        textAlign="center"
                      >
                        <Text color="fg.muted" fontSize="sm">
                          {t('settingPanel.runModal.noVariables')}
                        </Text>
                      </Box>
                    ) : (
                      prompt.variables.map((variable, index) => (
                        <Field.Root key={index}>
                          <Field.Label>{variable.key}</Field.Label>
                          <Input
                            value={variableValues[variable.key] || ''}
                            onChange={(e) =>
                              setVariableValues({
                                ...variableValues,
                                [variable.key]: e.target.value
                              })
                            }
                            placeholder={variable.defaultValue || t('settingPanel.runModal.placeholders.enterVariable', variable.key)}
                            size="sm"
                          />
                        </Field.Root>
                      ))
                    )}
                  </VStack>
                </Box>

                <Separator orientation="vertical" opacity={0} />

                {/* Right: Preview */}
                <Box
                  flex={1}
                  bg="bg.subtle"
                  p={4}
                  borderRadius="lg"
                  ml={3}
                >
                  <Text fontWeight="semibold" fontSize="md" mb={4}>
                    {t('settingPanel.runModal.preview')}
                  </Text>

                  <Box overflowY="auto" maxH="calc(500px - 52px)">
                    <Timeline.Root size="md" variant="subtle">
                      {previewSteps.map((preview, index) => (
                        <Timeline.Item key={preview.stepIndex}>
                          <Timeline.Connector>
                            <Timeline.Separator />
                            <Timeline.Indicator
                              bg={preview.error ? 'red.solid' : 'blue.solid'}
                              color="white"
                              fontSize="sm"
                              fontWeight="bold"
                            >
                              {index + 1}
                            </Timeline.Indicator>
                          </Timeline.Connector>
                          <Timeline.Content pb={index === previewSteps.length - 1 ? 0 : 4}>
                            <Timeline.Title fontSize="sm" mb={2}>
                              {preview.stepName}
                            </Timeline.Title>
                            <Box
                              bg={preview.error ? 'red.subtle' : 'bg.panel'}
                              border="1px solid"
                              borderColor={preview.error ? 'red.muted' : 'border'}
                              borderRadius="md"
                              p={3}
                              fontFamily="mono"
                              fontSize="xs"
                              whiteSpace="pre-wrap"
                              wordBreak="break-word"
                              maxH="300px"
                              overflowY="auto"
                            >
                              {preview.rendered}
                            </Box>
                            {preview.error && (
                              <Text fontSize="xs" color="fg.error" mt={1}>
                                {t('settingPanel.runModal.errorPrefix', preview.error)}
                              </Text>
                            )}
                          </Timeline.Content>
                        </Timeline.Item>
                      ))}
                    </Timeline.Root>
                  </Box>
                </Box>
              </Flex>
            </Dialog.Body>

            <Dialog.Footer>
              <Dialog.ActionTrigger asChild>
                <Button variant="outline" disabled={isExecuting}>
                  {t('settingPanel.runModal.footer.cancel')}
                </Button>
              </Dialog.ActionTrigger>
              <Button
                onClick={handleExecute}
                disabled={isExecuting || previewSteps.some(p => p.error)}
                loading={isExecuting}
              >
                {isExecuting ? (
                  <>
                    <Spinner size="sm" />
                    {t('settingPanel.runModal.footer.executing')}
                  </>
                ) : (
                  <>
                    <HiOutlinePlay />
                    {t('settingPanel.runModal.footer.execute')}
                  </>
                )}
              </Button>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>

      {/* Confirmation dialog */}
      <ConfirmNewChatDialog
        open={showConfirmDialog}
        onClose={() => setShowConfirmDialog(false)}
        onContinue={handleContinueInCurrent}
        onNewChat={handleCreateNewAndContinue}
        messageCount={chatMessageCount}
      />
    </Dialog.Root>
  )
}


