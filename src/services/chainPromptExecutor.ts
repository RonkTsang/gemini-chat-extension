/**
 * Chain Prompt Executor Service
 * Drives execution step-by-step (Insert → Send → Wait → Output → Continue)
 */

import type { ChainPrompt, RunResult, RunResultStep } from '@/domain/chain-prompt/types'
import { templateEngine, type TemplateContext } from './templateEngine'
import { useChainPromptStore } from '@/stores/chainPromptStore'
import { 
  insertTextToEditor, 
  sendMessage,
  createModelStatusListener,
  stopModelResponse,
  getSendButton,
  isReadyToSend
} from '@/utils/editorUtils'
import { getLastModelMessage, isModelRespondingByAvatar, type ModelMessage } from '@/utils/messageUtils'

export interface ExecutionOptions {
  chatWindow?: Element
  abortSignal?: AbortSignal
  onStepStart?: (stepIndex: number, stepName: string, prompt: string) => void
  onStepComplete?: (stepIndex: number, output: string) => void
  onStepError?: (stepIndex: number, error: string) => void
}

class ChainPromptExecutor {
  private activeExecutions = new Map<string, AbortController>()

  // Configuration for retrying message sending
  private retryCount = 10;
  private retryDelay = 300;
  
  // Configuration for waiting for last model message to finish
  private waitForLastMsgFinishOptions = { ms: 500, maxCount: 20 };

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
    console.log('executeStep:try to send message', prompt)
    let retryCount = this.retryCount;
    const retryDelay = this.retryDelay;

    const checkIsSendSuccess = async () => {
      console.log('executeStep: try again to check if already send')
      const sendButton = getSendButton(chatWindow)
      if (!sendButton) {
        return false
      }
      const isReady = isReadyToSend(sendButton) 
      // if is ready to send, it means the message did not send successfully
      console.log('executeStep: is send successfully', !isReady)
      return !isReady;
    }

    const tryToSendMessage = async () => {
      await this.sleep(retryDelay)
      const sent = sendMessage(chatWindow)
      console.log('executeStep: send message result', sent)
      let success = sent.success;
      if (success) {
        await this.sleep(500);
        if (!(await checkIsSendSuccess())) {
          success = false;
          sent.reason = 'unknown: send_message_failed' as any;
        }
      }
      if (!success) {
        console.warn(`executeStep: Failed to send message, reason: ${sent.reason}, retrying ${retryCount} times...`)
        if (retryCount > 0) {
          retryCount--;
          return tryToSendMessage()
        }
      }
      return sent;
    }

    const lastModelMessage = getLastModelMessage(chatWindow)
    if (lastModelMessage) {
      const finishSuccessfully = await this.waitForLastModelMsgFinish(lastModelMessage, this.waitForLastMsgFinishOptions)
      if (!finishSuccessfully) {
        console.log('executeStep: waitForLastModelMsgFinish failed');
      }
    }
    
    // 2. Send message
    const sent = await tryToSendMessage();
    if (!sent.success) {
      throw new Error(`Failed to send message, reason: ${sent.reason}`)
    }

    console.log('executeStep: send message success')
    
    // 3. Wait for model to complete response
    const output = await this.waitForModelCompletion(chatWindow, signal)

    console.log('executeStep: wait for model completion success')
    
    return output
  }

  /**
   * Wait for the last model message to finish responding
   * It used before sending message to ensure the last model message has finished responding
   */
  private async waitForLastModelMsgFinish(lastModelMessage: ModelMessage, interval: { ms: number, maxCount: number }) {
    return new Promise<boolean>((res) => {
      const isResponding = isModelRespondingByAvatar(lastModelMessage)
      if (!isResponding) {
        // if not responding, it means the model has finished responding
        return res(true)
      } else {
        // if responding, poll to check if the model has finished responding
        let count = 0;
        const startAt = Date.now();
        console.log('waitForLastModelMsgFinish: model is responding, start polling')
        const intervalId = setInterval(() => {
          const isResponding = isModelRespondingByAvatar(lastModelMessage)
          if (!isResponding) {
            console.log('waitForLastModelMsgFinish: model has finished responding, had waited for', (count + 1) * interval.ms / 1000)
            clearInterval(intervalId)
            res(true)
          }

          // check if the polling has reached the max count
          count++;
          if (count >= interval.maxCount) {
            clearInterval(intervalId)
            console.log('waitForLastModelMsgFinish: polling has reached the max count, had waited for', (Date.now() - startAt) / 1000)
            res(false)
          }
        }, interval.ms)
      }
    })
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
