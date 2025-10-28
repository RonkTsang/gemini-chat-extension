## Chain Prompt 技术方案（V1）

本文基于 PRD（docs/feature/chain_prompt/prd.md）制定技术实现方案，聚焦本地 IndexedDB 持久化、可插拔的数据访问层、执行引擎与变量模板解析，确保后续易于迁移到云端。

---

### 1. 架构总览

- UI 层（Setting Panel）
  - 列表页与编辑/新建页组件在 `src/components/setting-panel/` 实现。
  - 仅通过业务服务（Service）/仓储（Repository）进行数据和动作调用，不直接接触 DB。

- 状态管理
  - 使用 Zustand 持有当前编辑态/运行态的临时 UI 状态（非持久化）。

- 业务服务（Services）
  - TemplateEngine：处理 `{{VAR}}` 与 `{{StepN.output}}` 的变量替换、上下文绑定与校验。
  - ExecutionService：按步骤驱动执行（插入 → 发送 → 等待 → 产出 → 继续），封装对 `src/utils/editorUtils.ts` 的使用。
  - 导出/导入（Export/Import）与复制（Duplicate）等复用逻辑。

- 仓储（Repositories）
  - IChainPromptRepository（V1）；IChainRunRepository（预留，V1 不实现）：统一的数据访问接口。
  - 仅调用数据源接口（DataSource），实现与具体存储解耦。

- 数据源（DataSources）
  - LocalDexieDataSource（V1）：使用 IndexedDB（Dexie）实现本地持久化与迁移。
  - CloudDataSource（预留）：未来接入 REST / GraphQL / Dexie Cloud / 自建后端。

---

### 2. 存储方案与库选择

- 选择：Dexie（https://dexie.org/）
  - 理由：
    - Promise 化 API、完善的 schema 迁移机制、良好的 TypeScript 体验。
    - 原生 IndexedDB 之上的现代封装，适合大文本字段（steps.prompt）。
    - 提供增量升级（versioning）能力，便于未来 schema 演进与云同步扩展（如 Dexie Cloud）。

- 依赖建议（V1 引入但暂不强制落库）：
  - dexie（本地存储）
  - nanoid（ID 生成）
  - zod（读写校验，防御性编程）

---

### 3. 目录与模块划分（提案）

```
src/
  domain/
    chain-prompt/
      types.ts               # 领域类型（ChainPrompt / ChainRun 等）
  data/
    db.ts                    # Dexie 初始化与 schema 版本管理
    sources/
      LocalDexieDataSource.ts
      index.ts
    repositories/
      chainPromptRepository.ts
      index.ts
  services/
    chainPromptExecutor.ts   # ExecutionService
    templateEngine.ts        # TemplateEngine
  stores/
    chainPromptStore.ts      # UI 状态（编辑/选择/运行态）
```

说明：
- UI 组件通过 `services/*` 与 `repositories/*` 暴露的函数交互。
- 业务代码禁止直接 import `data/db.ts` 或 Dexie，仅使用接口。

---

### 4. 领域模型（核心）

```ts
// Chain Prompt（持久化主对象）
interface ChainVariable { key: string; defaultValue?: string }

interface ChainStep {
  id: string
  name?: string
  prompt: string // 可能为大文本
}

interface ChainPrompt {
  id: string
  name: string
  description?: string
  createdAt: string // ISO
  updatedAt: string // ISO
  variables: ChainVariable[]
  steps: ChainStep[] // 顺序即执行顺序
}

// 运行记录（预留，不在 V1 落库）
type RunStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'aborted'

interface ChainRunStepRecord {
  stepId: string
  stepIndex: number
  inputPrompt: string
  outputText?: string
  error?: string
}

interface ChainRunRecord {
  id: string
  promptId: string
  startedAt: string
  finishedAt?: string
  status: RunStatus
  steps: ChainRunStepRecord[]
}
```

---

### 5. IndexedDB Schema（Dexie）

数据库名：`gemini_extension`

版本 v1（V1 初始表，仅模板持久化）：
- `chain_prompts`: `id, name, createdAt, updatedAt`

键与索引（Dexie stores 定义示例，V1 不含运行记录表）：

```ts
// data/db.ts（示例草案）
import Dexie, { type Table } from 'dexie'

export interface ChainPromptRow { // 与领域模型一一映射（或做轻微扁平化）
  id: string
  name: string
  description?: string
  createdAt: string
  updatedAt: string
  variables: { key: string; defaultValue?: string }[]
  steps: { id: string; name?: string; prompt: string }[]
}

export class GeminiExtensionDB extends Dexie {
  chain_prompts!: Table<ChainPromptRow, string>

  constructor() {
    super('gemini_extension')
    this.version(1).stores({
      chain_prompts: 'id, name, createdAt, updatedAt'
    })
  }
}

export const db = new GeminiExtensionDB()
```

迁移（示例）：
- v2 可新增字段或表（如 `chain_runs`、tags / folders / full-text 索引等，通过第三方实现）。
- Dexie 使用 `this.version(n+1).stores({...}).upgrade(tx => {...})` 进行升级数据迁移。

---

### 6. 数据访问层设计

统一接口（仅示例签名，V1 仅实现模板仓储）：

```ts
// repositories/chainPromptRepository.ts
import type { ChainPrompt } from '@/domain/chain-prompt/types'

export interface IChainPromptRepository {
  list(params?: { search?: string }): Promise<ChainPrompt[]>
  getById(id: string): Promise<ChainPrompt | undefined>
  create(data: Omit<ChainPrompt, 'id' | 'createdAt' | 'updatedAt'>): Promise<ChainPrompt>
  update(id: string, patch: Partial<Omit<ChainPrompt, 'id' | 'createdAt'>>): Promise<ChainPrompt>
  duplicate(id: string): Promise<ChainPrompt>
  delete(id: string): Promise<void>
}
// 运行记录仓储（预留，V1 不实现，不落库）
export interface IChainRunRepository { /* ...future... */ }
```

数据源（LocalDexieDataSource）只负责 CRUD，Repository 负责：
- ID 生成（nanoid）、时间戳维护、复制逻辑、搜索（如 name 前缀匹配）。
- 读写校验（zod）与领域模型转换（Row ↔ Domain）。

依赖倒置：
- UI → Services → Repositories（接口） → DataSources（实现）。
- 未来接入云端时，仅替换 DataSource 或增加一个 HybridDataSource（本地缓存 + 远端同步）。

---

### 7. 执行引擎（ExecutionService）

职责：将 Chain 按顺序执行，完成 PRD 的 3.2/3.3/3.4 流程。

关键点：
- 单次运行上下文（RunContext）：
  - `variables`（来自用户输入，含默认值回填）。
  - `stepOutputs`（Map: stepIndex → outputText）。
  - `abortController`（支持用户中止）。
  - 仅页面级内存态（每个 Tab 独立），V1 不做持久化。

- 模板渲染：
  - 当前步骤可用变量 = 输入变量 + 之前步骤输出（`{{StepK.output}}` where K < currentIndex）。
  - 渲染后得到 `inputPrompt`。

- 与 `editorUtils.ts` 交互：
  - 插入 `inputPrompt` → 发送消息 → 等待模型完成（监听 DOM/状态，已有工具函数）。
  - 获取结果文本，写入 `stepOutputs`。

- 失败与重试：
  - 任一步失败可中止；后续可扩展重试与跳步。

接口示例（返回内存态快照，而非持久化记录）：

```ts
export interface RunResultStep {
  stepIndex: number
  inputPrompt: string
  outputText?: string
  error?: string
}

export interface RunResult {
  status: 'succeeded' | 'failed' | 'aborted'
  steps: RunResultStep[]
}

export interface ChainPromptExecutor {
  run(params: { prompt: ChainPrompt; variables: Record<string, string> }): Promise<RunResult>
  abort(runId: string): void
}
```

---

### 8. 模板/变量解析（TemplateEngine）

占位符：
- `{{KEY}}` → 输入变量（`variables`）。
- `{{StepN.output}}` → 之前步骤输出（N 为 1-based）。

规则：
- 未解析变量报错并阻止执行（UI 提示缺失变量）。
- 第 N 步只能引用 `< N` 的步骤输出。

实现建议：
- 轻量正则解析，后续可替换为 Mustache 等模板库。
- 提供 `validate(template, context)` 与 `render(template, context)` 两个核心能力。

---

### 9. 云迁移预案

- DataSource 抽象：
  - `LocalDexieDataSource`（现有）。
  - `CloudDataSource`：对接远端 API（REST/GraphQL）。
  - `HybridDataSource`：本地优先 + 后台同步（冲突策略：`updatedAt`/版本号/CRDT 视规模选择）。

- 同步策略（后续）：
  - 变更日志（本地记录 patch），上线后批量上送。
  - 运行记录可只保留摘要至云端，全文按需上传。

---

### 10. UI 交互与数据流

- 列表页：加载 `IChainPromptRepository.list()`，支持搜索；卡片上提供 Run / Edit / Copy / Delete。
- 新建/编辑页：本地表单状态（Zustand）→ 保存时调用 `create`/`update`。
- Run 流程：点击 Run → 若有 variables 弹 Modal（左输入右预览）→ `ExecutionService.run()`；执行态为“页面级内存”，不入库。

---

### 11. 错误处理与健壮性

- Repository：写入前校验（zod），捕获 Dexie 错误并转为业务错误码。
- Execution：步骤失败/超时/中止，UI 反馈与 Run 状态同步。
- 大文本：IndexedDB 对字符串存储友好，注意序列化性能（避免频繁深拷贝）。

---

### 12. 依赖与版本

```bash
pnpm add dexie nanoid zod
```

---

### 13. 迭代与落地计划

1) 基础能力（本次 V1）
- 落库：`data/db.ts` 与 Dexie v1 schema（仅 `chain_prompts`）。
- Repositories：`IChainPromptRepository` + 本地实现；`IChainRunRepository` 预留（不实现、不落库）。
- Services：TemplateEngine 与 ExecutionService（最小可用）。
- UI：列表/编辑页最小交互闭环；Run Modal（左变量输入，右实时预览）。

2) 增强（V1.x）
- 导入/导出 JSON。
- 搜索/筛选优化（name/description）。
- Run 历史与重跑。

3) 云端迁移（V2）
- 引入 CloudDataSource 与鉴权。
- 双向同步与冲突处理；可新增 `chain_runs` 表与相应仓储，实现运行历史与重跑。

---

### 14. 合规与约定

- TypeScript 约定：接口定义、类型导出、严格模式，遵循 `typescript-conventions`。
- 代码组织：业务代码仅依赖接口（Repository/Service），不得直接使用 Dexie。
- 国际化：文案沿用 `public/_locales/`，组件层面保持 i18n 可扩展。


