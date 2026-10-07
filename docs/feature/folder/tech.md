# Folders 技术设计

> 实现基线：Folder Repository、Dexie、同步调度和恢复点由扩展后台持有，页面通过 Folder RPC 交互；Browser Sync V3 是当前唯一跨设备 provider。Dexie schema 为 v12，Google Drive 尚未实现。文中的 Drive provider、Bootstrap 和 provider 切换章节均为未来方案，不属于当前代码能力。后台 RPC 细节见 [Background 数据架构](./background-data-architecture.md)，同步格式见 [Browser Sync V3](./browser-sync-data-architecture.md)。

## 目标与边界

Folders 依赖 Gemini 页面 DOM，但页面结构会随 Gemini 更新而变化；同时其 Folder 结构与 Chat 归属属于需要跨设备保存的用户资产。本设计将页面身份识别、DOM 选择器配置和数据持久化从 Folders UI 中拆出，形成三个边界清晰的模块：

1. **用户身份获取**：返回当前 Gemini 页面用户的身份状态、邮箱和头像。
2. **DOM 选择器配置**：集中维护 Gemini 页面语义节点的候选选择器，降低页面变化时的修改范围。
3. **数据存储与同步**：统一管理 Folder、本地数据、Browser Sync、冲突合并和备份恢复；当前 UI 仅开放根 Folder，Google Drive 属于后续规划。

Folders UI 只能消费上述模块的公开 API；不得在 Folder 组件、仓储或拖拽逻辑中直接书写 Gemini CSS 选择器、解析用户邮箱或调用具体同步 provider。

当前主要代码归属：

```text
src/
├── domain/folder/
│   ├── types.ts                  # Folder 领域类型
│   ├── schemas.ts                # 持久化、导入与同步边界校验
│   ├── order-key.ts              # 顺序键生成、比较和重平衡
│   └── tree-projection.ts        # 邻接表到 UI 树的只读投影
├── data/
│   ├── db.ts                     # Dexie 表与版本迁移
│   └── repositories/
│       └── folderRepository.ts   # accountScopeId 约束和事务入口
└── services/
    ├── gemini-dom/
    │   └── selectors.ts          # 集中的候选选择器配置
    ├── gemini-identity/
    │   ├── index.ts              # 用户身份获取公开 API
    │   └── account-history.ts    # 本机账号历史 RPC client
    ├── folder-sync/
    │   ├── coordinator.ts        # 本地事务、拉取、合并和上传编排
    │   ├── codec.ts              # 序列化、压缩、分 Chunk 和 hash
    │   ├── scheduler.ts          # MV3 唤醒与重试
    │   └── providers/
    │       └── browser-sync.ts   # browser.storage.sync 适配器
    └── folder-recovery/
        ├── snapshots.ts          # 自动/手动/保护恢复点
        └── storage.ts            # 容量、保留和恢复状态
```

Google Drive provider 当前没有源码实现。

## 模块一：用户身份获取

### 职责

`GeminiIdentityService` 感知当前 Gemini 页实际激活的 Google 用户，并向调用方提供标准化身份。它是一个页面会话身份模块，不读取 Chrome Profile、Cookie、Google OAuth token 或 Gemini 请求内容。

身份模块使用集中的 DOM 选择器配置查找页面节点；具体的父子节点查找、邮箱解析和结果校验仍由身份模块负责。它不知道 Folders 的表结构、同步实现和 UI。

### 公开契约

```ts
export type GeminiUserIdentity = {
  email: string
  avatarUrl?: string
  accountScopeId: string
  source: 'observed' | 'manual-confirmed'
  selection?: 'manual' | 'history' | 'recent'
  resolvedAt: string
}

export type GeminiIdentityResult =
  | { status: 'available'; identity: GeminiUserIdentity }
  | { status: 'unavailable'; reason: 'signed-out' | 'surface-not-ready' | 'email-not-found' }
  | { status: 'ambiguous'; reason: 'multiple-accounts-detected' }

export interface GeminiIdentityService {
  getCurrent(): GeminiIdentityResult
  refresh(persistSelection?: boolean): Promise<GeminiIdentityResult>
  confirmManualEmail(email: string, confirmation: true, selection?: 'manual' | 'history'): Promise<GeminiIdentityResult>
  clearManualEmail(): void
  subscribe(listener: (result: GeminiIdentityResult) => void): () => void
  dispose(): void
}
```

`accountScopeId` 是 `SHA-256('gpk-folders-v1:' + normalizedEmail)`，用于 IndexedDB 的归属筛选；Folder 业务表、Browser Sync payload 和导出文件不含原始邮箱。后台另以 `gpk.folders.account-history.v1` 在 `browser.storage.local` 保存规范化邮箱、scope、最近使用时间和最近选择的 scope。手动选择或最近账号可跨页面重载恢复；自动观察到的身份始终优先。该哈希是伪匿名 key，不应被视为安全隔离边界。

### 身份解析规则

1. 从 `geminiDomSelectors.identity[*].accountLink` 获取候选节点，且必须限定在 Google 全局头部语义节点内。
2. 从候选链接的 `aria-label` 中解析邮箱并进行 Unicode trim 与小写标准化；不依赖 `Google Account` 等可本地化文字。
3. 对标准化邮箱去重：恰好一个邮箱时返回 `available`；零个时返回 `unavailable`；多个不同邮箱时返回 `ambiguous`。
4. 头像从同一账户节点或其受限后代的 `img` 取得可用 `src`。头像无法获得不影响邮箱识别，返回 `avatarUrl: undefined`。
5. 不主动请求账户切换器、不访问 Cookie、不从网络请求、页面私有状态或 OAuth token 推断身份。
6. 当结果为 `unavailable` 或 `ambiguous` 时，UI 可调用 `confirmManualEmail(email, true)` 创建 `source: 'manual-confirmed'` 的会话身份。该方法必须复用相同的邮箱规范化与 `accountScopeId` 计算，拒绝无效邮箱，要求用户显式确认，且不能把结果标记为 `observed` 或验证过的登录身份。

### 身份变化与失效保护

身份模块在初始化、Gemini URL 变化、窗口重新获得焦点时刷新，并观察账户头部替换。观察应使用防抖，避免 Gemini 重绘期间短暂的空节点触发重复切换。

当 `accountScopeId` 改变，消费者必须先清空前一身份的内存状态和订阅，再加载新身份的数据。`unavailable` 或 `ambiguous` 在没有有效手动确认时不是删除事件：消费者应立即隐藏数据与禁用写操作，保留所有持久化记录等待身份恢复。页面在 URL 变化、重新获得焦点或账户头部重绘后继续自动解析；一旦得到 `observed` 身份，必须清除手动会话身份并以观察结果为准。观察身份与手动邮箱不一致时，不能保留手动数据视图。

Folders 的所有查询、写入、导入和导出必须带上当前 `accountScopeId`。创建某账号的首个 `FolderSettingsRow` 时，`enabled` 默认写入 `true`。Browser Sync 对 `observed` 与 `manual-confirmed` 的相同 scope 使用同一后台调度；Recents 隐藏按当前 scope 设置执行。手动选择不验证 Gemini 当前登录账号。Google Drive 的授权账号验证属于未来 provider 的实现要求。

身份模块测试覆盖单一观察邮箱、缺失/多个观察邮箱、手动邮箱的格式与确认校验、账号历史保存与恢复、自动身份优先、不同 scope 时清空旧投影。手动确认的 scope 可触发 Browser Sync；Recents 隐藏按当前 scope 的开关执行。Drive 当前不可用。

### 消费示例

```ts
const identityResult = geminiIdentityService.getCurrent()

if (identityResult.status !== 'available') {
  folderController.enterUnavailableState(identityResult)
  return
}

await folderController.load({ accountScopeId: identityResult.identity.accountScopeId })
```

## 模块二：DOM 选择器配置

### 职责

`gemini-dom/selectors.ts` 集中保存 Gemini 页面节点的候选选择器。它按**业务语义**而非 CSS 框架层级或可见文案命名，只负责配置和候选优先级，不负责定义通用的父子作用域、命中数量或解析流程。

具体业务代码应明确控制查询过程：先找到哪个父节点、再从哪个节点查找子节点，以及结果需要唯一还是允许多个。现阶段不为这些过程额外抽象通用 DOM resolver。

每个候选选择器必须相对于业务代码选定的查询根节点构成独立回退，避免某个失效属性让所有候选一起失效。

### 选择器配置结构

```ts
export const geminiDomSelectors = {
  identity: [
    { accountLink: 'sidenav-mavatar-footer a[href*="accounts.google.com/SignOutOptions"][aria-label]', avatar: 'img.mavatar-image[src]' },
    { accountLink: '#gb a[href*="accounts.google.com/SignOutOptions"][aria-label]', avatar: 'img[src][srcset]' },
  ],
  sideNav: {
    root: ['bard-sidenav[role="navigation"]', 'bard-sidenav'],
    chatsSection: [
      'expandable-section[data-test-id="chats-expandable-section"]',
      'expandable-section[storagekey="chats"]',
    ],
    conversationLink: ['a[href^="/app/"]', 'a[href*="gemini.google.com/app/"]'],
    conversationTitle: ['span.title-text'],
    activeConversationRow: ['gem-nav-list-item[data-test-id="conversation"].always-show-hovered-trailing-content'],
    activeConversationMenuTrigger: ['[aria-haspopup="menu"][aria-controls]'],
    openConversationActionsMenu: ['[role="menu"].conversation-actions-menu'],
  },
}
```

业务语义和候选选择依据只保留为源码注释。配置值仅为按优先级排列的 selector 字符串数组，方便集中维护，也保留未来转换为 JSON 配置的可能；当前阶段不为远程加载增加额外运行时字段。

### 使用规则

1. 业务代码明确选择查询根节点，并按流程查找。例如身份模块依次检查 `sidenav-mavatar-footer` 与 `#gb` 的账号链接候选，从匹配链接的 `aria-label` 提取邮箱；配置层不描述这层关系。
2. 同一语义节点的 selector 按声明顺序尝试；当前 selector 没有得到业务需要的结果时再使用下一条。
3. 调用方自行决定查找一个或多个节点，并负责可见性、唯一性和业务语义校验。对话链接还必须验证 URL 可解析为 Gemini `/app/<chatId>` 路由。
4. 查找失败时由对应功能安全降级，不得抛出阻断内容脚本的异常。
5. 页面发生重绘时由对应 feature 的 `MutationObserver` 重新执行查找流程；不要长期持有已卸载的 DOM 节点。

### SideNav Chat 原生菜单与二级选择层

Folders 将原生 Chat 更多菜单作为 P0 入口，但只使用已验证的菜单关联，不根据会话标题、菜单文案或某个固定原生菜单项定位。

#### 打开菜单的归属校验

按以下顺序解析；任一步失败、存在多个匹配项，或关联 ID 不一致时均不注入，保持 Gemini 原生菜单不变：

1. 在 `sideNav.root` 中解析唯一的 `activeConversationRow`，并从其中解析唯一的 `/app/<chatId>` 会话链接。
2. 在该行解析唯一的 `activeConversationMenuTrigger`，读取其 `aria-controls`。
3. 解析唯一且可见的 `openConversationActionsMenu`，要求其 `id === trigger.getAttribute('aria-controls')`。
4. 仅在三者同时仍连接到 DOM 时，返回 `{ chatId, row, trigger, menu }` 给 Folder 菜单控制器。

`always-show-hovered-trailing-content` 仅表示候选行，不是最终关联依据。`aria-controls → menu.id` 才是当前 Chat 与当前原生菜单的绑定契约。

#### 原生菜单项注入

不选择或依赖 `delete-button` 等固定原生菜单项。控制器从已验证菜单的直接 `role="menuitem"` 子项取得共同父容器，在该容器**末尾**依次追加两个 GPK 自有节点：

```text
[data-gpk-folder-menu-separator]  role="separator"
[data-gpk-folder-menu-entry]      role="menuitem"  Add to Folder
```

这避免因 Gemini 增删、重排或更名原生菜单项而改变插入位置。注入必须幂等：同一菜单容器只允许一条 GPK 分隔线和一条 GPK 菜单项；菜单关闭、容器替换、功能停止或关联校验失效时，移除全部带 `data-gpk-folder-menu-*` 的节点。

GPK 菜单项必须在 `pointerdown` 与 `click` 阶段阻止原生菜单的默认关闭路径，并维护 `aria-expanded`。它仍使用原生菜单的字体、行高、hover 与焦点视觉基线；图标、文案和事件均由 GPK 拥有。

#### GPK Folder 选择层

点击 GPK 菜单项后，以该菜单项的 `getBoundingClientRect()` 为锚，向全局 GPK overlay 发送 `{ chatId, anchorRect }`。选择层不挂载到 Gemini 的 `cdk-overlay-container` 或 SideNav，以免被原生 overflow、重绘和 overlay 生命周期裁切或移除。

选择层规则：

1. 宽度 `200px`，最大高度为 `min(600px, 视口可用高度)`；Folder 列表区域使用 `overflow-y: auto`。
2. 优先定位在锚点右侧；右侧不足时翻转至左侧，顶部坐标在可视区域内夹紧。
3. `New Folder` 创建成功后，将当前 `chatId` 加入新 Folder；选择已有 Folder 后立即写入成员关系并关闭选择层。
4. 原生菜单、锚点、目标 Chat 行或身份状态任一断开，或者发生滚动、resize、点击外部、`Escape` 时，重算位置或关闭选择层；断开时不得保留悬浮 UI。

选择层始终按 SideNav 的 Folder 顺序展示当前账号下的全部 Folder。已存在当前 `chatId` membership 的项以勾选态、禁用的 `menuitemcheckbox` 呈现；其他项为可选 `menuitem`。已加入态只用于查看，不能在 `Add to Folder` 内再次点击移出；移出操作只在 Folder 内 Chat 菜单的 `Remove from folder` 中提供并继续要求确认。即使所有 Folder 都已加入，仍保留这些勾选项和 `New Folder`，不得渲染空列表。

#### 验证要求

除通用 selector fixture 外，原生菜单入口需覆盖：唯一行与菜单的成功关联、多个 active 行、`aria-controls` 与菜单 ID 不匹配、原生菜单关闭、菜单容器重绘、重复注入、选择层左右翻转、超高 Folder 列表滚动、选择 Folder 后关闭，以及 `New Folder` 创建后自动加入。

### 维护流程

1. Gemini DOM 变化时，先在真实已登录页面检查目标语义节点，再更新对应选择器配置；不要基于截图或旧选择器猜测。
2. 新候选必须用相邻代码注释说明选择依据，并优先使用 `data-test-id`、语义属性、路由和稳定自定义元素；禁止依赖本地化可见文本、临时 class、`cdkoverlayorigin`、图标名称或深层祖先链。
3. 为每个新增或修改的候选补充 fixture 测试：主路径、每一条回退、错误查询根节点、重复命中和页面重绘后的重新查找。
4. P0 仅解决本地 selector 的集中配置与维护，不实现远程加载。配置保持为可序列化的数据形态；远程更新所需的签名、版本兼容、回滚和缓存策略在实际引入时另行设计。

## 模块三：数据存储与同步

### 目标与边界

Folders 数据模块采用本地优先模型：扩展 origin 的 Dexie/IndexedDB 是当前设备的工作数据和离线数据源；当前通过 `browser.storage.sync` 在浏览器管理的设备间传播压缩后的 Folder 数据。GPK 只能确认本机 Browser Storage 写入结果，不能确认云端传播。Google Drive 尚未实现。持久化模型支持多层级 Folder 父子关系，但当前 UI 只开放根 Folder。

数据模块只保存 Folder、Chat 归属关系、必要的 Chat 标题缓存、功能设置、同步元数据和恢复快照；不读取或保存 Gemini 聊天正文。所有公开查询和写入必须显式传入 `accountScopeId`，repository 不提供跨账号的无范围读取接口。

数据模块分为：

1. **数据面**：Chat 引用、Folder、成员关系、设置、删除标记和待同步操作。
2. **控制面**：同步 provider、权威 epoch、数据格式版本、修订号、设备进度和 provider 迁移状态。

控制面不得混入业务数据；Drive token、原始邮箱和运行时错误不得写入 `browser.storage.sync`、手动导出或自动备份。

### 领域与本地表结构

```ts
export type FolderVersionStamp = string // Hybrid Logical Clock + deviceId
export type FolderOrderKey = string
export type FolderPresetColorKey = 'neutral' | 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | 'pink'
export type FolderColorValue = FolderPresetColorKey | `#${string}`

// IndexedDB 不索引 null，根层级使用不会与真实 Folder ID 冲突的固定哨兵值。
export const ROOT_FOLDER_ID = '__root__' as const
export type FolderParentId = string | typeof ROOT_FOLDER_ID

export interface FolderRow {
  id: string
  accountScopeId: string
  parentFolderId: FolderParentId
  name: string
  iconKey: string
  colorValue: FolderColorValue
  orderKey: FolderOrderKey
  createdAt: string
  updatedAt: string
  versionStamp: FolderVersionStamp
  fieldVersions: {
    name: FolderVersionStamp
    iconKey: FolderVersionStamp
    colorValue: FolderVersionStamp
    position: FolderVersionStamp // parentFolderId + orderKey 作为一个原子位置字段
  }
  deletedAt?: string
  deleteVersionStamp?: FolderVersionStamp
}

export interface FolderMembershipRow {
  id: string
  accountScopeId: string
  folderId: string
  chatId: string
  orderKey: FolderOrderKey
  createdAt: string
  updatedAt: string
  versionStamp: FolderVersionStamp
  positionVersionStamp: FolderVersionStamp
  pinnedOrderKey?: FolderOrderKey
  pinVersionStamp?: FolderVersionStamp
  deletedAt?: string
  deleteVersionStamp?: FolderVersionStamp
}

export interface ChatReferenceRow {
  accountScopeId: string
  chatId: string
  cachedTitle: string
  createdAt: string
  updatedAt: string
  titleVersionStamp: FolderVersionStamp
}

export interface FolderSettingsRow {
  accountScopeId: string
  enabled: boolean
  hideOrganizedChats: boolean
  collapsedFolderIds: string[]
  updatedAt: string
  settingsVersion: FolderVersionStamp
  settingsPending: boolean
}
```

`iconKey` 的本地新建/编辑命令只接受选择器目录中的 30 个稳定语义 key。`colorValue` 的自定义值必须在 repository 边界规范化并验证为不透明六位 Hex，任何导入或同步值都必须经颜色 resolver 后才能用于 CSS。外观字段不需要独立数据表或索引，会随 `FolderRow` 一并进入恢复点、导入导出和同步业务数据。

编辑 Folder 时 runtime 必须发送差异 patch：只改变名称时不得推进 `iconKey` 或 `colorValue` 的字段版本。同步合并继续对名称、图标、颜色和位置分别执行基于 HLC 的字段级 LWW。

Folder 采用邻接表持久化：`parentFolderId = ROOT_FOLDER_ID` 表示根 Folder，否则必须指向同一 `accountScopeId` 下存在且未删除的 Folder。数据表不保存递归 `children[]`；UI 查询当前账号的 Folder 和成员关系后，通过 `parentFolderId`/`folderId` 构建只读树投影。schema 不写死为两层或三层，技术安全上限统一为 `MAX_FOLDER_DEPTH = 32`（根 Folder 深度为 `1`）；遍历使用可防护的迭代算法，导入、同步和 repository 写入使用同一上限，避免恶意或损坏数据造成无限递归。

Folder 与成员关系使用软删除字段保留 tombstone；正常业务查询必须过滤 `deletedAt`，同步和恢复流程可以读取 tombstone。成员关系以 `[accountScopeId+folderId+chatId]` 作为唯一约束，保证一个 Chat 可加入多个 Folder、但不会在同一 Folder 内重复。

`FolderMembershipRow` 只描述 Folder 与 Chat 的关系，包括归属、同层位置和关系版本；不得复制 Chat 标题等实体属性。`ChatReferenceRow` 以 `[accountScopeId+chatId]` 唯一保存必要的标题缓存，供同一 Chat 的全部 Folder membership 以及后续 Tags 等组织能力复用。`cachedTitle` 仅用于 GPK UI 展示，不是 Gemini Chat 的权威标题；检测到 Gemini 标题变化时只更新一条 Chat reference。

同一父 Folder 下的子 Folder 与 Chat membership 共用普通 `orderKey` 排序空间；同一 Folder 内的已置顶 Chat 使用独立 `pinnedOrderKey`，展示和分页时先置顶组再普通组，组内按对应顺序键与实体 ID 的 ASCII 顺序稳定排序。根层级只包含 Folder，不包含 membership。

建议的 Dexie 索引至少包括：

```text
folders
  &[accountScopeId+id]
  [accountScopeId+parentFolderId+orderKey]

folder_memberships
  &[accountScopeId+id]
  &[accountScopeId+folderId+chatId]
  [accountScopeId+folderId+orderKey]

chat_references
  &[accountScopeId+chatId]
```

### 多层级树约束

1. 新建子 Folder、移动 Folder 和导入数据必须验证父节点属于同一 `accountScopeId`。
2. Folder 不能以自身或任一后代作为父节点；移动前沿目标父节点的祖先链向上检查，发现当前 Folder 即拒绝事务。
3. `parentFolderId` 与 `orderKey` 是一个原子位置；跨层移动必须在同一事务和同一 operation 中一起更新。
4. 删除 Folder 固定采用子树删除：在同一事务中为目标 Folder、全部后代及子树内 membership 写入 tombstone；不提升子节点，也不删除 Gemini Chat。仍被子树外 membership 引用的 Chat reference 必须保留；无任何有效 membership 的 reference 只作为可回收缓存处理。repository 提交后不得产生可见孤儿节点。
5. 导入和同步边界必须拒绝重复 ID、跨账号父节点、自引用、循环引用和无法修复的孤儿；不能只依赖 UI 防止非法树。
6. 展开/收起状态以 Folder ID 保存；删除或恢复子树后清理无效的 `collapsedFolderIds` 投影，不将 UI 状态作为树结构权威。

UI 使用的递归结构仅在读取后派生，不能反向作为 repository 写入参数或同步 payload：

```ts
export type FolderTreeEntry =
  | { kind: 'folder'; node: FolderTreeNode }
  | {
      kind: 'chat'
      membership: FolderMembershipRow
      chat: ChatReferenceRow
    }

export interface FolderTreeNode {
  folder: FolderRow
  entries: FolderTreeEntry[]
}
```

`entries` 将子 Folder 与 Chat membership 放在同一个有序集合中，以保留混合拖拽顺序，并通过 `chatId` 关联唯一的 Chat reference。投影器先按 ID 建立索引，再按 `parentFolderId` 分组挂载子树，复杂度保持为 `O(folders + memberships + chatReferences)`；禁止为每个 Folder 或 membership 单独查询一次数据库。每条未删除的 membership 必须解析到同账号 Chat reference；投影失败时返回结构化错误，不得静默复制标题、放置孤儿节点或混用其他账号缓存。

### OrderKey 生成与排序协议

`orderKey` 是 provider 无关的持久化顺序键，由 `domain/folder/order-key.ts` 使用固定宽度 32 位 Base62 协议生成。禁止使用数组下标、连续整数、时间戳、随机字符串或 `localeCompare` 作为顺序协议；所有设备必须使用相同 ASCII 字符集和二进制字典序比较。

```ts
export function keyBetween(before?: string, after?: string): string
export function rebalanceOrderKeys(ids: readonly string[]): Map<string, string>
```

生成规则：

| 操作 | `previous` | `next` |
| --- | --- | --- |
| 空列表创建首项 | `null` | `null` |
| 插入开头 | `null` | 当前首项 |
| 追加末尾 | 当前末项 | `null` |
| 插入或移动到两项之间 | 前一项 | 后一项 |

生成结果必须满足 `previous < newKey < next`；缺少一侧边界时生成小于首项或大于末项的键。新建、单项拖拽和跨层移动通常只更新目标实体的 `orderKey`，不重写其他兄弟节点。两个设备修改同一实体位置时比较 `position`/`positionVersionStamp`，较新的 Hybrid Logical Clock 胜出；同 stamp 时以 `deviceId` 确定结果。

同一组输入必须在所有支持的浏览器上生成相同结果；编码字母表、边界行为或比较规则发生不兼容变化时需更新 Browser Sync 协议版本，不能只发布本地实现变更。

当两键之间没有可用的 32 位 Base62 值时，Repository 对当前兄弟节点调用 `rebalanceOrderKeys` 并写入 `order.rebalance` operation，再完成插入或移动；普通拖拽通常只改动目标实体的顺序键。

Dexie 增加以下辅助表：

当前源码以 `src/domain/folder/types.ts` 为准：

- `FolderOperationRow` 保存 `id`、`opId`、`accountScopeId`、`deviceId`、`baseRevision`、`operationType`、`entityId`、`versionStamp`、`payload`、`createdAt` 和 `state`。类型预留 `confirmed-by-remote-provider` 给未来远端 provider；当前 Browser Sync 只使用 `pending` 与 `accepted-by-browser-storage`，后者仅表示本机 Browser Storage 接受写入。
- `FolderSyncStateRow` 保存账号范围、当前 revision、Browser Sync 写入时间、retry、容量测量与警告；不保存 Drive file ID、云端确认时间或云端 revision。
- `FolderSnapshotRow` 保存压缩组织数据、校验 hash、原因、时间及保护租约；`FolderRecoveryStateRow` 单独记录自动恢复点分组和告警。字段精确定义见源码，数据边界见 [Background 数据架构](./background-data-architecture.md)。

`deviceId` 为当前扩展安装实例生成，只保存在 `storage.local`，不能同步到其他设备。所有持久化输入和远端 payload 在 repository/provider 边界使用 zod 校验；无效数据不得部分写入业务表。

### 本地写入事务与 Outbox

组织数据写入在同一个 Dexie 事务中更新业务表和 pending `FolderOperationRow`；设置的 `enabled` 与 `hideOrganizedChats` 以独立的 `settingsPending`/`settingsVersion` 同步，设备本地的 `collapsedFolderIds` 不生成业务 operation：

```text
用户操作
  → 校验 accountScopeId 与输入
  → Dexie transaction
      ├── 更新 ChatReference / Folder / Membership
      └── 写入 pending operation（设置另走 settingsPending）
  → 本地 UI 成功
  → Background SyncScheduler 调度 Coordinator
  → 本机 browser.storage.sync 接受写入后标记 operation
```

后台脚本中断、离线或 provider 失败只影响上传进度，不回滚已完成的本地用户操作。未确认 operation 必须持久化并在扩展重启、网络恢复、页面重新获得焦点或用户手动重试时继续处理。

多层级结构只能通过 repository 的领域方法修改，UI 不得直接更新 `parentFolderId` 或 `orderKey`。当前主要方法包括：

```ts
createFolder(accountScopeId, input)
moveFolder(accountScopeId, folderId, parentFolderId, position)
deleteFolder(accountScopeId, folderId)
upsertMembership(accountScopeId, input)
moveMembership(accountScopeId, folderId, chatId, targetFolderId, position)
removeMembership(accountScopeId, folderId, chatId)
upsertChatReference(accountScopeId, chatId, title)
```

`upsertMembership` 在同一事务中维护 Chat reference 和 membership。每个位置使用相邻实体 ID 表达 `{ beforeId?, afterId? }`，repository 在事务内读取当前兄弟节点并调用 `keyBetween`；UI 不直接计算或提交任意 `orderKey`。这样可以防止陈旧 UI 使用过期相邻 key，同时把循环检测、账号验证、树更新和 outbox 写入保持在同一事务边界。

### 未来 provider 迁移的 Bootstrap 控制面

当前 Browser Sync V3 不使用 Bootstrap。若未来增加 Google Drive 或 provider 切换，再按 `accountScopeId` 设计独立控制面，避免使用跨账号的全局单值：

```ts
export interface FolderSyncBootstrapV1 {
  bootstrapVersion: 1
  accounts: Record<
    string,
    {
      provider: FolderSyncProvider
      enabled: boolean
      authorityEpoch: string
      driveFileIdHint?: string
      driveAccountIdHash?: string
      migration?: {
        id: string
        from: FolderSyncProvider
        to: FolderSyncProvider
        phase: 'preparing' | 'copying' | 'verifying'
      }
      updatedAt: string
    }
  >
}
```

Bootstrap 只用于快速确定 provider 和阻止旧 provider 继续写入。`driveFileIdHint` 不是权威定位：Chrome 与 Firefox 的 Browser Sync 互不连通，新浏览器在用户授权 Drive 后必须能通过 `appDataFolder` 的文件名和 `appProperties` 重新发现数据文件。

以下状态是每台设备独有的进度，不得写入 Bootstrap：`lastAppliedRevision`、pending operation 数量、Drive 文件版本、Drive changes page token、重试时间和最近错误。OAuth access token 或 refresh token 由 provider 的认证层管理，不进入 Sync、Dexie 业务表、备份或导出。

### Browser Sync V3 数据结构与版本

当前实现以 [Browser Sync 数据协议 V3](./browser-sync-data-architecture.md) 为准：一个 Manifest 加编号 Chunk，无 Envelope，无多重 hash，无设置 payload。

- Manifest 保存 schemaVersion、accountScopeId、generationId、dataRevision、authorityEpoch、chunkCount、payloadBytes、payloadHash、settings 与 settingsVersion。
- Chunk 只包含压缩 FolderSyncData，行级 accountScopeId 由 Manifest 注入。
- 两个开关是 Manifest 中的简单 settings 属性，整体 HLC 版本合并；单独修改只写 Manifest。
- collapsedFolderIds 为本设备 UI 状态，不跨设备同步或进入备份，不创建 operation/dataRevision。
- 本地持久化 generation 支持离线修改、中断恢复与重试；Browser Storage 接受不代表远端设备确认。
- 只支持 V3，不迁移未发布的旧协议或旧 Folder 试验数据；Dexie v11 清理 Folder 试验表，当前 schema v12 增加 `folder_recovery_states`，远端使用 `folders:v3` key。

以下 Drive、Bootstrap 和权威切换章节属于后续规划，不是当前 Browser Sync 的实现契约；Drive 接入时需基于 V3 重新制定传输格式。

### Google Drive provider

Google Drive 使用用户授权账号的 `appDataFolder`，并在读写前验证授权账号与当前 `accountScopeId` 一致。Drive 文件通过固定 `appId`、`accountScopeId` 和 `appProperties` 发现；本地与 Bootstrap 中的 `driveFileId` 都只是缓存提示。

Drive 保存完整压缩 Envelope，不受 Browser Sync 单项限制。为避免并发覆盖，数据 generation 使用唯一文件名并保持不可变；一个小型 manifest 文件仅提供最新 revision 的定位提示。即使 manifest 并发覆盖，所有 generation 仍可通过 `appDataFolder` 查询，`parentRevisions` 相同的多个子 revision 被识别为分叉并合并为新 revision，不能静默丢弃其中一支。

拉取流程：

1. 请求 manifest 或 generation 文件元数据，比较服务端 `File.version` 与本地 `driveFileVersion`。
2. 版本相同则无需下载；不同则下载候选 Envelope。
3. 验证账号、authority、hash 和 schema。
4. `dataRevision === lastAppliedRevision` 时只更新 provider 元数据缓存。
5. revision 不同时，将远端状态与本地 pending operations 合并，在 Dexie 事务中更新业务投影和 `FolderSyncStateRow`。

当 Drive 中存在多个文件时，保存 Drive Changes API 的 page token 增量获取变化；page token 只属于当前设备和当前授权账号，保存在本地同步状态。实现参考：<https://developers.google.com/workspace/drive/api/guides/manage-changes>。

### 冲突合并规则

上传前必须确认当前远端 revision 与本地 operation 的 `baseRevision`。若远端已前进，先拉取并合并，再生成新的 `dataRevision`；不能直接用本地完整快照覆盖远端。

| 冲突类型 | P0 规则 |
| --- | --- |
| 同一 Chat 标题缓存不同 | `titleVersionStamp` 较新者胜出；标题变化只更新唯一 Chat reference，不修改 memberships |
| 不同 Folder 的创建或修改 | 直接合并 |
| 不同 Chat 的归属变化 | 直接合并 |
| 同一 Folder 的名称、图标或颜色 | 对应 `fieldVersions` 较新者胜出；并列时由 `deviceId` 确定 |
| 同一成员关系同时加入和移出 | `versionStamp` 较新者胜出；同 stamp 时删除胜出 |
| 两个设备在同一间隙插入不同实体 | 两个实体都保留；按 `(orderKey, entityId)` 确定稳定顺序 |
| 同一 Folder 被并发移动或排序 | 将 `parentFolderId + orderKey` 作为原子位置，`fieldVersions.position` 较新者胜出；同 stamp 时由 `deviceId` 确定 |
| 同一 membership 被并发移动或排序 | `positionVersionStamp` 较新者胜出；同 stamp 时由 `deviceId` 确定 |
| 重平衡与普通插入并发 | 先合并普通实体操作，再基于最新兄弟集合重新生成重平衡，不采用旧的完整 ID 数组 |
| Folder 被移动到自身或后代 | 视为非法 operation 并拒绝，不进入业务投影 |
| Folder 删除与旧设备更新 | tombstone 胜出，旧更新不得复活 Folder |
| 父 Folder 子树删除与后代旧移动 | 子树 tombstone 胜出，旧设备不得把后代移动到根层级使其复活 |

本地只上传明确记录的 pending operations，不根据整份旧本地快照反向推导“新增”，避免长期离线设备重新上线后复活已删除数据。合并完成后必须再次校验账号、父节点存在性和无环约束，再生成 UI 树；非法远端 operation 保留诊断信息但不得部分应用。tombstone 在 P0 不因普通同步自动清理；后续若压缩 tombstone，必须先设计设备水位与过旧客户端强制全量 rebase。

### Browser Sync 切换至 Drive

切换 provider 是单独事务，使用新的 `authorityEpoch` 隔离旧权威：

1. 保持 Browser Sync 为当前权威并暂停发布新远端 revision，本地操作继续进入 outbox。
2. 拉取 Browser Sync 最终状态并合并全部 pending operations。
3. 生成新的 `authorityEpoch`，写入 Drive 初始 generation。
4. 从 Drive 读回并验证账号、revision 和 hash。
5. 更新 Bootstrap：`provider = 'google-drive'`、新 epoch、迁移完成。
6. Browser Sync 仅保留 Bootstrap、Drive 定位提示和旧 generation 的临时回退信息，不再保存完整活动数据。
7. 其他设备发现 provider/epoch 变化后停止向旧 Browser Sync generation 写入；完成 Drive 授权后从 Drive 重建本地投影。

任一步失败都不切换 Bootstrap，Browser Sync 继续保持权威。不得让 Browser Sync 与 Drive 同时作为完整数据的双主库。

### 本地与手动备份

本地快照保存在扩展 origin 的 Dexie，不占用 Browser Sync 配额，策略如下：

- 每个 `accountScopeId` 最多 10 份，无时间过期。所有账号的快照合计共用 20 MiB 预算；预算统计压缩 payload 与元数据的序列化 UTF-8 字节数，不声称等于 IndexedDB 的实际磁盘占用。
- 首次结构变更立即生成自动快照。与上一操作间隔不超过 60 秒且当前组未满 5 分钟时，只更新当前组的自动点。`folder_recovery_states` 持久保存组 ID、开始时间、最后操作时间与失败状态；不依赖 Service Worker 内存或防抖定时器。旧组、手动点和保护点不被分组合并覆盖。
- 手动创建及删除、导入、恢复前的保护点结束当前自动组。`organizationHash` 只包含可恢复的 Folder、membership、排序、置顶和标题内容，忽略时间戳、版本戳、导出时间和界面偏好。相同组织复用已有压缩 payload，累计 `reasons` 并更新 `updatedAt`；`contentHash` 继续独立校验完整 payload。
- 数量淘汰优先保留最近 3 个手动／保护点，其余名额按最新保存时间补齐。容量淘汰先删除最旧普通点，再删除最旧重要点；重要点不是永久固定版本。单份快照超过预算时不静默跳过保护，返回可操作错误并提示先导出备份。
- 操作执行期间为保护点和恢复目标登记独立保护租约。正常完成或失败后释放；后台／页面消失时租约最长 15 分钟后失效。租约只保护恢复点，不代表已经批准继续破坏性操作。同一内容被多个操作复用时，一个操作释放租约不得解除其他操作的保护。启动时及写入时清理数量／容量超限历史。
- 删除、导入和恢复必须先成功写入保护点。Folders 内触发的 Gemini 聊天删除也先保存 Folder 组织保护点，再调用 Gemini，成功后更新本地归属；该快照不能恢复 Gemini 聊天本身。普通自动快照失败时保留已完成业务事务和 Outbox，并记录恢复告警。

容量检测只在后台／扩展页面使用 `navigator.storage.estimate()`，不能在 Gemini content script 中测量。写入前预留 `max(1 MiB, 本次快照序列化字节数 × 3)`，覆盖索引、编码及操作记录的额外开销。测量缺失时不假设配额为零，仍尝试写入并处理真实错误。估算不足时先回收未被租约锁定的历史并重新测量；实际 `QuotaExceededError` 同样回收并只重试一次。自动恢复点合并失败不会删除原有组快照。

`unlimitedStorage` 已在 Chrome 与 Firefox manifest 中声明为必需权限，没有运行时授权页或 Settings 权限申请流程。权限存在时跳过浏览器配额预检门槛，但仍执行每账号 10 份／全扩展 20 MiB 策略，并处理实际写入失败。估算值只作诊断，不能单独推断“本次更改未保存”；失败的删除、导入或恢复须由用户手动重试。


历史版本 UI 仅提供当前 `accountScopeId` 的账号级恢复点，不支持按单个 Folder、单条 membership 或手动命名版本恢复。每个恢复点显示最后保存时间 `updatedAt ?? createdAt` 与本地化的 `reasons ?? [reason]`；选择恢复点时先将其组织投影与当前投影比较，生成 Folder、新增/移除 membership 与排序变化的影响摘要。用户确认后先写入 `before-restore` 快照，再在一个事务中恢复 `folders`、`folder_memberships` 与所需 `chat_references`。`FolderSettingsRow` 不从历史版本回滚：`enabled`、`hideOrganizedChats` 与 `collapsedFolderIds` 必须保留当前值，避免恢复改变原生 Recents 的可见性或当前界面状态。

手动导出是独立的可读版本化 JSON，不直接导出 provider Chunk。当前结构为：

```ts
export interface FolderExportPayload {
  schemaVersion: 1
  exportedAt: string
  accountScopeId: string
  folders: FolderRow[]
  memberships: FolderMembershipRow[]
  chatReferences: ChatReferenceRow[]
  settings: { enabled: boolean; hideOrganizedChats: boolean }
  settingsVersion: string
}
```

导入顺序为：解析文件 → zod 校验 → 校验 schema 和 `accountScopeId` → 校验 Chat reference 与 membership 引用完整性 → 校验父节点、无环、深度和 `orderKey` → 展示覆盖确认 → 创建 `before-import` 快照 → Dexie 事务写入 → 生成新的同步 revision。普通导入只允许同一 `accountScopeId`；不得导入 OAuth token、deviceId、provider 状态或运行时错误。导入文件中的顺序键必须通过协议校验，不能接受任意超长或非 ASCII 字符串。

恢复本地快照同样先创建 `before-restore` 快照，恢复结果作为一个新的业务 revision 发布，不能将远端 revision 指针直接倒退。验证或影响摘要生成失败时不得开始恢复，也不得局部写入业务表。

### 数据模块失效保护与验证

1. 当前身份不可用或不唯一、且没有有效手动选择或最近账号时，清空内存投影和订阅，不读取、展示或写入任何账号数据；持久化数据保持不变。手动选择与相同邮箱的自动身份共用 Folder 数据及 Browser Sync，原生 Recents 隐藏按当前 scope 设置执行；手动选择不验证 Gemini 登录身份。
2. provider 拉取、解压、hash 或 schema 校验失败时继续使用最后一个已验证的本地投影，并显示可重试错误；不得用空数组覆盖本地或云端。
3. Sync 配额、Drive 授权或网络失败时，本地写入和 outbox 保持可用；恢复后继续同步。
4. 每个 repository 方法测试缺失 `accountScopeId`、跨账号 ID、Chat reference upsert、标题只更新一次、重复成员关系、跨层移动、移动到自身或后代、子树删除、软删除和事务回滚。
5. tree projection 测试根节点、多层嵌套、Folder/Chat 混合排序、一个 Chat 的多个 membership 解析到同一 reference、缺失或跨账号 Chat reference、深度边界、重复 ID、孤儿和循环。
6. order key 测试空列表、头部、尾部、中间插入、批量生成、并列稳定排序、长 key 重平衡和跨浏览器固定测试向量。
7. codec 测试单 Chunk、多 Chunk、缺 Chunk、乱序 Chunk、错误 hash、旧 schema 和压缩失败。
8. Browser Sync provider 测试 generation 写入中断后的本地恢复、Manifest 竞争、峰值配额不足和本机数据保留。
9. Drive provider 测试账号不匹配、文件重新发现、File.version 未变化、revision 分叉、changes page token 和授权失效。
10. 同步集成测试至少覆盖：两设备离线创建、同 Folder 并发编辑、两个设备在同一间隙插入、同节点并发跨层移动、子树删除与旧移动冲突、删除不复活、Browser Sync → Drive 成功迁移和迁移中断回滚。

### Folders 验收

- 无账号、账号识别中、身份不唯一、账号切换前后均不会显示其他账号的 Folder 名或 Chat 标题。
- 账号头部被替换后，旧数据先从 UI 和内存卸载，再加载新 scope；持久化数据不被删除。
- SideNav 缺失、Chats 区块不存在或 selector 全部失配时，Folders 不插入空壳、不影响 Gemini 原生导航，并可在后续重绘时恢复。
- 每个有效选择器候选都经过当前 Gemini 页面验证，且对应测试覆盖其语义和降级行为。
- 数据模型可保存和恢复多层级 Folder；跨层拖拽不会形成循环、孤儿或跨账号父子关系，UI 树与扁平持久化投影一致。
- 新建、插入和移动节点通过 `orderKey` 保持稳定顺序；两个设备在同一位置插入不同节点时均不会丢失，重平衡不会覆盖并发新增节点。
- 同一 Chat 加入多个 Folder 时只保存一份标题缓存；标题变化后所有 Folder 投影读取同一 Chat reference，不出现关系记录之间的标题分叉。
- Browser Sync 占 Folder 的 70 KiB 预算达到 80% 时显示容量提示；配额不足时本地数据和待同步操作仍完整保留。本机写入通过不代表跨设备到达。
- Drive 授权账号与 Gemini 当前账号不一致时不读写数据；切换 Drive 后 Browser Sync 不再作为完整数据双主。
- 离线、多标签和多设备并发不会静默覆盖已确认的远端修改，删除数据不会被旧设备复活。
- 本地自动备份、导出、导入和恢复均按账号隔离，并在覆盖当前状态前提供可回退保护点。
