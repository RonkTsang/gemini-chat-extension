/**
 * Chain Prompt Domain Types
 * 定义链式提示词的核心领域模型
 */

export interface ChainVariable {
  key: string
  defaultValue?: string
}

export interface ChainStep {
  id: string
  name?: string
  prompt: string
}

export interface ChainPrompt {
  id: string
  name: string
  description?: string
  createdAt: string
  updatedAt: string
  variables: ChainVariable[]
  steps: ChainStep[]
}

// 运行时状态（页面级内存态，不持久化）
export type RunStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'aborted'

export interface RunResultStep {
  stepIndex: number
  stepId: string
  inputPrompt: string
  outputText?: string
  error?: string
}

export interface RunResult {
  status: RunStatus
  steps: RunResultStep[]
  startedAt: string
  finishedAt?: string
}

export interface RunContext {
  promptId: string
  variables: Record<string, string>
  stepOutputs: Map<number, string>
  abortController: AbortController
}


