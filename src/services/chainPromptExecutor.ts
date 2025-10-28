/**
 * Chain Prompt Executor Service
 * 按步骤驱动执行（插入 → 发送 → 等待 → 产出 → 继续）
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
   * 执行 Chain Prompt
   */
  async run(
    params: { prompt: ChainPrompt; variables: Record<string, string> },
    options: ExecutionOptions = {}
  ): Promise<RunResult> {
    const { prompt, variables } = params
    const { chatWindow, abortSignal, onStepStart, onStepComplete, onStepError } = options
    
    const runId = `${prompt.id}-${Date.now()}`
    // 使用外部提供的 abortSignal，或创建新的
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
      // 按顺序执行每个步骤
      for (let i = 0; i < prompt.steps.length; i++) {
        // 检查是否已中止
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
          // 渲染模板
          const { prompt: renderedPrompt } = templateEngine.renderWithValidation(step.prompt, context, i)
          stepResult.inputPrompt = renderedPrompt
          // 将渲染后的 prompt 同步到 UI（用以替换 {{variable}} 展示）
          try {
            useChainPromptStore.getState().updateStepPrompt?.(i, renderedPrompt)
          } catch {}
          
          onStepStart?.(i, stepName, renderedPrompt)
          
          // 执行步骤：插入 → 发送 → 等待
          const output = await this.executeStep(renderedPrompt, chatWindow, effectiveSignal)
          
          stepResult.outputText = output
          context.stepOutputs.set(i, output)
          
          onStepComplete?.(i, output)
        } catch (error) {
          // 检查是否为中止错误
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
   * 执行单个步骤
   */
  private async executeStep(
    prompt: string, 
    chatWindow: Element | undefined, 
    signal: AbortSignal
  ): Promise<string> {
    // 1. 插入 prompt 到编辑器
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
    
    // 2. 发送消息
    const sent = await tryToSendMessage();
    if (!sent.success) {
      throw new Error(`Failed to send message, reason: ${sent.reason}`)
    }
    
    // 3. 等待模型完成响应
    const output = await this.waitForModelCompletion(chatWindow, signal)
    
    return output
  }

  /**
   * 等待模型完成响应
   */
  private async waitForModelCompletion(
    chatWindow: Element | undefined, 
    signal: AbortSignal
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      let cleanup: (() => void) | null = null
      let isResponding = false
      
      // 处理中止
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
      
      // 监听模型状态变化
      cleanup = createModelStatusListener((status) => {
        if (status.isResponding) {
          // 模型开始响应
          isResponding = true
        } else if (isResponding && !status.isResponding) {
          // 模型完成响应
          cleanup?.()
          signal.removeEventListener('abort', handleAbort)
          
          // 获取最后一条消息（模型的回复）
          const output = this.getLatestModelResponse(chatWindow)
          if (output) {
            resolve(output)
          } else {
            reject(new Error('Failed to get model response'))
          }
        }
      }, chatWindow)
      
      // 设置超时（5分钟）
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
   * 获取最新的模型响应
   */
  private getLatestModelResponse(chatWindow?: Element): string | null {
    const container = chatWindow || document
    
    // 查找所有模型消息容器
    const modelMessages = container.querySelectorAll('model-response')
    
    if (modelMessages.length === 0) {
      return null
    }
    
    // 获取最后一条消息
    const latestMessage = modelMessages[modelMessages.length - 1]
    
    // 提取文本内容
    const textContent = latestMessage.textContent?.trim() || null
    
    return textContent
  }


  /**
   * 中止执行
   */
  abort(runId: string): void {
    const controller = this.activeExecutions.get(runId)
    if (controller) {
      controller.abort()
    }
  }

  /**
   * 工具函数：sleep
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

export const chainPromptExecutor = new ChainPromptExecutor()


