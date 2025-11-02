## Quick Follow-up 自定义 Prompt · 技术方案（V2）

本文基于 PRD 与设计稿（`docs/feature/quick_follow_up/v2.md`、`v2.png`）给出可落地实现方案，延续现有的数据分层（Domain/Repository/DataSource）与 UI 架构（Setting Panel + 内容脚本 DOM 注入）。

---

### 1. 目标与边界
- 实现 Quick Follow-up 的“自定义 Prompt”管理与使用：新增、编辑、拖拽排序、删除、图标选择、实时预览，以及内容页的 React Overlay 胶囊按钮联动。
- 采用现有 Dexie 数据层，新增表与仓储；使用 Zustand 建立前端 Store 驱动设置页与预览。
- 内容脚本使用 React Overlay 渲染胶囊按钮（Chakra 组件 + 自定义 `ActionButton`），与 Store/仓储保持实时同步。
- 暂不实现自动化测试与云同步。

---

### 2. 领域模型与数据结构

#### 2.1 Domain（`src/domain/quick-follow/types.ts`）
```ts
export interface QuickFollowPrompt {
  id: string
  name?: string
  template: string // 必须包含 {{SELECT_TEXT}}
  iconKey: string  // 图标唯一键（例如 'AiOutlineTranslation'）
  enabled: boolean // 预留：是否启用该条 prompt
  createdAt: string
  updatedAt: string
}

export interface QuickFollowSettings {
  orderedIds: string[] // 排序单一真源：按此数组顺序展示
}
```

占位符规则：模板中必须包含 `{{SELECT_TEXT}}`（大小写固定），保存时校验；渲染时以用户当前选择文本替换。

#### 2.2 DB Schema（`src/data/db.ts` 升级）
新增表与版本；保持向后兼容。
```ts
// v2: 新增 quick_follow_prompts, quick_follow_settings
this.version(2).stores({
  chain_prompts: 'id, name, createdAt, updatedAt',
  quick_follow_prompts: 'id, updatedAt',
  quick_follow_settings: 'id' // 固定只有一条记录，id = 'default'
}).upgrade(() => {/* 无需迁移旧数据 */})
```

Row 建议：
```ts
export interface QuickFollowPromptRow {
  id: string
  name?: string
  template: string
  iconKey: string
  enabled: boolean
  createdAt: string
  updatedAt: string
}

export interface QuickFollowSettingsRow {
  id: 'default'
  orderedIds: string[]
}
```

---

### 3. 仓储层（Repository）与数据源（DataSource）

#### 3.1 DataSource（`src/data/sources/LocalDexieDataSource.ts`）
- 新增 CRUD：
  - `getAllQuickFollowPrompts()`、`getQuickFollowPromptById(id)`、`createQuickFollowPrompt(row)`、`updateQuickFollowPrompt(id, patch)`、`deleteQuickFollowPrompt(id)`
  - `getQuickFollowSettings()`、`updateQuickFollowSettings(patch)`（固定 `id='default'`，含 `orderedIds` 的读写）

#### 3.2 Repository（`src/data/repositories/quickFollowRepository.ts`）
- 负责：ID 生成（nanoid）、时间戳维护、Zod 校验、Row↔Domain 转换、排序逻辑。
- 接口（示例）：
```ts
export interface IQuickFollowRepository {
  list(): Promise<QuickFollowPrompt[]>
  create(data: Omit<QuickFollowPrompt, 'id'|'createdAt'|'updatedAt'>): Promise<QuickFollowPrompt>
  update(id: string, patch: Partial<Omit<QuickFollowPrompt,'id'|'createdAt'>>): Promise<QuickFollowPrompt>
  delete(id: string): Promise<void>
  reorder(idsInOrder: string[]): Promise<QuickFollowPrompt[]> // 同步更新 order

  getSettings(): Promise<QuickFollowSettings>
  setEnabled(enabled: boolean): Promise<QuickFollowSettings>
}
```

Zod 校验要点：
- `template` 非空且包含 `{{SELECT_TEXT}}`；
- `iconKey` 为受支持集合内的字符串；
- `orderedIds` 仅存在于设置对象中；单条 prompt 不再持有 `order`。

---

### 4. 前端 Store 设计（Zustand）

文件：`src/stores/quickFollowStore.ts`
```ts
import { create } from 'zustand'
import type { QuickFollowPrompt, QuickFollowSettings } from '@/domain/quick-follow/types'

interface QuickFollowStore {
  settings: QuickFollowSettings
  prompts: QuickFollowPrompt[]

  // 加载与持久化
  hydrate: () => Promise<void>
  setEnabled: (enabled: boolean) => Promise<void>

  // CRUD + 排序
  addPrompt: () => Promise<void>
  updatePrompt: (id: string, patch: Partial<QuickFollowPrompt>) => Promise<void>
  deletePrompt: (id: string) => Promise<void>
  reorder: (idsInOrder: string[]) => Promise<void>
}
```

行为约定：
- 所有写操作先落库再 `set`；
- 内容脚本在隔离世界可直接 `quickFollowStore.subscribe` 监听变化，无需事件总线；也可使用 Dexie `liveQuery` 作为备选。
- `hydrate()` 在设置页挂载时调用一次；内容脚本可直接读仓储或订阅 Store。

---

### 5. 图标选择与渲染方案

#### 5.1 图标库（React）
- 依赖：`react-icons`；采用“受限白名单”策略，维护约 24–36 个常用图标（翻译/书/代码/灯泡等）。
- 模块 `src/components/quick-follow/icons.ts`：
  - 导出 `ICON_CATALOG: Array<{ key: string; label: string; Icon: ComponentType }>`；设置页与 Overlay 均按 `iconKey` 渲染。

#### 5.2 选择器 UI（设置页）
- 使用 Chakra：`Popover` + `SimpleGrid` + `IconButton`。
- 搜索非必需，先用网格快速选择；后续可加筛选。

---

### 6. Setting Panel 组件选型与信息架构

目录：`src/components/setting-panel/views/quick-follow-up/`
- `index.tsx`：入口，包含总开关与列表 + 实时预览。
- `PromptCard.tsx`：单条卡片（图标、名称 input、模板编辑、删除按钮、拖拽柄）。
- `IconPicker.tsx`：Popover + Grid 实现。
- `LivePreview.tsx`：胶囊按钮实时预览（复用 Overlay 组件）。将 `overlay/quick-follow-up` 中的胶囊条提炼为无副作用的 `CapsuleBar` 组件（依赖 `ActionButton`），在设置页直接复用，仅替换数据源为 Store（不触发发送）。

Chakra 组件：
- 总开关：`Switch`
- 列表：`VStack`/`Stack` + `Card`（或 `Box` + 边框）
- 名称：`Input`
- 模板：`Textarea`（多行）
- 删除：`IconButton`（`CloseIcon`）
- 拖拽：HTML5 原生拖拽（`draggable` + onDragStart/onDrop）即可；不新增依赖
- 预览：`HStack` + `IconButton` 组合模拟胶囊按钮

关于模板内高亮 `{{SELECT_TEXT}}`：
- V2 首版采用“强校验 + 说明文案 + 辅助色边框”的策略（输入框下方 `FormHelperText` 提示“必须包含 {{SELECT_TEXT}}”）。
- 同时在预览区域进行高亮渲染（非编辑态），满足辨识需求；如需编辑态高亮可在 V2.x 使用“前景透明 Textarea + 背景高亮层”方案迭代。

---

### 7. 内容脚本：React Overlay 胶囊按钮

现状：组件位于 `src/entrypoints/content/overlay/quick-follow-up/`，主文件 `index.tsx`，使用 Chakra `Presence/Container/HStack` 与自定义 `ActionButton`。

实现要点：
1) 打开/关闭与定位：
   - 通过全局事件 `EVENTS.QUICK_FOLLOW_UP_SHOW`/`HIDE` 控制显示，事件携带 `clientX/clientY` 与 `selectedText`；
   - 组件内 `useEvent` 订阅，写入 `positionData`、`selectedText` 与 `open`；用 `useMemo` 计算绝对定位样式。

2) 数据来源与排序：
   - 使用 `useQuickFollowStore` 获取 `prompts` 与 `settings.orderedIds`；
   - 依据 `orderedIds` 排序后渲染，最多直接显示 3 个；超出的由“更多”按钮展开。

3) 交互：
   - Ask Gemini：触发 `EVENTS.QUICK_FOLLOW_UP_ADD_QUOTE` 或直接调用 `editorUtils` 插入选中内容；
   - 自定义按钮：将模板 `{{SELECT_TEXT}}` 替换为当前 `selectedText`，用 `editorUtils` 自动发送；
   - “更多”：使用 Chakra `Popover`/`Menu` 展开其余图标列表。

4) 样式与可访问性：
   - 统一使用主题 token（`tocBg`、`tocHoverBg`、`tocText` 等）；
   - `ActionButton` 内置 tooltip 与 hover 背景；图标直接使用 `react-icons`。

迁移注意：
- 全局开关仍使用 `browser.storage.sync`；`orderedIds` 等业务配置存于 Dexie。

---

### 8. 实时预览（Setting 页）

规则与内容脚本一致：
- 固定第一个“Ask Gemini”；
- 后续按 `settings.orderedIds` 重排后的顺序渲染；缺失或新建未包含的 id 追加到末尾；
- 最多直接显示 3 个；当自定义数量超过 3 个时，第三位渲染为“更多（>）”按钮；
- “更多（>）”点击后使用 Popover 展开剩余全部图标；该溢出处理逻辑在 `CapsuleBar` 组件内统一实现，设置页与 Overlay 共用，确保行为与样式一致；
- hover 轻微背景变化；
- 图标 tooltip 展示 `name`。

实现：`LivePreview.tsx` 直接复用 `overlay/quick-follow-up` 的 `CapsuleBar` 组件（抽离到共享文件，如 `src/entrypoints/content/overlay/quick-follow-up/CapsuleBar.tsx` 或 `src/components/quick-follow/CapsuleBar.tsx`）。
 - 通过 props 传入：`prompts`、`orderedIds`、`selectedText?`、`maxVisible=3`、`onAskGemini?`、`onRunPrompt?`。
 - 设置页中 `onAskGemini`/`onRunPrompt` 为空实现（或 mock），仅做视觉预览；Overlay 中则绑定真实逻辑。

---

### 9. 国际化（i18n）
- 新增 key：
  - `settings.quickFollow.title` / `settings.quickFollow.enable` / `settings.quickFollow.customPrompt` / `settings.quickFollow.templateMustContain` 等；
  - 胶囊按钮 tooltip 使用 prompt `name`；
- 通过 `src/utils/i18n.ts` `t(key)` 获取；`pnpm run check:i18n` 校验覆盖率。

---

### 10. 校验与错误处理
- 保存/更新前：
  - `template` 为空或不含 `{{SELECT_TEXT}}` → 阻止提交并在 UI 显示错误；
  - `iconKey` 不在白名单 → 阻止提交；
- 仓储捕获 Dexie 异常并抛出业务错误（统一文案）。

---

### 11. 任务分解与落地清单
1) 数据层
   - [ ] `db.ts` 升级到 v2，新增表与 Row 类型
   - [ ] DataSource：QuickFollow CRUD + Settings 持久化
   - [ ] Repository：`quickFollowRepository` + Zod 校验 + 排序

2) 状态管理
   - [ ] `stores/quickFollowStore.ts` 实现；Overlay 组件直接订阅 store 或通过仓储读取

3) Setting Panel
   - [ ] `views/quick-follow-up/*`：总开关（存储在 storage.sync）+ 列表 + 拖拽排序 + 实时预览
   - [ ] `IconPicker.tsx`（Popover + SimpleGrid）
   - [ ] `icons.ts`/`ICON_CATALOG`

4) 内容脚本（Overlay）
   - [ ] 在 `entrypoints/content/overlay/quick-follow-up/` 完成胶囊按钮：读取 prompts、按序渲染、溢出“更多”、点击自动发送
   - [ ] 订阅 store 或 Dexie `liveQuery` 实时更新
   - [ ] 与旧 `enableQuickQuote` 兼容读取（storage.sync），用于决定是否显示 Overlay

---

### 12. 渐进增强与后续迭代
- V2.x：
  - 编辑态“高亮占位符”的装饰编辑器；
  - 图标搜索/分组；
  - 导入/导出自定义 Prompt；
  - 多设备同步（CloudDataSource）。

---

### 13. 关键代码草案

仓储校验片段：
```ts
const QuickFollowSchema = z.object({
  name: z.string().optional(),
  template: z.string().min(1).refine(v => v.includes('{{SELECT_TEXT}}'), 'template must contain {{SELECT_TEXT}}'),
  iconKey: z.enum(ICON_KEYS as [string, ...string[]]),
  enabled: z.boolean()
})
```

内容脚本渲染片段（React 思路）：
```tsx
function QuickFollowUp() {
  const { prompts, settings } = useQuickFollowStore()
  const ordered = useMemo(() => {
    const idx = new Map(settings.orderedIds.map((id, i) => [id, i]))
    return prompts.slice().sort((a, b) => (idx.get(a.id) ?? 1e9) - (idx.get(b.id) ?? 1e9))
  }, [prompts, settings.orderedIds])

  const visible = ordered.slice(0, 3)
  const overflow = ordered.slice(3)

  return (
    <Container /* ...styles... */>
      <HStack>
        <ActionButton icon={<QuoteIcon />} label={t('askGemini')} onClick={handleAddQuote}/>
        {visible.map(p => (
          <ActionButton key={p.id} icon={iconFromKey(p.iconKey)} tooltip={p.name} onClick={() => runPrompt(p)}/>
        ))}
        {overflow.length > 0 && (
          <Popover>/* 列出 overflow */</Popover>
        )}
      </HStack>
    </Container>
  )
}
```

---

### 14. 风险与规避
- 拖拽排序精度：设置页使用原生 DnD 或最小依赖；
- 事件与状态并发：`SHOW/HIDE` 与 store 更新同时发生时，以最新 `selectedText` 与排序为准；
- 与旧设置兼容：读取与写入保持双向兼容期（一个版本周期后可移除旧 key）。

---

### 15. 代码质量约定
- TypeScript 严格：组件/仓储/Store 的导出 API 必须完整类型标注，避免 `any` 与危险断言；
- 组件职责单一：`CapsuleBar` 仅负责渲染与交互回调，不直接做持久化与业务副作用；Overlay/Setting 负责将回调连接到实际逻辑；
- 无副作用渲染：排序、切片等在 `useMemo` 中完成；订阅在 `useEffect` 中注册并在清理函数中解绑；
- 无魔法字符串：`iconKey`、事件名来自集中常量；`{{SELECT_TEXT}}` 以常量导出并统一校验；
- 可访问性：按钮具备 `aria-label`/tooltip，键盘 Enter/Space 可触发，“更多”弹层支持 Esc 关闭与焦点管理；
- 性能与稳健：
  - 避免不必要的 re-render（props 稳定、列表 key 正确）；
  - 位置/显示状态变更支持轻量节流；
- 国际化：所有用户可见文案通过 `t(key)`；
- 风格与检查：遵循项目 code style；提交前通过 `pnpm compile` 与 `pnpm run check:i18n`；
- 错误处理：仓储层做 zod 校验与统一错误抛出；UI 拦截非法输入（模板不含 `{{SELECT_TEXT}}` 等）。


