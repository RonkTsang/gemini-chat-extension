/**
 * Chain Prompt Store
 * UI 状态管理（编辑态、运行态）
 */

import { create } from 'zustand'
import type { ChainPrompt, ChainStep, ChainVariable, RunResult, RunStatus } from '@/domain/chain-prompt/types'

interface EditingState {
  mode: 'create' | 'edit'
  promptId?: string
  name: string
  description: string
  variables: ChainVariable[]
  steps: ChainStep[]
}

/**
 * 单个步骤的运行状态
 */
export interface RunningStepState {
  stepIndex: number
  stepName: string
  stepPrompt: string
  status: 'pending' | 'running' | 'succeeded' | 'failed'
  error?: string
}

/**
 * 整体运行状态
 */
interface RunningState {
  isRunning: boolean
  promptId?: string
  promptName?: string
  currentStepIndex: number
  totalSteps: number
  status: RunStatus
  steps: RunningStepState[]
  result?: RunResult
  abortController?: AbortController
}

interface ChainPromptStore {
  // 编辑态
  editing: EditingState | null
  
  // 运行态
  running: RunningState
  
  // UI 控制
  showRunStatusPanel: boolean
  
  // 搜索
  searchQuery: string
  
  // 编辑操作
  startCreate: () => void
  startEdit: (prompt: ChainPrompt) => void
  updateName: (name: string) => void
  updateDescription: (description: string) => void
  addVariable: () => void
  addVariableFromText: (key: string, defaultValue: string) => void
  updateVariable: (index: number, variable: ChainVariable) => void
  removeVariable: (index: number) => void
  addStep: () => void
  updateStep: (index: number, step: Partial<ChainStep>) => void
  updateSteps: (updates: Array<{ index: number; step: Partial<ChainStep> }>) => void
  removeStep: (index: number) => void
  reorderSteps: (startIndex: number, endIndex: number) => void
  cancelEdit: () => void
  
  // 运行操作
  startRun: (prompt: ChainPrompt) => void
  updateStepStatus: (stepIndex: number, status: RunningStepState['status'], error?: string) => void
  updateStepPrompt: (stepIndex: number, promptText: string) => void
  completeRun: (result: RunResult) => void
  abortRun: () => void
  clearRunStatus: () => void
  
  // UI 控制
  toggleRunStatusPanel: () => void
  
  // 搜索
  setSearchQuery: (query: string) => void
}

export const useChainPromptStore = create<ChainPromptStore>((set) => ({
  editing: null,
  running: {
    isRunning: false,
    currentStepIndex: -1,
    totalSteps: 0,
    status: 'pending',
    steps: []
  },
  showRunStatusPanel: false,
  searchQuery: '',
  
  startCreate: () => set({
    editing: {
      mode: 'create',
      name: '',
      description: '',
      variables: [],
      steps: []
    }
  }),
  
  startEdit: (prompt: ChainPrompt) => set({
    editing: {
      mode: 'edit',
      promptId: prompt.id,
      name: prompt.name,
      description: prompt.description || '',
      variables: [...prompt.variables],
      steps: [...prompt.steps]
    }
  }),
  
  updateName: (name: string) => set((state) => {
    if (!state.editing) return state
    return {
      editing: {
        ...state.editing,
        name
      }
    }
  }),
  
  updateDescription: (description: string) => set((state) => {
    if (!state.editing) return state
    return {
      editing: {
        ...state.editing,
        description
      }
    }
  }),
  
  addVariable: () => set((state) => {
    if (!state.editing) return state
    return {
      editing: {
        ...state.editing,
        variables: [
          ...state.editing.variables,
          { key: '', defaultValue: '' }
        ]
      }
    }
  }),
  
  addVariableFromText: (key: string, defaultValue: string) => set((state) => {
    if (!state.editing) return state
    return {
      editing: {
        ...state.editing,
        variables: [
          ...state.editing.variables,
          { key, defaultValue }
        ]
      }
    }
  }),
  
  updateVariable: (index: number, variable: ChainVariable) => set((state) => {
    if (!state.editing) return state
    const variables = [...state.editing.variables]
    variables[index] = variable
    return {
      editing: {
        ...state.editing,
        variables
      }
    }
  }),
  
  removeVariable: (index: number) => set((state) => {
    if (!state.editing) return state
    return {
      editing: {
        ...state.editing,
        variables: state.editing.variables.filter((_, i) => i !== index)
      }
    }
  }),
  
  addStep: () => set((state) => {
    if (!state.editing) return state
    return {
      editing: {
        ...state.editing,
        steps: [
          ...state.editing.steps,
          { id: `step-${Date.now()}`, prompt: '' }
        ]
      }
    }
  }),
  
  updateStep: (index: number, stepPatch: Partial<ChainStep>) => set((state) => {
    if (!state.editing) return state
    const steps = [...state.editing.steps]
    steps[index] = { ...steps[index], ...stepPatch }
    return {
      editing: {
        ...state.editing,
        steps
      }
    }
  }),
  
  updateSteps: (updates: Array<{ index: number; step: Partial<ChainStep> }>) => set((state) => {
    if (!state.editing) return state
    const steps = [...state.editing.steps]
    
    // Apply all updates in a single batch
    for (const { index, step } of updates) {
      if (index >= 0 && index < steps.length) {
        steps[index] = { ...steps[index], ...step }
      }
    }
    
    return {
      editing: {
        ...state.editing,
        steps
      }
    }
  }),
  
  removeStep: (index: number) => set((state) => {
    if (!state.editing) return state
    return {
      editing: {
        ...state.editing,
        steps: state.editing.steps.filter((_, i) => i !== index)
      }
    }
  }),
  
  reorderSteps: (startIndex: number, endIndex: number) => set((state) => {
    if (!state.editing) return state
    const steps = [...state.editing.steps]
    const [removed] = steps.splice(startIndex, 1)
    steps.splice(endIndex, 0, removed)
    return {
      editing: {
        ...state.editing,
        steps
      }
    }
  }),
  
  cancelEdit: () => set({ editing: null }),
  
  startRun: (prompt: ChainPrompt) => set({
    running: {
      isRunning: true,
      promptId: prompt.id,
      promptName: prompt.name,
      currentStepIndex: 0,
      totalSteps: prompt.steps.length,
      status: 'running',
      abortController: new AbortController(),
      steps: prompt.steps.map((step, index) => ({
        stepIndex: index,
        stepName: step.name || `Step ${index + 1}`,
        stepPrompt: step.prompt,
        status: 'pending' as const
      }))
    },
    showRunStatusPanel: false
  }),
  
  updateStepStatus: (stepIndex, status, error) => set((state) => {
    // 验证步骤索引
    if (stepIndex < 0 || stepIndex >= state.running.steps.length) {
      console.warn(`[ChainPromptStore] Invalid step index: ${stepIndex}`)
      return state
    }
    
    const steps = [...state.running.steps]
    steps[stepIndex] = { ...steps[stepIndex], status, error }
    
    return {
      running: {
        ...state.running,
        currentStepIndex: stepIndex,
        steps,
        status: status === 'running' ? 'running' : state.running.status
      }
    }
  }),
  
  updateStepPrompt: (stepIndex, promptText) => set((state) => {
    if (stepIndex < 0 || stepIndex >= state.running.steps.length) {
      return state
    }
    const steps = [...state.running.steps]
    steps[stepIndex] = { ...steps[stepIndex], stepPrompt: promptText }
    return {
      running: {
        ...state.running,
        steps
      }
    }
  }),
  
  completeRun: (result) => set((state) => ({
    running: {
      ...state.running,
      isRunning: false,
      status: result.status,
      result,
      abortController: undefined
    }
  })),
  
  abortRun: () => set((state) => {
    // 触发中止信号
    state.running.abortController?.abort()
    
    return {
      running: {
        ...state.running,
        isRunning: false,
        status: 'aborted',
        result: {
          status: 'aborted',
          steps: state.running.steps.map((step, idx) => ({
            stepIndex: idx,
            stepId: `step-${idx}`,
            inputPrompt: step.stepPrompt,
            error: step.status === 'failed' ? step.error : undefined
          })),
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString()
        },
        abortController: undefined
      }
    }
  }),
  
  clearRunStatus: () => set((state) => {
    // 清理中止控制器（如果还在运行）
    state.running.abortController?.abort()
    
    return {
      running: {
        isRunning: false,
        currentStepIndex: -1,
        totalSteps: 0,
        status: 'pending',
        steps: [],
        abortController: undefined
      },
      showRunStatusPanel: false
    }
  }),
  
  toggleRunStatusPanel: () => set((state) => ({
    showRunStatusPanel: !state.showRunStatusPanel
  })),
  
  setSearchQuery: (query: string) => set({ searchQuery: query })
}))

// 导出非 React 使用的 actions
export const startRun = (prompt: ChainPrompt) => 
  useChainPromptStore.getState().startRun(prompt)
export const updateStepStatus = (stepIndex: number, status: RunningStepState['status'], error?: string) => 
  useChainPromptStore.getState().updateStepStatus(stepIndex, status, error)
export const completeRun = (result: RunResult) => 
  useChainPromptStore.getState().completeRun(result)
export const abortRun = () => 
  useChainPromptStore.getState().abortRun()
export const clearRunStatus = () => 
  useChainPromptStore.getState().clearRunStatus()


