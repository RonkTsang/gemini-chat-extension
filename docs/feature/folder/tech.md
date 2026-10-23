# Folders 技术设计

> 实现基线：Folder Repository、Dexie、同步调度和恢复点由扩展后台持有，页面通过 Folder RPC 交互；Browser Sync V4 是当前唯一跨设备 provider。Dexie 表定义以 `src/data/db.ts` 为准，Google Drive 尚未实现。文中的 Drive provider、Bootstrap 和 provider 切换章节均为未来方案，不属于当前代码能力。后台 RPC 细节见 [Background 数据架构](./background-data-architecture.md)，同步格式见 [Browser Sync V4](./browser-sync-data-architecture.md)。

> 提交后任务首版已实现，见 [本地事务与提交后任务方案](./post-commit-task-architecture.md)：事务原子更新 Recovery pending，返回提交结果；普通回复、自动 Recovery 和 SYNC 独立推进。自动化验证及双平台构建通过，真实页面新版加载尚待验证。

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

Folders 数据模块采用本地优先模型：扩展 origin 的 Dexie/IndexedDB 是当前设备的工作数据和离线数据源；当前通过 `browser.storage.sync` 在浏览器管理的设备间传播当前有效组织与同步设置的完整快照，接收时整体替换。GPK 只能确认本机 Browser Storage 写入结果，不能确认云端传播。Google Drive 尚未实现。持久化模型支持多层级 Folder 父子关系，但当前 UI 只开放根 Folder。

数据模块只保存 Folder、Chat 归属关系、必要的 Chat 标题缓存、功能设置、同步元数据和恢复快照；不读取或保存 Gemini 聊天正文。所有公开查询和写入必须显式传入 `accountScopeId`，repository 不提供跨账号的无范围读取接口。

数据模块分为：

1. **数据面**：当前有效的 Chat 引用、Folder、成员关系和设置。
2. **控制面**：数据格式版本、本机修订、同步基准、dirty、每账号一份待发布快照和冲突候选，以及重试和容量事实。

控制面不得混入业务数据；Drive token、原始邮箱和运行时错误不得写入 `browser.storage.sync`、手动导出或自动备份。

### 领域与本地表结构

精确类型以 `src/domain/folder/types.ts` 为准：

- Folder 保存 ID、scope、父节点、名称、图标、颜色、普通顺序和创建/更新时间。
- Membership 保存 ID、scope、Folder/Chat ID、普通顺序、可选置顶顺序和创建/更新时间。
- Chat reference 以账号和 Chat ID 唯一保存标题缓存及创建/更新时间，不保存 Gemini 正文。
- Settings 保存两个同步开关与本机 `collapsedFolderIds`；同步开关的修改推进账号修订和 dirty，本机展开/收起不触发同步。
- Sync state 保存 `baseSnapshotId`、`localDataRevision`、dirty、错误、重试和容量。发布和冲突表均以账号为唯一 key，每账号最多一行。

不保留行级或字段级 HLC 合并版本、删除标记、永久 Outbox 或已完成发布历史。删除子树或成员关系时物理移除记录，并清理没有其他 membership 引用的 Chat reference。

Folder 采用邻接表，根节点使用 `ROOT_FOLDER_ID = '__root__'`，非根父节点必须属于相同账号。技术安全上限为 `MAX_FOLDER_DEPTH = 32`，写入、导入和同步验证统一约束。当前 UI 仅开放根 Folder。

`iconKey` 使用现有图标目录；自定义 `colorValue` 必须规范化为不透明六位 Hex。Membership 不复制标题，Chat reference 供同 Chat 的多个 Folder 关系复用。一个 Chat 在同一 Folder 只能有一个 membership，跨 Folder 可以重复加入。

普通顺序使用固定宽度 Base62 `orderKey`，置顶使用独立 `pinnedOrderKey`。展示和分页先置顶后普通，组内按对应 key 和实体 ID 的 ASCII 顺序排序。数据库索引以 `src/data/db.ts` 为准。

### 多层级树约束

1. 新建子 Folder、移动 Folder 和导入数据必须验证父节点属于同一 `accountScopeId`。
2. Folder 不能以自身或任一后代作为父节点；移动前沿目标父节点的祖先链向上检查，发现当前 Folder 即拒绝事务。
3. `parentFolderId` 与 `orderKey` 是一个原子位置；跨层移动必须在同一事务中一起更新。
4. 删除 Folder 固定采用子树删除：在同一事务中实际删除目标 Folder、全部后代及子树内 membership；不提升子节点，也不删除 Gemini Chat。仍被子树外 membership 引用的 Chat reference 必须保留；没有其他 membership 引用的 reference 同时删除。repository 提交后不得产生可见孤儿节点。
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

`entries` 将子 Folder 与 Chat membership 放在同一个有序集合中，以保留混合拖拽顺序，并通过 `chatId` 关联唯一的 Chat reference。投影器先按 ID 建立索引，再按 `parentFolderId` 分组挂载子树，复杂度保持为 `O(folders + memberships + chatReferences)`；禁止为每个 Folder 或 membership 单独查询一次数据库。每条 membership 必须解析到同账号 Chat reference；投影失败时返回结构化错误，不得静默复制标题、放置孤儿节点或混用其他账号缓存。

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

生成结果必须满足 `previous < newKey < next`；缺少一侧边界时生成小于首项或大于末项的键。新建、单项拖拽和跨层移动通常只更新目标实体的 `orderKey`，不重写其他兄弟节点。跨设备不逐项合并位置；收到的完整快照整体替换顺序，检测到本机未发布修改分叉时由用户选择一份完整状态。

同一组输入必须在所有支持的浏览器上生成相同结果；编码字母表、边界行为或比较规则发生不兼容变化时需更新 Browser Sync 协议版本，不能只发布本地实现变更。

当两键之间没有可用的 32 位 Base62 值时，Repository 对当前兄弟节点调用 `rebalanceOrderKeys` 并在同一事务中完成重平衡和插入或移动；普通拖拽通常只改动目标实体的顺序键。

### 本地事务与同步状态

业务事务同时修改组织或同步设置、账号修订和 dirty；组织变更还标记 Recovery pending。事务提交后通过普通分发函数独立唤醒 Sync 与 Recovery，不等待同步或普通自动点完成后再回复用户。local-view 修改只保存本机偏好。

每账号持久化一份待发布 payload，可在重启及写入中断后复用同一 snapshotId。发布完成按捕获修订确认 dirty，期间的新组织和设置修改保留待发布。每账号最多一份冲突候选，不保存永久 operation 或 generation 历史。

保护恢复点仍在删除、导入、恢复及同步覆盖之前执行；保护失败不进行对应破坏性动作。完整架构见 [Background 数据架构](./background-data-architecture.md) 与 [提交后任务](./post-commit-task-architecture.md)。

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

`upsertMembership` 在同一事务中维护 Chat reference 和 membership。每个位置使用相邻实体 ID 表达 `{ beforeId?, afterId? }`，repository 在事务内读取当前兄弟节点并调用 `keyBetween`；UI 不直接计算或提交任意 `orderKey`。这样可以防止陈旧 UI 使用过期相邻 key，同时把循环检测、账号验证、树更新、账号修订与 dirty 保持在同一事务边界。

### 未来 provider 迁移的 Bootstrap 控制面

当前 Browser Sync V4 不使用 Bootstrap。若未来增加 Google Drive 或 provider 切换，再按 `accountScopeId` 设计独立控制面，避免使用跨账号的全局单值：

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

### Browser Sync V4 数据结构与版本

完整契约见 [Browser Sync 完整快照协议 V4](./browser-sync-data-architecture.md)。

- 每账号固定 Manifest 和编号 Chunk key，Chunk 包含 snapshotId 与压缩片段；所有块齐全、同属一份快照、通过字节数/hash/schema/树与引用校验后才应用。
- Manifest 包含协议、账号、snapshotId、baseSnapshotId、分块数量、字节数/hash 及完整同步设置。
- clean 本机自动接收不同完整快照；dirty 且存储仍是基准时发布；dirty 遇到不同快照则持久冲突，选择整份本机或同步版本。
- 组织与同步设置原子接收；本地收起状态保留有效 Folder ID。缺块、损坏或已有基准而 Manifest 消失都不清空本机，也不自动发布旧数据覆盖异常副本。
- 固定分块覆盖节省空间，发布中断期间同步区可能暂时不可读；本机持久数据和待发布内容用于恢复。
- 全部账号 Folder key 共用 70 KiB，预检包含 key/envelope/Manifest/尾块及其他扩展数据，并遵守实际浏览器配额。
- Folder 尚未上线，本次不迁移未发布实验数据。上线后所有已发布格式须可被新版无损读取和升级，并保护新旧设备混用、备份/恢复点及未完成任务的数据；参见 [格式演进约束](./browser-sync-data-architecture.md#9-上线后的数据保留与格式演进)。Browser Storage 接受写入不代表云端确认。

以下 Drive 与权威切换章节仅为后续规划，不是当前 Browser Sync 契约，接入时须另行批准协议、冲突与容量规则。

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

### Browser Sync 冲突处理

本机记录工作数据所基于的快照 ID 与 dirty，不使用时间大小判断跨设备先后。收到不同快照且本机没有未发布修改时，保护旧组织后原子替换；本机有修改则暂停自动覆盖。

Settings 的“使用同步版本”和“使用此设备版本”均绑定本机修订及候选快照 ID。执行前重读和校验；版本变化要求重新评估，丢弃任一组织版本前保存有上限的保护点。选择同步版本原子替换；选择本机版本以当前同步快照为基准新发布。

没有本机修改的长期离线设备只接收完整状态，不根据旧记录推导新增或重新上传。浏览器没有跨设备 CAS，尚未到达的其他设备修改可能无法立即发现，不能宣称保留所有并行更改。不同快照不执行实体并集。

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

- SYNC、快照与导出共用唯一的 `FolderOrganizationData` 类型、schema、账号转换和编码实现，核心只包含无行级 `accountScopeId` 的 `folders`、`memberships`、`chatReferences`，保留置顶、排序、版本与删除标记。快照只压缩这份核心数据；账号、数据 revision、时间、原因、哈希和保护租约保存在 `FolderSnapshotRow` 外层，不包含 settings 或导出元数据。
- 压缩使用原生 `CompressionStream('gzip')` / `DecompressionStream('gzip')`。恢复点 schemaVersion 1 的正文为 ArrayBuffer，contentHash 校验 gzip 二进制，payloadBytes 为二进制 byteLength；Browser Sync v4 正文为 gzip 的 Base64，payloadBytes/hash 校验传输字符串。共享 stableStringify，JSON 导出仍不压缩。压缩、解压与 hash 均在 IndexedDB 事务外；流接口缺失应报错，不将环境能力缺失标为快照损坏。Folder 未发布，本次直接定义最终格式，不保留 lz-string 兼容或开发数据迁移。
- 每个 `accountScopeId` 最多 10 份，无时间过期。所有账号的快照合计共用 20 MiB 预算；预算统计 gzip 二进制正文的 byteLength 加持久化元数据的 JSON UTF-8 字节数（仅排除响应用 protectionToken），不声称等于 IndexedDB 的实际磁盘占用。
- 结构变更在事务中持久化自动恢复需求，提交后由独立 RecoveryRunner 读取最新状态并保存，普通命令不等待它。与上次自动保存间隔不超过 60 秒且当前组未满 5 分钟时，只更新当前组的自动点。`folder_recovery_states` 持久保存组 ID、开始时间、最后保存时间、pendingRevision 与失败状态；不依赖 Service Worker 内存或防抖定时器。旧组、手动点和保护点不被分组合并覆盖。
- 手动创建及删除、导入、恢复前的保护点结束当前自动组。`organizationHash` 只包含可恢复的 Folder、membership、排序、置顶和标题内容，忽略时间戳、版本戳、导出时间和界面偏好。相同组织复用已有压缩 payload，累计 `reasons` 并更新 `updatedAt`；`contentHash` 继续独立校验完整 payload。
- 数量淘汰优先保留最近 3 个手动／保护点，其余名额按最新保存时间补齐。容量淘汰先删除最旧普通点，再删除最旧重要点；重要点不是永久固定版本。单份快照超过预算时不静默跳过保护，返回可操作错误并提示先导出备份。
- 操作执行期间为保护点和恢复目标登记独立保护租约。正常完成或失败后释放；后台／页面消失时租约最长 15 分钟后失效。租约只保护恢复点，不代表已经批准继续破坏性操作。同一内容被多个操作复用时，一个操作释放租约不得解除其他操作的保护。启动时及写入时清理数量／容量超限历史。
- 删除、导入和恢复必须先成功写入保护点。Folders 内触发的 Gemini 聊天删除也先保存 Folder 组织保护点，再调用 Gemini，成功后更新本地归属；该快照不能恢复 Gemini 聊天本身。普通自动快照失败时保留已完成业务事务与 dirty/待发布内容，并记录恢复告警。

容量检测只在后台／扩展页面使用 `navigator.storage.estimate()`，不能在 Gemini content script 中测量。写入前预留 `max(1 MiB, 本次快照序列化字节数 × 3)`，覆盖索引、编码及操作记录的额外开销。测量缺失时不假设配额为零，仍尝试写入并处理真实错误。估算不足时先回收未被租约锁定的历史并重新测量；实际 `QuotaExceededError` 同样回收并只重试一次。自动恢复点合并失败不会删除原有组快照。

`unlimitedStorage` 已在 Chrome 与 Firefox manifest 中声明为必需权限，没有运行时授权页或 Settings 权限申请流程。权限存在时跳过浏览器配额预检门槛，但仍执行每账号 10 份／全扩展 20 MiB 策略，并处理实际写入失败。估算值只作诊断，不能单独推断“本次更改未保存”；失败的删除、导入或恢复须由用户手动重试。


历史版本 UI 仅提供当前 `accountScopeId` 的账号级恢复点，不支持按单个 Folder、单条 membership 或手动命名版本恢复。每个恢复点显示最后保存时间 `updatedAt ?? createdAt` 与本地化的 `reasons ?? [reason]`；选择恢复点时先将其组织投影与当前投影比较，生成 Folder、新增/移除 membership 与排序变化的影响摘要。用户确认后先写入 `before-restore` 快照，再在一个事务中恢复 `folders`、`folder_memberships` 与所需 `chat_references`。`FolderSettingsRow` 不从历史版本回滚：`enabled`、`hideOrganizedChats` 与 `collapsedFolderIds` 必须保留当前值，避免恢复改变原生 Recents 的可见性或当前界面状态。

手动导出是独立的可读版本化 JSON，不直接导出 provider Chunk。当前结构为：

```ts
export interface FolderOrganizationData {
  folders: Omit<FolderRow, 'accountScopeId'>[]
  memberships: Omit<FolderMembershipRow, 'accountScopeId'>[]
  chatReferences: Omit<ChatReferenceRow, 'accountScopeId'>[]
}

export interface FolderExportPayload {
  schemaVersion: 1
  exportedAt: string
  accountScopeId: string
  data: FolderOrganizationData
}
```

导出不压缩，当前账号在同一只读事务中读取三类业务记录。导入和恢复从外层 scope 为记录补回 `accountScopeId`，校验关系完整性后写入，并保留当前 settings；还会检查全局记录 ID，防止覆盖其他账号已有记录。Folder 尚未上线，本次直接调整实验格式；正式发布后的备份和快照 payload 必须保留版本读取及转换能力，不能因主数据格式升级而失效。

导入顺序为：解析文件 → zod 校验 → 校验 schema 和 `accountScopeId` → 校验 Chat reference 与 membership 引用完整性 → 校验父节点、无环、深度和 `orderKey` → 展示覆盖确认 → 创建 `before-import` 快照 → Dexie 事务写入 → 生成新的同步 revision。普通导入只允许同一 `accountScopeId`；不得导入 OAuth token、deviceId、provider 状态或运行时错误。导入文件中的顺序键必须通过协议校验，不能接受任意超长或非 ASCII 字符串。

恢复本地快照同样先创建 `before-restore` 快照，恢复结果作为一个新的业务 revision 发布，不能将远端 revision 指针直接倒退。验证或影响摘要生成失败时不得开始恢复，也不得局部写入业务表。

### 数据模块失效保护与验证

1. 当前身份不可用或不唯一、且没有有效手动选择或最近账号时，清空内存投影和订阅，不读取、展示或写入任何账号数据；持久化数据保持不变。手动选择与相同邮箱的自动身份共用 Folder 数据及 Browser Sync，原生 Recents 隐藏按当前 scope 设置执行；手动选择不验证 Gemini 登录身份。
2. provider 拉取、解压、hash 或 schema 校验失败时继续使用最后一个已验证的本地投影，并显示可重试错误；不得用空数组覆盖本地或云端。
3. Sync 配额、Drive 授权或网络失败时，本地写入与 dirty/待发布内容保持可用；恢复后继续同步。
4. 每个 repository 方法测试缺失 `accountScopeId`、跨账号 ID、Chat reference upsert、标题只更新一次、重复成员关系、跨层移动、移动到自身或后代、子树物理删除、无人引用缓存清理和事务回滚。
5. tree projection 测试根节点、多层嵌套、Folder/Chat 混合排序、一个 Chat 的多个 membership 解析到同一 reference、缺失或跨账号 Chat reference、深度边界、重复 ID、孤儿和循环。
6. order key 测试空列表、头部、尾部、中间插入、批量生成、并列稳定排序、长 key 重平衡和跨浏览器固定测试向量。
7. codec 测试单 Chunk、多 Chunk、缺 Chunk、乱序 Chunk、错误 hash、旧 schema 和压缩失败。
8. Browser Sync provider 测试 固定分块写入中断后的本地恢复、Manifest 竞争、配额不足和本机数据保留。
9. Drive provider 测试账号不匹配、文件重新发现、File.version 未变化、revision 分叉、changes page token 和授权失效。
10. 当前同步集成测试覆盖：旧 clean 设备替换且不重新发布、账号隔离、dirty 分叉与两种选择、保护失败、发布期间新修改、空与缺失、混合分块、断写重启和有界清理。Drive 接入后的验收另行制定。

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
