/**
 * Run Status Component Types
 * Type definitions for run status components
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

