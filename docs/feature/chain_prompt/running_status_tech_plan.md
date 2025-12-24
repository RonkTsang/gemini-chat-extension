# Chain Prompt 运行状态展示 - 技术方案

## 1. 需求背景

当前用户点击 Chain Prompt 执行后，停留在 RunModal 页面无法看到 Gemini 聊天界面的执行过程，体验不佳。需要实现运行状态展示组件，让用户能够：
1. 看到 Gemini 聊天界面
2. 实时查看 Chain Prompt 执行状态
3. 查看详细的步骤执行信息

参考：[PRD v2](./prd_v2.md) | [交互稿](./running_status.png)

---

## 2. 架构设计

### 2.1 组件层次结构

```
Content Script (overlay)
  └── RunStatusContainer (容器组件)
      ├── SimpleRunStatus (简要状态指示器)
      └── RunStatusPanel (详细状态面板 - 条件渲染)
```

### 2.2 文件结构（更新：与 overlay 复用同一 JS 上下文）

```
src/
  components/
    run-status/                          # 新增目录
      SimpleRunStatus.tsx                # 简要状态指示器
      RunStatusPanel.tsx                 # 详细状态面板
      index.tsx                          # 容器组件（入口）
      types.ts                           # 类型定义
  
  entrypoints/
    content/
      overlay/
        index.tsx                        # 保持不变，仅负责设置面板等 Overlay UI
      status/
        index.tsx                        # 新增：运行状态挂载管理（同一 JS 上下文）
  
  stores/
    chainPromptStore.ts                  # 修改：增强运行态管理
  
  services/
    chainPromptExecutor.ts               # 已有：执行引擎（可能需微调）
```

---

## 3. 核心技术实现

### 3.1 状态管理扩展

#### 3.1.1 扩展 `chainPromptStore.ts`

**新增状态字段：**

```typescript
interface RunningState {
  isRunning: boolean
  promptId?: string
  promptName?: string              // 新增：Prompt 名称
  currentStepIndex: number          // 修改：默认 -1
  totalSteps: number                // 新增：总步数
  status: 'running' | 'succeeded' | 'failed' | 'idle'  // 新增：运行状态
  steps: RunningStepState[]         // 新增：各步骤状态
  result?: RunResult
  abortController?: AbortController // 新增：中止控制器
}

interface RunningStepState {
  stepIndex: number
  stepName: string
  stepPrompt: string
  status: 'pending' | 'running' | 'succeeded' | 'failed'
  error?: string
}

interface RunResult {
  status: 'succeeded' | 'failed'
  error?: string
  executionTime?: number
  completedSteps: number
  totalSteps: number
}
```

**新增 Actions：**

```typescript
interface ChainPromptStore {
  // ... 现有字段 ...
  
  // 运行状态控制
  startRun: (prompt: ChainPrompt) => void           // 修改：接收完整 prompt
  updateStepStatus: (stepIndex: number, status: RunningStepState['status'], error?: string) => void
  completeRun: (result: RunResult) => void
  abortRun: () => void                              // 新增：中止执行
  clearRunStatus: () => void                        // 新增：清除状态
  
  // UI 控制
  showRunStatusPanel: boolean                       // 新增：控制面板显示
  toggleRunStatusPanel: () => void                  // 新增：切换面板
}
```

**实现示例：**

```typescript
export const useChainPromptStore = create<ChainPromptStore>((set, get) => ({
  // ... 现有状态 ...
  
  running: {
    isRunning: false,
    currentStepIndex: -1,
    totalSteps: 0,
    status: 'idle',
    steps: []
  },
  
  showRunStatusPanel: false,
  
  startRun: (prompt: ChainPrompt) => set({
    running: {
      isRunning: true,
      promptId: prompt.id,
      promptName: prompt.name,
      currentStepIndex: 0,
      totalSteps: prompt.steps.length,
      status: 'running',
      abortController: new AbortController(),  // 创建中止控制器
      steps: prompt.steps.map((step, index) => ({
        stepIndex: index,
        stepName: step.name || `Step ${index + 1}`,
        stepPrompt: step.prompt,
        status: 'pending'
      }))
    },
    showRunStatusPanel: false  // 开始时关闭面板
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
  
  completeRun: (result) => set((state) => ({
    running: {
      ...state.running,
      isRunning: false,
      status: result.status as 'succeeded' | 'failed',
      result,
      abortController: undefined  // 清除控制器
    }
  })),
  
  abortRun: () => set((state) => {
    // 触发中止信号
    state.running.abortController?.abort()
    
    return {
      running: {
        ...state.running,
        isRunning: false,
        status: 'failed',
        result: {
          status: 'failed',
          error: 'Execution aborted by user',
          completedSteps: state.running.currentStepIndex,
          totalSteps: state.running.totalSteps
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
        status: 'idle',
        steps: [],
        abortController: undefined
      },
      showRunStatusPanel: false
    }
  }),
  
  toggleRunStatusPanel: () => set((state) => ({
    showRunStatusPanel: !state.showRunStatusPanel
  }))
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
```

---

### 3.2 执行引擎集成

#### 3.2.1 修改 `chainPromptExecutor.ts`

**增强回调接口：**

```typescript
export interface ExecutionOptions {
  chatWindow?: Element
  abortSignal?: AbortSignal  // 新增：中止信号
  onStepStart?: (stepIndex: number, stepName: string, prompt: string) => void
  onStepComplete?: (stepIndex: number, output: string) => void
  onStepError?: (stepIndex: number, error: string) => void
}
```

**执行时更新状态：**

```typescript
// 在 run() 方法中
for (let i = 0; i < prompt.steps.length; i++) {
  const step = prompt.steps[i]
  
  // 检查中止信号
  if (abortSignal?.aborted) {
    throw new Error('Execution aborted by user')
  }
  
  try {
    // 开始步骤
    onStepStart?.(i, step.name || `Step ${i + 1}`, step.prompt)
    
    // 渲染模板
    const renderedPrompt = templateEngine.render(step.prompt, context, i)
    
    // 执行步骤（传入中止信号）
    const output = await this.executeStep(renderedPrompt, chatWindow, abortSignal)
    
    // 完成步骤
    onStepComplete?.(i, output)
    
  } catch (error) {
    // 检查是否为中止错误
    if (error.name === 'AbortError' || abortSignal?.aborted) {
      onStepError?.(i, 'Execution aborted by user')
      throw error
    }
    // 其他错误处理
    onStepError?.(i, errorMessage)
  }
}
```

---

### 3.3 UI 组件实现

#### 3.3.1 类型定义 (`components/run-status/types.ts`)

```typescript
export type RunStatusType = 'running' | 'succeeded' | 'failed' | 'idle'
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

export interface RunResult {
  status: 'succeeded' | 'failed'
  error?: string
  executionTime?: number
  completedSteps: number
  totalSteps: number
}
```

---

#### 3.3.2 简要状态指示器 (`SimpleRunStatus.tsx`)

**位置：** Gemini 消息输入框上方（直接 DOM 挂载，非 Portal）

**功能：**
- 显示执行状态（进度圈/成功图标/失败图标）
- 显示 Prompt 名称和进度
- 点击展开详细面板
- Hover 效果（cursor: pointer）

**实现：**

```typescript
import React from 'react'
import { Box, Flex, IconButton, Text } from '@chakra-ui/react'
import { ProgressCircle } from '@/components/ui/progress-circle'
import { LuCheck, LuX } from 'react-icons/lu'
import { useChainPromptStore } from '@/stores/chainPromptStore'

export const SimpleRunStatus: React.FC = () => {
  const { running, showRunStatusPanel, toggleRunStatusPanel, clearRunStatus, abortRun } = useChainPromptStore()
  
  if (running.status === 'idle') {
    return null
  }
  
  const { promptName, status, currentStepIndex, totalSteps, steps } = running
  
  // 计算已完成的步骤数
  const completedSteps = steps.filter(s => s.status === 'succeeded').length
  const progress = totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0
  
  const renderStatusIcon = () => {
    switch (status) {
      case 'running':
        return (
          <ProgressCircle.Root 
            value={progress}
            size="sm"
            css={{
              '--progress-track-color': 'var(--gem-sys-color--surface-container)',
              '--progress-fill-color': 'var(--gem-sys-color--on-primary-container)'
            }}
          >
            <ProgressCircle.Circle strokeLinecap="round" />
          </ProgressCircle.Root>
        )
      
      case 'succeeded':
        return (
          <IconButton
            aria-label="Success"
            variant="solid"
            colorPalette="green"
            borderRadius="full"
            size="sm"
            pointerEvents="none"
          >
            <LuCheck />
          </IconButton>
        )
      
      case 'failed':
        return (
          <IconButton
            aria-label="Failed"
            variant="solid"
            colorPalette="red"
            borderRadius="full"
            size="sm"
            pointerEvents="none"
          >
            <LuX />
          </IconButton>
        )
      
      default:
        return null
    }
  }
  
  const getStatusText = () => {
    switch (status) {
      case 'running':
        return `${promptName} is running (${currentStepIndex + 1}/${totalSteps})`
      case 'succeeded':
        return `${promptName} is success`
      case 'failed':
        return `${promptName} failed`
      default:
        return promptName
    }
  }
  
  return (
    <Flex
      align="center"
      gap={3}
      px={4}
      py={2}
      bg="bg.panel"
      borderRadius="lg"
      border="1px solid"
      borderColor="border"
      cursor="pointer"
      onClick={toggleRunStatusPanel}
      _hover={{ 
        borderColor: 'border.emphasized',
        bg: 'bg.subtle'
      }}
      transition="all 0.2s"
    >
      {renderStatusIcon()}
      
      <Text flex={1} fontSize="sm" fontWeight="medium">
        {getStatusText()}
      </Text>
      
      {status === 'running' && (
        <IconButton
          aria-label="Stop execution"
          variant="ghost"
          size="xs"
          colorPalette="red"
          onClick={(e) => {
            e.stopPropagation()
            abortRun()
          }}
        >
          <LuX />
        </IconButton>
      )}
      
      {(status === 'succeeded' || status === 'failed') && (
        <IconButton
          aria-label="Close"
          variant="ghost"
          size="xs"
          onClick={(e) => {
            e.stopPropagation()
            clearRunStatus()
          }}
        >
          <LuX />
        </IconButton>
      )}
    </Flex>
  )
}
```

---

#### 3.3.3 详细状态面板 (`RunStatusPanel.tsx`)

**位置：** SimpleRunStatus 上方（绝对定位）

**功能：**
- 显示 Prompt 名称
- Timeline 展示各步骤状态
- 每个步骤显示：状态图标、名称、Prompt（最多 3 行）

**实现：**

```typescript
import React from 'react'
import { Box, Text, VStack } from '@chakra-ui/react'
import { Timeline } from '@/components/ui/timeline'  // Chakra UI v3 Timeline 组件
import { LuCheck, LuX, LuLoader2, LuCircle } from 'react-icons/lu'
import { useChainPromptStore } from '@/stores/chainPromptStore'

export const RunStatusPanel: React.FC = () => {
  const { running, showRunStatusPanel } = useChainPromptStore()
  
  if (!showRunStatusPanel || running.status === 'idle') {
    return null
  }
  
  const getStepIcon = (status: string) => {
    switch (status) {
      case 'succeeded':
        return <LuCheck color="var(--chakra-colors-green-fg)" />
      case 'failed':
        return <LuX color="var(--chakra-colors-red-fg)" />
      case 'running':
        // 使用 Chakra UI 的 CSS 动画而非 Tailwind 的 animate-spin
        return (
          <Box 
            as={LuLoader2} 
            color="var(--chakra-colors-blue-fg)"
            animation="spin 1s linear infinite"
          />
        )
      case 'pending':
        return <LuCircle color="var(--chakra-colors-fg-muted)" />
      default:
        return null
    }
  }
  
  const getIndicatorColor = (status: string) => {
    switch (status) {
      case 'succeeded': return 'green.solid'
      case 'failed': return 'red.solid'
      case 'running': return 'blue.solid'
      case 'pending': return 'gray.300'
      default: return 'gray.300'
    }
  }
  
  return (
    <Box
      position="absolute"
      bottom="calc(100% + 8px)"
      left={0}
      right={0}
      bg="bg.panel"
      border="1px solid"
      borderColor="border"
      borderRadius="lg"
      p={4}
      shadow="lg"
      maxH="400px"
      overflowY="auto"
    >
      <VStack align="stretch" gap={4}>
        {/* Header */}
        <Box>
          <Text fontWeight="bold" fontSize="md">
            {running.promptName}
          </Text>
        </Box>
        
        {/* Steps Timeline */}
        <Timeline.Root size="sm" variant="subtle">
          {running.steps.map((step, index) => (
            <Timeline.Item key={step.stepIndex}>
              <Timeline.Connector>
                <Timeline.Separator />
                <Timeline.Indicator bg={getIndicatorColor(step.status)}>
                  {getStepIcon(step.status)}
                </Timeline.Indicator>
              </Timeline.Connector>
              
              <Timeline.Content pb={index === running.steps.length - 1 ? 0 : 3}>
                <Timeline.Title fontSize="sm" fontWeight="medium" mb={1}>
                  {step.stepName}
                </Timeline.Title>
                
                <Text 
                  fontSize="xs" 
                  color="fg.muted"
                  lineClamp={3}
                  whiteSpace="pre-wrap"
                >
                  {step.stepPrompt}
                </Text>
                
                {step.error && (
                  <Text fontSize="xs" color="red.fg" mt={1}>
                    Error: {step.error}
                  </Text>
                )}
              </Timeline.Content>
            </Timeline.Item>
          ))}
        </Timeline.Root>
      </VStack>
    </Box>
  )
}
```

---

#### 3.3.4 挂载管理（`entrypoints/content/status/index.tsx`）

**功能：**
- 负责查找输入框容器并在其上方创建挂载点
- 使用 React `createRoot` 渲染到页面 DOM（保持与 overlay 同一 JS 上下文）
- 监听 DOM 变更（例如“新建聊天”导致容器替换）并自动重挂载

**实现：**

```typescript
import { createRoot, type Root } from 'react-dom/client'
import { Provider } from '@/components/ui/provider-shadow-dom'
import { RunStatusContainer } from '@/components/run-status'

let root: Root | null = null
let mountEl: HTMLDivElement | null = null
let domObserver: MutationObserver | null = null

const selectors = [
  'rich-textarea',
  '.input-area-container',
  '[data-test-id="input-container"]'
]

function findInputContainer(): HTMLElement | null {
  for (const s of selectors) {
    const el = document.querySelector(s) as HTMLElement | null
    if (el) return el.parentElement ?? el
  }
  return null
}

function ensureDomObserver() {
  if (domObserver) return
  domObserver = new MutationObserver(() => {
    if (!mountEl || !mountEl.isConnected) {
      mountRunStatusUI(true)
    }
  })
  domObserver.observe(document.body, { childList: true, subtree: true })
}

export function mountRunStatusUI(remount = false) {
  const container = findInputContainer()
  if (!container) return
  if (root && !remount) return
  if (remount) unmountRunStatusUI()

  mountEl = document.createElement('div')
  mountEl.id = 'gemini-wxt-run-status'
  mountEl.style.cssText = 'position:relative;margin-bottom:8px;z-index:1000;'
  container.insertBefore(mountEl, container.firstChild)

  root = createRoot(mountEl)
  root.render(
    <Provider>
      <RunStatusContainer />
    </Provider>
  )

  ensureDomObserver()
}

export function unmountRunStatusUI() {
  root?.unmount()
  root = null
  mountEl?.remove()
  mountEl = null
}
```

---

### 3.4 集成到 Content Script（与 overlay 复用同一上下文）

无需新增 content script，也无需改动 overlay 入口。通过调用挂载管理器在“开始执行”时挂载：

```typescript
// 在 store 的 startRun 或 RunModal 的 executeChainPrompt 中：
import { mountRunStatusUI } from '@/entrypoints/content/status'

startRun(prompt)
onClose()          // 关闭 RunModal，让用户看到页面
mountRunStatusUI() // 在输入框上方挂载运行状态 UI
```

---

### 3.5 修改 RunModal 执行流程

#### 3.5.1 更新 `RunModal.tsx`

**关键修改：**

```typescript
import { startRun, updateStepStatus, completeRun } from '@/stores/chainPromptStore'

const executeChainPrompt = async () => {
  setIsExecuting(true)
  
  // 1. 初始化运行状态
  startRun(prompt)
  
  // 2. 关闭所有弹窗（等待动画完成以避免闪烁）
  onClose()  // 关闭 RunModal
  // 如果 setting-panel 打开，也需要关闭（通过 store）
  await new Promise(resolve => setTimeout(resolve, 150))  // 等待关闭动画
  
  // 3. 挂载运行状态 UI
  await mountRunStatusUI()
  
  try {
    // 获取中止信号
    const abortSignal = useChainPromptStore.getState().running.abortController?.signal
    
    const result = await chainPromptExecutor.run(
      { prompt, variables: variableValues },
      {
        abortSignal,  // 传入中止信号
        onStepStart: (stepIndex, stepName, promptText) => {
          updateStepStatus(stepIndex, 'running')
        },
        onStepComplete: (stepIndex, output) => {
          updateStepStatus(stepIndex, 'succeeded')
        },
        onStepError: (stepIndex, error) => {
          updateStepStatus(stepIndex, 'failed', error)
        }
      }
    )
    
    completeRun(result)
    
    // 3. 成功后显示 toast（可选）
    if (result.status === 'succeeded') {
      toaster.create({
        title: 'Chain prompt completed',
        type: 'success',
        duration: 3000
      })
    }
  } catch (error) {
    // 错误处理
  } finally {
    setIsExecuting(false)
  }
}
```

---

## 4. 技术细节

### 4.1 定位策略

**输入框容器查找：**

```typescript
// 优先级顺序
const selectors = [
  'rich-textarea',                    // 主输入框
  '.input-area-container',            // 输入区容器
  '[data-test-id="input-container"]', // 测试 ID
]

const findInputContainer = (): Element | null => {
  for (const selector of selectors) {
    const el = document.querySelector(selector)
    if (el) return el.parentElement || el
  }
  return null
}
```

**直接 DOM 挂载位置：**

```typescript
const input = findInputContainer() // 见上文 selectors
const mountEl = document.createElement('div')
mountEl.id = 'gemini-wxt-run-status'
mountEl.style.cssText = 'position:relative;margin-bottom:8px;z-index:1000;'
input.insertBefore(mountEl, input.firstChild)

const root = createRoot(mountEl)
root.render(
  <Provider>
    <RunStatusContainer />
  </Provider>
)
```

#### 4.1.1 更稳健的查找与挂载（基于 docs/dom/input.html）

为适配 Gemini 输入区在不同状态/语言/重渲染场景下的 DOM 差异，采用“语义优先 + 回退链 + 作用域限定”的策略：

- 作用域限定：先限定到当前聊天窗口（`chat-window`），避免历史侧栏/其他容器干扰。
- 语义优先：优先使用语义稳定的自定义标签与 `data-node-type` 属性，少依赖类名。
- 回退链：`[data-node-type="input-area"]` → `rich-textarea` 向上寻祖 → 发送按钮 `aria-label` 向上寻祖。
- 自动恢复：监听 DOM 替换（“新建聊天”“模型重渲染”）并重挂载。

实现代码：

```typescript
import { getDefaultChatWindow } from '@/utils/messageUtils'
import { createRoot, type Root } from 'react-dom/client'
import { Provider } from '@/components/ui/provider-shadow-dom'
import { RunStatusContainer } from '@/components/run-status'

type MountResult = { mountEl: HTMLDivElement; root: Root } | null

// 语义优先的选择器链（与 docs/dom/input.html 对齐）
const INPUT_SELECTORS = [
  'input-container input-area-v2 [data-node-type="input-area"]',
  'input-container [data-node-type="input-area"]',
  '[data-node-type="input-area"]',
]

function findInputAreaRoot(scope: ParentNode): HTMLElement | null {
  // 1) 语义化选择器优先
  for (const s of INPUT_SELECTORS) {
    const el = scope.querySelector(s) as HTMLElement | null
    if (el) return el
  }
  // 2) 回退：基于 rich-textarea 向上找最近输入区容器
  const rta = scope.querySelector('rich-textarea') as HTMLElement | null
  if (rta) {
    const byAttr = rta.closest<HTMLElement>('[data-node-type="input-area"]')
    if (byAttr) return byAttr
    const byClass = rta.closest<HTMLElement>('.text-input-field')
    if (byClass) return byClass
  }
  // 3) 最末回退：基于发送/停止按钮的 aria-label
  const sendBtn = scope.querySelector(
    'button[aria-label="Send message"], button[aria-label="Stop response"]'
  ) as HTMLElement | null
  if (sendBtn) {
    const container = sendBtn.closest<HTMLElement>('[data-node-type="input-area"]')
      ?? sendBtn.closest<HTMLElement>('.text-input-field')
    if (container) return container
  }
  return null
}

let statusRoot: Root | null = null
let statusMountEl: HTMLDivElement | null = null
let statusObserver: MutationObserver | null = null

// DOM 查找重试辅助函数
async function findInputAreaRootWithRetry(
  scope: ParentNode,
  maxRetries = 3,
  delay = 300
): Promise<HTMLElement | null> {
  for (let i = 0; i < maxRetries; i++) {
    const el = findInputAreaRoot(scope)
    if (el) return el
    
    if (i < maxRetries - 1) {
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }
  return null
}

export async function mountRunStatusUI(remount = false): Promise<MountResult> {
  const chatScope = getDefaultChatWindow() ?? document
  
  // 使用重试机制查找输入区（适应 SPA 导航延迟）
  const inputRoot = await findInputAreaRootWithRetry(chatScope)
  if (!inputRoot) {
    console.warn('[RunStatus] Input area not found after retries')
    return null
  }

  if (statusRoot && !remount) return { mountEl: statusMountEl!, root: statusRoot }
  if (remount) unmountRunStatusUI()

  statusMountEl = document.createElement('div')
  statusMountEl.id = 'gemini-wxt-run-status'
  statusMountEl.style.cssText = 'position:relative;margin-bottom:8px;z-index:1000;'
  inputRoot.insertBefore(statusMountEl, inputRoot.firstChild)

  statusRoot = createRoot(statusMountEl)
  statusRoot.render(
    <Provider>
      <RunStatusContainer />
    </Provider>
  )

  ensureStatusObserver()
  return { mountEl: statusMountEl, root: statusRoot }
}

export function unmountRunStatusUI() {
  // 清理防抖定时器
  if (remountTimeout) {
    clearTimeout(remountTimeout)
    remountTimeout = null
  }
  
  // 卸载 React 组件
  statusRoot?.unmount()
  statusRoot = null
  
  // 移除 DOM 元素
  statusMountEl?.remove()
  statusMountEl = null
  
  // 断开观察器
  statusObserver?.disconnect()
  statusObserver = null
}

// 扩展生命周期：监听扩展卸载/禁用
if (typeof browser !== 'undefined' && browser.runtime?.onSuspend) {
  browser.runtime.onSuspend.addListener(() => {
    unmountRunStatusUI()
  })
}

// 防抖辅助函数
let remountTimeout: NodeJS.Timeout | null = null

function ensureStatusObserver() {
  if (statusObserver) return
  
  statusObserver = new MutationObserver(() => {
    const chatScope = getDefaultChatWindow() ?? document
    const currentRoot = findInputAreaRoot(chatScope)
    
    // 输入区被替换或挂载点脱离了当前输入区 → 重挂载
    if (!currentRoot || !statusMountEl || !statusMountEl.isConnected || !currentRoot.contains(statusMountEl)) {
      // 防抖：避免频繁重挂载
      if (remountTimeout) clearTimeout(remountTimeout)
      remountTimeout = setTimeout(() => {
        mountRunStatusUI(true)
        remountTimeout = null
      }, 100)
    }
  })
  
  // 优化：只观察聊天窗口范围，而非整个 document.body
  const chatScope = getDefaultChatWindow()
  const observeTarget = chatScope ?? document.body
  statusObserver.observe(observeTarget, { 
    childList: true, 
    subtree: true 
  })
}
```

说明：
- 主路径完全依赖 `input-container`、`input-area-v2` 与 `data-node-type="input-area"`，对主题/语言友好；
- `rich-textarea` 回退保证即便结构变化仍可定位；
- 发送/停止按钮 `aria-label` 回退仅作末级兜底（i18n 可能变化），不会影响主要路径稳定性；
- 通过 `getDefaultChatWindow()` 作用域限定到当前聊天窗口，避免侧栏/历史元素误选；
- `MutationObserver` 保障“新建聊天/模型重渲染”等 DOM 替换后自动重挂载。

---

### 4.2 动画与交互

**SimpleRunStatus Hover 效果：**

```typescript
<Flex
  transition="all 0.2s"
  cursor="pointer"
  _hover={{
    borderColor: 'border.emphasized',
    bg: 'bg.subtle',
    transform: 'translateY(-1px)',
    shadow: 'sm'
  }}
  onClick={togglePanel}
>
```

**RunStatusPanel 展开动画：**

```typescript
// 使用 Chakra UI Collapsible 或 CSS transition
<Box
  opacity={showPanel ? 1 : 0}
  transform={showPanel ? 'translateY(0)' : 'translateY(10px)'}
  transition="all 0.2s"
  pointerEvents={showPanel ? 'auto' : 'none'}
>
```

---

### 4.3 ProgressCircle 配置

**Chakra UI v3 ProgressCircle：**

```typescript
<ProgressCircle.Root 
  value={progress}
  size="sm"
  colorPalette="blue"
>
  <ProgressCircle.Circle 
    strokeLinecap="round"
    css={{
      '--circle-track-color': 'var(--chakra-colors-bg-muted)',
      '--circle-range-color': 'var(--chakra-colors-blue-solid)'
    }}
  />
</ProgressCircle.Root>
```

---

### 4.4 状态同步

**执行引擎 → Store → UI 数据流：**

```
chainPromptExecutor.run()
  ↓ (onStepStart)
updateStepStatus(index, 'running')
  ↓
useChainPromptStore updates
  ↓
React components re-render
  ↓
UI reflects current status
```

---

## 5. 错误处理

### 5.1 输入框未找到

```typescript
if (!inputBoxContainer) {
  console.warn('[RunStatus] Input container not found')
  return null
}
```

### 5.2 状态不一致

```typescript
// 在 startRun 时重置状态
startRun: (prompt) => set({
  running: {
    isRunning: true,
    // ... 完整初始化
  },
  showRunStatusPanel: false  // 确保关闭
})
```

### 5.3 执行中断

```typescript
// 监听页面卸载
useEffect(() => {
  const handleUnload = () => {
    if (running.isRunning) {
      // 保存状态或清理
      clearRunStatus()
    }
  }
  
  window.addEventListener('beforeunload', handleUnload)
  return () => window.removeEventListener('beforeunload', handleUnload)
}, [running.isRunning])
```

---

## 6. 样式与主题

### 6.1 颜色方案

```typescript
// 使用 Chakra UI semantic tokens
const colors = {
  running: 'blue.solid',
  succeeded: 'green.solid',
  failed: 'red.solid',
  pending: 'gray.300',
  
  background: 'bg.panel',
  border: 'border',
  text: 'fg.default',
  textMuted: 'fg.muted'
}
```

### 6.1.1 动画定义

需要在 Chakra UI 主题中添加 spin 动画（用于加载图标）：

```typescript
// src/components/ui/theme.ts
import { createSystem, defaultConfig } from '@chakra-ui/react'

export const system = createSystem(defaultConfig, {
  theme: {
    keyframes: {
      spin: {
        from: { transform: 'rotate(0deg)' },
        to: { transform: 'rotate(360deg)' }
      }
    }
  }
})
```

### 6.2 尺寸规范

```typescript
const sizes = {
  simpleStatus: {
    height: '40px',
    padding: '8px 16px',
    iconSize: 'sm'  // 24px
  },
  
  panel: {
    maxHeight: '400px',
    padding: '16px',
    gap: '16px'
  },
  
  step: {
    fontSize: 'sm',    // 14px
    promptLines: 3,
    gap: '12px'
  }
}
```

---

## 7. 国际化支持

### 7.1 文案配置

**新增到 `src/locales/en.json`：**

```json
{
  "runStatus": {
    "running": "{name} is running ({current}/{total})",
    "succeeded": "{name} succeeded",
    "failed": "{name} failed",
    "stepPending": "Pending",
    "stepRunning": "Running...",
    "stepSucceeded": "Completed",
    "stepFailed": "Failed"
  }
}
```

**使用：**

```typescript
import { useI18n } from '@/utils/i18n'

const { t } = useI18n()

const statusText = t('runStatus.running', {
  name: promptName,
  current: currentStep + 1,
  total: totalSteps
})
```

---

## 8. 可访问性 (Accessibility)

### 8.1 ARIA 属性

为运行状态组件添加完整的 ARIA 支持：

```typescript
// SimpleRunStatus.tsx
<Flex
  role="status"
  aria-live="polite"
  aria-atomic="true"
  aria-label={`Chain prompt execution status: ${getStatusText()}`}
  // ... 其他属性
>
```

```typescript
// RunStatusPanel.tsx
<Box
  role="dialog"
  aria-labelledby="run-status-title"
  aria-describedby="run-status-steps"
  // ... 其他属性
>
  <Text id="run-status-title" fontWeight="bold">
    {running.promptName}
  </Text>
  
  <Box id="run-status-steps">
    {/* Timeline 内容 */}
  </Box>
</Box>
```

### 8.2 键盘导航

添加键盘快捷键支持：

```typescript
// 在 RunStatusContainer 中添加
import { useEffect } from 'react'

export const RunStatusContainer: React.FC = () => {
  const { showRunStatusPanel, toggleRunStatusPanel, abortRun, running } = useChainPromptStore()
  
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // ESC 键关闭面板
      if (e.key === 'Escape' && showRunStatusPanel) {
        e.preventDefault()
        toggleRunStatusPanel()
      }
      
      // Ctrl/Cmd + Shift + S 停止执行
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'S' && running.isRunning) {
        e.preventDefault()
        abortRun()
      }
    }
    
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showRunStatusPanel, running.isRunning])
  
  return (
    <>
      <SimpleRunStatus />
      {showRunStatusPanel && <RunStatusPanel />}
    </>
  )
}
```

### 8.3 焦点管理

确保面板展开时焦点正确移动：

```typescript
// RunStatusPanel.tsx
import { useRef, useEffect } from 'react'

export const RunStatusPanel: React.FC = () => {
  const panelRef = useRef<HTMLDivElement>(null)
  const { showRunStatusPanel } = useChainPromptStore()
  
  useEffect(() => {
    if (showRunStatusPanel && panelRef.current) {
      // 面板展开时，将焦点移到面板
      panelRef.current.focus()
    }
  }, [showRunStatusPanel])
  
  return (
    <Box
      ref={panelRef}
      tabIndex={-1}
      // ... 其他属性
    >
      {/* 内容 */}
    </Box>
  )
}
```

### 8.4 屏幕阅读器支持

为状态变化添加实时通知：

```typescript
// 在 store 中添加状态变化公告
updateStepStatus: (stepIndex, status, error) => set((state) => {
  // ... 现有逻辑 ...
  
  // 状态变化公告（用于屏幕阅读器）
  const step = state.running.steps[stepIndex]
  if (status === 'succeeded') {
    announceToScreenReader(`Step ${stepIndex + 1}: ${step.stepName} completed`)
  } else if (status === 'failed') {
    announceToScreenReader(`Step ${stepIndex + 1}: ${step.stepName} failed. ${error || ''}`)
  }
  
  return { running: { ...state.running, steps } }
})

// 辅助函数
function announceToScreenReader(message: string) {
  const announcement = document.createElement('div')
  announcement.setAttribute('role', 'status')
  announcement.setAttribute('aria-live', 'polite')
  announcement.className = 'sr-only'
  announcement.textContent = message
  document.body.appendChild(announcement)
  
  setTimeout(() => announcement.remove(), 1000)
}
```

---

## 9. 性能优化

### 9.1 渲染优化

```typescript
// 使用 React.memo 避免不必要的重渲染
export const SimpleRunStatus = React.memo(() => {
  // ...
})

export const RunStatusPanel = React.memo(() => {
  // ...
})
```

### 9.2 状态订阅优化

```typescript
// 只订阅需要的状态字段
const { status, currentStep } = useChainPromptStore(
  (state) => ({
    status: state.running.status,
    currentStep: state.running.currentStepIndex
  }),
  shallow  // 浅比较
)
```

### 9.3 内存泄漏预防

在组件中添加清理逻辑：

```typescript
// RunStatusContainer.tsx
export const RunStatusContainer: React.FC = () => {
  const { running, clearRunStatus } = useChainPromptStore()
  
  useEffect(() => {
    // 监听页面卸载
    const handleBeforeUnload = () => {
      if (running.isRunning) {
        clearRunStatus()
      }
    }
    
    // 监听聊天窗口导航（Gemini SPA 路由变化）
    const handleNavigation = () => {
      // 如果导航离开聊天页面，清理状态
      const isChatPage = window.location.pathname.includes('/chat')
      if (!isChatPage && running.isRunning) {
        clearRunStatus()
      }
    }
    
    window.addEventListener('beforeunload', handleBeforeUnload)
    window.addEventListener('popstate', handleNavigation)
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      window.removeEventListener('popstate', handleNavigation)
    }
  }, [running.isRunning, clearRunStatus])
  
  return (
    <>
      <SimpleRunStatus />
      {showRunStatusPanel && <RunStatusPanel />}
    </>
  )
}
```

### 9.4 大型步骤列表优化

当步骤数量超过 20 个时，考虑使用虚拟滚动：

```typescript
// RunStatusPanel.tsx - 可选的虚拟化实现
export const RunStatusPanel: React.FC = () => {
  const { running } = useChainPromptStore()
  const shouldVirtualize = running.steps.length > 20
  
  // 对于大量步骤，可以考虑只显示前 N 个 + 当前步骤 + 最后几个
  const getVisibleSteps = () => {
    if (running.steps.length <= 20) return running.steps
    
    const currentIdx = running.currentStepIndex
    const start = Math.max(0, currentIdx - 5)
    const end = Math.min(running.steps.length, currentIdx + 10)
    
    return running.steps.slice(start, end)
  }
  
  const visibleSteps = getVisibleSteps()
  
  // ... 渲染 visibleSteps
}
```

---

## 10. 容器组件完整实现

### 10.1 RunStatusContainer (`components/run-status/index.tsx`)

这是运行状态的顶层容器组件，整合简要状态和详细面板：

```typescript
import React, { useEffect } from 'react'
import { Box } from '@chakra-ui/react'
import { SimpleRunStatus } from './SimpleRunStatus'
import { RunStatusPanel } from './RunStatusPanel'
import { useChainPromptStore } from '@/stores/chainPromptStore'

export const RunStatusContainer: React.FC = () => {
  const { running, showRunStatusPanel, clearRunStatus, abortRun, toggleRunStatusPanel } = useChainPromptStore()
  
  // 键盘快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // ESC 关闭面板
      if (e.key === 'Escape' && showRunStatusPanel) {
        e.preventDefault()
        toggleRunStatusPanel()
      }
      
      // Ctrl/Cmd + Shift + S 停止执行
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'S' && running.isRunning) {
        e.preventDefault()
        abortRun()
      }
    }
    
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showRunStatusPanel, running.isRunning, toggleRunStatusPanel, abortRun])
  
  // 页面卸载清理
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (running.isRunning) {
        clearRunStatus()
      }
    }
    
    const handleNavigation = () => {
      const isChatPage = window.location.pathname.includes('/chat')
      if (!isChatPage && running.isRunning) {
        clearRunStatus()
      }
    }
    
    window.addEventListener('beforeunload', handleBeforeUnload)
    window.addEventListener('popstate', handleNavigation)
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      window.removeEventListener('popstate', handleNavigation)
    }
  }, [running.isRunning, clearRunStatus])
  
  // 不渲染任何内容如果状态为 idle
  if (running.status === 'idle') {
    return null
  }
  
  return (
    <Box position="relative">
      {showRunStatusPanel && <RunStatusPanel />}
      <SimpleRunStatus />
    </Box>
  )
}

export { RunStatusContainer as default }
```

---

## 11. 实施步骤

### Phase 1: 状态管理（2-3h）
1. ✅ 扩展 `chainPromptStore.ts`
   - 添加 `RunningState` 和 `RunResult` 类型
   - 添加 `abortController` 支持
2. ✅ 新增状态字段和 actions
   - `startRun`, `updateStepStatus`, `completeRun`
   - `abortRun`, `clearRunStatus` (含清理逻辑)
   - `toggleRunStatusPanel`
3. ✅ 导出非 React actions
4. ✅ 添加步骤索引验证

### Phase 2: 核心组件（3-4h）
1. ✅ 创建 `components/run-status/` 目录
2. ✅ 实现 `types.ts` (含 `RunResult` 定义)
3. ✅ 实现 `SimpleRunStatus.tsx`
   - 进度圈计算（基于已完成步骤）
   - 中止按钮（运行时）
   - 关闭按钮（完成后）
4. ✅ 实现 `RunStatusPanel.tsx`
   - Timeline 组件（正确导入）
   - Spin 动画（Chakra UI 方式）
   - 步骤状态图标
5. ✅ 实现容器组件 `index.tsx`
   - 键盘快捷键（ESC, Ctrl+Shift+S）
   - 页面卸载清理
   - 导航监听

### Phase 3: 执行集成（2-3h）
1. ✅ 修改 `chainPromptExecutor.ts`
   - 添加 `abortSignal` 支持
   - 增强回调接口
   - 中止检查逻辑
2. ✅ 更新 `RunModal.tsx` 执行逻辑
   - 等待弹窗关闭动画
   - 挂载运行状态 UI
   - 传入 `abortSignal`
3. ✅ 确保弹窗关闭逻辑

### Phase 4: Content Script 集成（2-3h）
1. ✅ 创建 `entrypoints/content/status/index.tsx`
2. ✅ 实现稳健的 DOM 查找
   - 语义化选择器
   - 回退链策略
   - 重试机制（async with delay）
3. ✅ 实现挂载管理
   - DOM Observer (作用域优化 + 防抖)
   - 扩展生命周期监听
   - 内存清理
4. ✅ 测试定位和显示

### Phase 5: 样式与主题（1h）
1. ✅ 添加 spin 动画 keyframes
2. ✅ 颜色方案配置
3. ✅ 响应式尺寸

### Phase 6: 可访问性（1-2h）
1. ✅ ARIA 属性（role, aria-live, aria-label）
2. ✅ 键盘导航支持
3. ✅ 焦点管理
4. ✅ 屏幕阅读器公告

### Phase 7: 优化与国际化（2-3h）
1. ✅ React.memo 优化
2. ✅ 状态订阅优化（shallow compare）
3. ✅ 内存泄漏预防
4. ✅ 大型步骤列表优化
5. ✅ 添加国际化文案
6. ✅ 错误处理

**总计：13-19 小时**

---

## 12. 风险与缓解

### 12.1 DOM 结构变化

**风险：** Gemini 页面更新导致选择器失效

**缓解：**
- 使用多个备选选择器（语义化优先）
- 监听 DOM 变化自动重新查找
- 重试机制（最多 3 次，延迟 300ms）
- 添加日志便于调试

### 12.2 挂载渲染失败

**风险：** 找不到容器或渲染位置不正确

**缓解：**
- 使用作用域限定（chatWindow）
- 多级回退选择器链
- DOM 查找重试机制
- MutationObserver 自动恢复

### 12.3 状态同步延迟

**风险：** UI 更新不及时

**缓解：**
- 使用 Zustand 的细粒度订阅
- React.memo 优化渲染
- Shallow compare 避免不必要的更新
- 关键路径添加 loading 状态

### 12.4 内存泄漏

**风险：** 长时间运行导致内存累积

**缓解：**
- 页面卸载时清理所有监听器
- AbortController 及时释放
- MutationObserver 正确断开
- 防抖定时器清理

### 12.5 执行中断处理

**风险：** 用户中止或页面导航导致状态不一致

**缓解：**
- AbortController 统一管理中止
- 页面导航监听自动清理
- beforeunload 事件处理
- 中止错误特殊处理

---

## 13. 后续优化

### 13.1 功能增强
- ⏸️ 支持暂停/恢复执行
- 🔄 支持重试失败步骤
- 💾 支持保存执行历史
- 📊 支持执行统计图表
- 🔍 步骤输出预览
- 📋 执行日志导出

### 13.2 体验优化
- 🎨 更丰富的动画效果（进入/退出过渡）
- 📱 移动端适配（响应式布局）
- 🌙 深色模式优化
- 🎵 可选的音效反馈
- ⌨️ 更多键盘快捷键
- 🔔 桌面通知（执行完成）

### 13.3 高级功能
- 📈 实时性能监控
- 🎯 步骤执行时间统计
- 🔁 循环步骤可视化
- 🌳 条件分支展示
- 📊 执行成功率分析

---

## 14. 关键技术要点总结

### 14.1 核心改进点

本次完善相比初版方案的主要改进：

1. **中止执行支持** ✅
   - `AbortController` 集成到 store
   - 执行引擎支持 `abortSignal`
   - UI 提供中止按钮
   - 中止错误特殊处理

2. **类型安全** ✅
   - 添加完整的 `RunResult` 类型定义
   - 步骤索引验证
   - 类型导出和复用

3. **Chakra UI v3 兼容** ✅
   - Timeline 组件正确导入 (`@/components/ui/timeline`)
   - Spin 动画使用 Chakra 方式 (keyframes + animation prop)
   - 移除 Tailwind CSS 依赖 (`animate-spin`)

4. **稳健的 DOM 挂载** ✅
   - 语义化选择器优先
   - 多级回退策略
   - 异步重试机制
   - 作用域限定到聊天窗口

5. **性能优化** ✅
   - DOM Observer 作用域优化
   - 防抖机制（100ms）
   - React.memo + shallow compare
   - 大型列表优化策略

6. **完整的生命周期管理** ✅
   - 页面卸载清理
   - 导航监听
   - 扩展生命周期钩子
   - 内存泄漏预防

7. **可访问性支持** ✅
   - 完整 ARIA 属性
   - 键盘导航（ESC, Ctrl+Shift+S）
   - 焦点管理
   - 屏幕阅读器公告

8. **用户体验提升** ✅
   - 进度计算基于已完成步骤（更准确）
   - 等待弹窗动画避免闪烁
   - 运行时可中止
   - 详细的错误信息展示

### 14.2 技术债务与注意事项

1. **Timeline 组件验证**
   - 确认 Chakra UI v3 Timeline 是否在 `@/components/ui/timeline` 或需要额外安装
   - 如不可用，需使用自定义 Timeline 组件

2. **浏览器兼容性**
   - `AbortController` 在所有现代浏览器中支持
   - `MutationObserver` 需考虑性能影响
   - 确保 `browser.runtime.onSuspend` API 可用

3. **国际化完整性**
   - 需为所有语言添加运行状态文案
   - ARIA label 也需国际化
   - 考虑 RTL 语言布局

4. **测试覆盖**
   - DOM 查找在不同 Gemini 版本的稳定性
   - 中止流程的边界情况
   - 内存泄漏压力测试
   - 大量步骤（100+）的性能表现

### 14.3 开发建议

1. **分阶段实施**：严格按照 Phase 1-7 顺序实施，每个阶段完成后测试
2. **渐进增强**：先实现核心功能，可访问性和优化可以后续迭代
3. **代码复用**：Timeline、Spin 等通用组件可提取到 `ui/` 目录
4. **调试友好**：在关键路径添加 console.warn/error，便于问题定位
5. **文档同步**：代码实现与技术方案保持同步，记录实际遇到的问题

---

## 15. 参考资料

- [PRD v2](./prd_v2.md)
- [交互稿](./running_status.png)
- [Chakra UI ProgressCircle](https://www.chakra-ui.com/docs/components/progress-circle)
- [Chakra UI Timeline](https://www.chakra-ui.com/docs/components/timeline)
- [Zustand 文档](https://docs.pmnd.rs/zustand)
- [WXT Content Script](https://wxt.dev/guide/essentials/content-scripts.html)
- [MDN - AbortController](https://developer.mozilla.org/en-US/docs/Web/API/AbortController)
- [MDN - MutationObserver](https://developer.mozilla.org/en-US/docs/Web/API/MutationObserver)
- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)

---

**文档版本**: v2.1  
**最后更新**: 2025-10-08  
**完善内容**: 
- ✅ 添加 `RunResult` 类型定义
- ✅ 修复 Chakra UI v3 兼容性问题
- ✅ 添加中止执行支持
- ✅ 优化 DOM Observer 和重试逻辑
- ✅ 添加可访问性支持
- ✅ 添加内存泄漏预防
- ✅ 完善执行流程和错误处理
- ✅ 添加关键技术要点总结

