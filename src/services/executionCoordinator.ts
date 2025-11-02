/**
 * Execution Coordinator
 * 负责协调 Chain Prompt 执行与外部状态管理
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
   * 开始执行 Chain Prompt
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

    // 生成执行 ID
    this.currentRunId = `${prompt.id}-${Date.now()}`
    this.isExecuting = true

    // 设置聊天切换监听
    if (enableUrlMonitoring) {
      this.setupChatChangeMonitoring(onExecutionAborted)
    }

    try {
      // 执行 Chain Prompt
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
      // 清理资源
      this.cleanup()
    }
  }

  /**
   * 中止执行
   */
  abortExecution(): void {
    if (this.currentRunId) {
      chainPromptExecutor.abort(this.currentRunId)
    }
    this.cleanup()
  }

  /**
   * 设置聊天切换监听
   */
  private setupChatChangeMonitoring(onExecutionAborted?: (reason: string) => void): void {
    // 监听聊天切换事件
    const handleChatChange = (eventData: ChatChangeEvent) => {
      if (this.isExecuting) {
        if (eventData.isFromNewChat) {
          return;
        }
        console.warn('[ExecutionCoordinator] Chat switched during execution, aborting...', eventData)
        
        // 中止执行
        this.abortExecution()
        
        // 发出聊天切换中止事件，让 UI 层处理
        eventBus.emit('execution:aborted-by-chat-switch', {
          reason: 'chat_switched',
          originalUrl: eventData.originalUrl,
          currentUrl: eventData.currentUrl,
          timestamp: eventData.timestamp
        })

        // 通知外部
        onExecutionAborted?.(`Chat switched: ${eventData.originalUrl} -> ${eventData.currentUrl}`)
      }
    }

    // 监听事件总线
    eventBus.on('chatchange', handleChatChange)
  }



  /**
   * 清理资源
   */
  private cleanup(): void {
    // 停止聊天切换监听
    if (this.unsubscribeChatChange) {
      this.unsubscribeChatChange()
      this.unsubscribeChatChange = null
    }
    
    this.currentRunId = null
    this.isExecuting = false
  }
}

// 全局实例
export const executionCoordinator = new ExecutionCoordinator()


