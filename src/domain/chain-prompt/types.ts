/**
 * Chain Prompt Domain Types
 * Define core domain model for chained prompts
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

// Runtime state (page-level in-memory state, not persisted)
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


