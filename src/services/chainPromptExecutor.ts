/**
 * Chain Prompt Executor Service
 * Drives execution step-by-step (Insert → Send → Wait → Output → Continue)
 */

import type { ChainPrompt, RunResult, RunResultStep, RunStatus } from '@/domain/chain-prompt/types'
import { templateEngine, type TemplateContext } from './templateEngine'
import { updateStepStatus as storeUpdateStepStatus } from '@/stores/chainPromptStore'
import { useChainPromptStore } from '@/stores/chainPromptStore'
import { 
  insertTextToEditor, 
  sendMessage, 
  getModelStatus, 
  createModelStatusListener,
  stopModelResponse 
} from '@/utils/editorUtils'
export interface ExecutionOptions {
  chatWindow?: Element
  abortSignal?: AbortSignal
  onStepStart?: (stepIndex: number, stepName: string, prompt: string) => void
  onStepComplete?: (stepIndex: number, output: string) => void
  onStepError?: (stepIndex: number, error: string) => void
}

class ChainPromptExecutor {
  private activeExecutions = new Map<string, AbortController>()

  /**
   * Execute Chain Prompt
   */
  async run(
    params: { prompt: ChainPrompt; variables: Record<string, string> },
    options: ExecutionOptions = {}
  ): Promise<RunResult> {
    const { prompt, variables } = params
    const { chatWindow, abortSignal, onStepStart, onStepComplete, onStepError } = options
    
    const runId = `${prompt.id}-${Date.now()}`
    // Use externally provided abortSignal or create a new one
    const internalController = new AbortController()
    const effectiveSignal = abortSignal || internalController.signal
    this.activeExecutions.set(runId, internalController)
    
    const result: RunResult = {
      status: 'running',
      steps: [],
      startedAt: new Date().toISOString()
    }
    
    const context: TemplateContext = {
      variables,
      stepOutputs: new Map()
    }
    
    try {
      // Execute each step in order
      for (let i = 0; i < prompt.steps.length; i++) {
        // Check if aborted
        if (effectiveSignal.aborted) {
          result.status = 'aborted'
          result.finishedAt = new Date().toISOString()
          return result
        }
        
        const step = prompt.steps[i]
        const stepName = step.name || `Step ${i + 1}`
        const stepResult: RunResultStep = {
          stepIndex: i,
          stepId: step.id,
          inputPrompt: ''
        }
        
        try {
          // Render template
          const { prompt: renderedPrompt } = templateEngine.renderWithValidation(step.prompt, context, i)
          stepResult.inputPrompt = renderedPrompt
          // Sync rendered prompt to UI (to replace {{variable}} display)
          try {
            useChainPromptStore.getState().updateStepPrompt?.(i, renderedPrompt)
          } catch {}
          
          onStepStart?.(i, stepName, renderedPrompt)
          
          // Execute step: Insert → Send → Wait
          const output = await this.executeStep(renderedPrompt, chatWindow, effectiveSignal)
          
          stepResult.outputText = output
          context.stepOutputs.set(i, output)
          
          onStepComplete?.(i, output)
        } catch (error) {
          // Check if it is an abort error
          if (error instanceof Error && (error.name === 'AbortError' || effectiveSignal.aborted)) {
            const abortMessage = 'Execution aborted by user'
            stepResult.error = abortMessage
            result.status = 'aborted'
            onStepError?.(i, abortMessage)
            result.steps.push(stepResult)
            result.finishedAt = new Date().toISOString()
            return result
          }
          
          const errorMessage = error instanceof Error ? error.message : 'Unknown error'
          stepResult.error = errorMessage
          result.status = 'failed'
          
          onStepError?.(i, errorMessage)
          
          result.steps.push(stepResult)
          result.finishedAt = new Date().toISOString()
          return result
        }
        
        result.steps.push(stepResult)
      }
      
      result.status = 'succeeded'
      result.finishedAt = new Date().toISOString()
      return result
    } finally {
      this.activeExecutions.delete(runId)
    }
  }

  /**
   * Execute a single step
   */
  private async executeStep(
    prompt: string, 
    chatWindow: Element | undefined, 
    signal: AbortSignal
  ): Promise<string> {
    // 1. Insert prompt into editor
    const inserted = insertTextToEditor(prompt, chatWindow)
    if (!inserted) {
      throw new Error('Failed to insert prompt into editor')
    }

    let retryCount = 3;
    const retryDelay = 300;
    const tryToSendMessage = async () => {
      await this.sleep(retryDelay)
      const sent = sendMessage(chatWindow)
      if (!sent.success) {
        console.warn(`Failed to send message, reason: ${sent.reason}, retrying ${retryCount} times...`)
        if (retryCount > 0) {
          retryCount--;
          return tryToSendMessage()
        }
      }
      return sent;
    }
    
    // 2. Send message
    const sent = await tryToSendMessage();
    if (!sent.success) {
      throw new Error(`Failed to send message, reason: ${sent.reason}`)
    }
    
    // 3. Wait for model to complete response
    const output = await this.waitForModelCompletion(chatWindow, signal)
    
    return output
  }

  /**
   * Wait for model to complete response
   */
  private async waitForModelCompletion(
    chatWindow: Element | undefined, 
    signal: AbortSignal
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      let cleanup: (() => void) | null = null
      let isResponding = false
      
      // Handle abort
      const handleAbort = () => {
        cleanup?.()
        stopModelResponse(chatWindow)
        reject(new Error('Execution aborted'))
      }
      
      if (signal.aborted) {
        handleAbort()
        return
      }
      
      signal.addEventListener('abort', handleAbort)
      
      // Listen for model status changes
      cleanup = createModelStatusListener((status) => {
        if (status.isResponding) {
          // Model starts responding
          isResponding = true
        } else if (isResponding && !status.isResponding) {
          // Model finishes responding
          cleanup?.()
          signal.removeEventListener('abort', handleAbort)
          
          // Get the last message (model's reply)
          const output = this.getLatestModelResponse(chatWindow)
          if (output) {
            resolve(output)
          } else {
            reject(new Error('Failed to get model response'))
          }
        }
      }, chatWindow)
      
      // Set timeout (5 minutes)
      setTimeout(() => {
        if (isResponding) {
          cleanup?.()
          signal.removeEventListener('abort', handleAbort)
          reject(new Error('Model response timeout'))
        }
      }, 5 * 60 * 1000)
    })
  }

  /**
   * Get the latest model response
   */
  private getLatestModelResponse(chatWindow?: Element): string | null {
    const container = chatWindow || document
    
    // Find all model response containers
    const modelMessages = container.querySelectorAll('model-response')
    
    if (modelMessages.length === 0) {
      return null
    }
    
    // Get the last message
    const latestMessage = modelMessages[modelMessages.length - 1]
    
    // Extract text content
    const textContent = latestMessage.textContent?.trim() || null
    
    return textContent
  }


  /**
   * Abort execution
   */
  abort(runId: string): void {
    const controller = this.activeExecutions.get(runId)
    if (controller) {
      controller.abort()
    }
  }

  /**
   * Utility function: sleep
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

export const chainPromptExecutor = new ChainPromptExecutor()


