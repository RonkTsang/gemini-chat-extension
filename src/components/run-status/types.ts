/**
 * Run Status Component Types
 * 运行状态组件的类型定义
 */

export type RunStatusType = 'running' | 'succeeded' | 'failed' | 'aborted' | 'pending'
export type StepStatusType = 'pending' | 'running' | 'succeeded' | 'failed'

export interface RunStatusData {
  promptName: string
  status: RunStatusType
  currentStep: number
  totalSteps: number
  steps: StepData[]
}

export interface StepData {
  stepIndex: number
  stepName: string
  stepPrompt: string
  status: StepStatusType
  error?: string
}

