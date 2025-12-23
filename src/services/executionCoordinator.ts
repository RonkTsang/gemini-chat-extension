/**
 * Execution Coordinator
 * Responsible for coordinating Chain Prompt execution and external state management
 */

import { chainPromptExecutor } from './chainPromptExecutor'
import { useChainPromptStore } from '@/stores/chainPromptStore'
import { eventBus } from '@/utils/eventbus'
import type { ChainPrompt } from '@/domain/chain-prompt/types'
import { ChatChangeEvent } from '@/common/event'

export interface ExecutionCoordinatorOptions {
  enableUrlMonitoring?: boolean
  onExecutionAborted?: (reason: string) => void
}

class ExecutionCoordinator {
  private unsubscribeChatChange: (() => void) | null = null
  private currentRunId: string | null = null
  private isExecuting = false

  /**
   * Start executing Chain Prompt
   */
  async executeChainPrompt(
    prompt: ChainPrompt,
    variables: Record<string, string>,
    options: ExecutionCoordinatorOptions = {}
  ): Promise<void> {
    const {
      enableUrlMonitoring = true,
      onExecutionAborted
    } = options

    // Generate execution ID
    this.currentRunId = `${prompt.id}-${Date.now()}`
    this.isExecuting = true

    // Setup chat switch monitoring
    if (enableUrlMonitoring) {
      this.setupChatChangeMonitoring(onExecutionAborted)
    }

    try {
      // Execute Chain Prompt
      await chainPromptExecutor.run(
        { prompt, variables },
        {
          onStepStart: (stepIndex, stepName, promptText) => {
            const { updateStepStatus } = useChainPromptStore.getState()
            updateStepStatus(stepIndex, 'running')
          },
          onStepComplete: (stepIndex, output) => {
            const { updateStepStatus } = useChainPromptStore.getState()
            updateStepStatus(stepIndex, 'succeeded')
          },
          onStepError: (stepIndex, error) => {
            const { updateStepStatus } = useChainPromptStore.getState()
            updateStepStatus(stepIndex, 'failed', error)
          }
        }
      )
    } finally {
      // Cleanup resources
      this.cleanup()
    }
  }

  /**
   * Abort execution
   */
  abortExecution(): void {
    if (this.currentRunId) {
      chainPromptExecutor.abort(this.currentRunId)
    }
    this.cleanup()
  }

  /**
   * Setup chat switch monitoring
   */
  private setupChatChangeMonitoring(onExecutionAborted?: (reason: string) => void): void {
    // Listen for chat switch events
    const handleChatChange = (eventData: ChatChangeEvent) => {
      if (this.isExecuting) {
        if (eventData.isFromNewChat) {
          return;
        }
        console.warn('[ExecutionCoordinator] Chat switched during execution, aborting...', eventData)
        
        // Abort execution
        this.abortExecution()
        
        // Emit chat switch abort event for UI layer processing
        eventBus.emit('execution:aborted-by-chat-switch', {
          reason: 'chat_switched',
          originalUrl: eventData.originalUrl,
          currentUrl: eventData.currentUrl,
          timestamp: eventData.timestamp
        })

        // Notify external callers
        onExecutionAborted?.(`Chat switched: ${eventData.originalUrl} -> ${eventData.currentUrl}`)
      }
    }

    // Listen to event bus
    eventBus.on('chatchange', handleChatChange)
  }

  /**
   * Cleanup resources
   */
  private cleanup(): void {
    // Stop chat switch monitoring
    if (this.unsubscribeChatChange) {
      this.unsubscribeChatChange()
      this.unsubscribeChatChange = null
    }
    
    this.currentRunId = null
    this.isExecuting = false
  }
}

// Global instance
export const executionCoordinator = new ExecutionCoordinator()


