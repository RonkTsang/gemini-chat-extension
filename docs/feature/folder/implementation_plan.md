# Folders 实施计划

> 实现基线：后台数据边界、Folder RPC、Browser Sync V3、分页查询和本地恢复能力已进入当前源码；`collapsedFolderIds` 仅本机保存，旧协议不迁移。Google Drive 尚未实现。此计划记录源码范围，不代替 Gemini 实页、浏览器云端传播或发布验收证据。

## 1. 计划目标

本计划将 Folders 拆分为两个可独立验收的里程碑：

1. **Milestone 1：Folders 基础功能**
   交付完整的本地优先体验、Browser Sync、备份恢复和与 Gemini 的页面集成。
2. **Milestone 2：Google Drive 集成**
   在不重写数据模型和业务 UI 的前提下，增加 Drive 授权、云端 provider、权威切换、跨浏览器同步与完整同步状态。

里程碑边界不按“本地版”和“云端版”分割数据能力。Milestone 1 必须先实现Manifest 与业务数据分离、revision、Outbox、tombstone、确定性冲突规则和 provider 抽象；Milestone 2 只增加 Drive 传输与权威迁移。这样可避免 Drive 接入时再决定“本地还是云端为准”。

Milestone 1 覆盖当前 PRD 的 P0 范围，包括 Browser Sync 和本地恢复能力。Milestone 2 是尚未实现的 Google Drive 扩展，不是当前 P0 可用能力，也不是将当前 P0 标记完成的前置条件。发布状态仍需以独立的实页、构建和跨设备验收记录为准。

## 2. 范围决策

### 2.1 Milestone 1 必须交付

- 按 Gemini 页面当前用户隔离的 Folder、Chat 引用、归属关系和设置。
- 扁平 Folder UI，但数据模型保留 `parentFolderId` 和同父级排序能力。
- SideNav 创建、编辑、删除、展开、收起、排序与 Chat 展示。
- Gemini Chat 原生菜单的 `Add to Folder` 入口，以及拖拽加入。
- Chat 可加入多个 Folder；移出 Folder 与删除 Gemini Chat 是两条独立流程。
- “隐藏已加入 Folder 的聊天”及全部失效保护。
- IndexedDB 本地数据、持久化 Outbox、Browser Sync、容量保护和原子 generation 切换。
- 本地恢复点、导入、导出和覆盖前保护快照。
- Folders 设置页、多语言文案、可访问性与 Chrome/Firefox 验证。

### 2.2 Milestone 1 不包含

- Google Drive OAuth、Drive API 和 Drive 同步状态。
- 子 Folder 的用户可见入口、跨层拖拽或递归管理。
- 远程下发 DOM selector。
- 导入时自动合并两份用户数据。
- Gemini 聊天正文存储、修改或迁移。

### 2.3 Milestone 2 必须交付

- Chrome 和 Firefox 的 Google OAuth 授权与授权失效处理。
- 授权 Google 账号与当前自动识别的 Gemini 账号一致性校验。
- Drive `appDataFolder` 中的 immutable generation、manifest 提示、文件重新发现与 Changes API 增量检查。
- Browser Sync 到 Drive 的可回滚权威切换，使用新 `authorityEpoch`。
- 分叉 revision 检测、合并与回写，不引入双主。
- Drive 的已同步、正在同步、等待网络、失败、重新授权和账号不匹配状态。

## 3. 已固化的架构决策

以下决策已用于当前实现，保留此表作为架构约束和源码定位；不是待批准事项。

| 决策项 | 要求 | 产出 |
| --- | --- | --- |
| 根 Folder 表示 | 持久化、同步协议、PRD 和 Roadmap 统一以 `ROOT_FOLDER_ID` 表示根节点；面向用户的说明称“根 Folder”。 | 已同步至当前领域类型与产品/技术文档。 |
| 同步运行时归属 | Folder Repository、Dexie、Outbox 和 Sync Scheduler 由扩展后台持有；content script 通过 Folder RPC 发起查询和命令。Coordinator 从扩展 origin Dexie 获取带 TTL 的 per-account lease，不依赖长驻内存状态。 | 已落地于 `src/entrypoints/background/folders/`、`src/integrations/extension-rpc/` 和 `src/entrypoints/content/folders/client.ts`。 |
| SideNav 渲染 | Folder 面板通过独立 Shadow DOM host 插入 Chats section 之前；编辑弹窗和选择层使用全局 overlay。 | mount/unmount 契约和原型。 |
| Gemini 原生菜单 | 菜单内只注入可幂等清理的 host/分隔符；真正的 Folder 选择层仍由 GPK Shadow DOM overlay 渲染。 | DOM fixture 和焦点/关闭原型。 |
| Chat 删除 | 复用并补强已有 Gemini 删除能力，明确“Gemini 成功后再删本地索引”的返回契约。 | 可测试的 delete adapter。 |
| Drive OAuth | Milestone 2 第一个任务先完成 Chrome/Firefox 技术验证，再决定 manifest 权限、client ID 配置、token 保管和上架说明。 | 已审核的平台方案和最小权限列表。 |

## 4. 目标代码边界

计划中的主要模块如下。具体文件可在实现中小幅调整，但不应破坏边界。

```text
src/
├── domain/folder/                  # 类型、zod schema、HLC、order key、树投影
├── data/
│   ├── db.ts                          # 当前 Dexie v12 表和迁移
│   └── repositories/folderRepository.ts
├── services/
│   ├── gemini-dom/selectors.ts
│   ├── gemini-identity/               # 页面身份与变化订阅
│   ├── folder-recovery/             # automatic/manual/protection snapshots
│   └── folder-sync/
│       ├── coordinator.ts
│       ├── codec.ts
│       ├── merge.ts
│       └── providers/
│           ├── browser-sync.ts
│           └── google-drive.ts         # Milestone 2, not implemented
├── entrypoints/content/folders/      # DOM 控制器、SideNav host、原生菜单桥接、失效保护
├── entrypoints/content/overlay/folders/ # 选择层、编辑与确认弹窗
├── components/folders/              # 可复用 Folder/Chat UI
└── components/setting-panel/views/folders/
```

边界规则：

- React 组件不直接操作 Dexie、`browser.storage.sync` 或 Drive API。
- DOM 控制器不保存业务数据；它只解析经验证的 `chatId`、anchor 和生命周期信号。
- Repository 的每个公开方法都必须接收 `accountScopeId`，不提供跨账号默认查询。
- 业务写入和 Outbox 记录在同一 Dexie transaction 中完成。
- Browser Sync 和 Drive 复用业务模型、codec、revision 和 merge；Browser Sync 的 Manifest V3 独立承载设置，provider 只负责传输。
- 原始邮箱、OAuth token、运行时错误和 Gemini 正文不进入 Folder 业务表、同步 payload 或导出文件。

## 5. Milestone 1：Folders 基础功能

### M1.0 契约固化与技术验证

**工作**

- 解决第 3 节的前置决策并回写 PRD/tech plan/Roadmap。
- 在当前 Gemini 已登录页面验证账号节点、SideNav、Chats section、Chat link、active row、menu trigger 和 open menu。
- 使用当前 DOM 样本建立脱敏 fixture，覆盖主路径、回退 selector、多重命中和重绘。
- 验证 SideNav Shadow DOM host 与原生菜单桥接的定位、焦点、滚动和清理。
- 固定 Browser Sync Manifest V3、业务数据 schema 与 order-key 测试向量。

**退出条件**

- 没有未决定的核心数据类型、同步权威或 DOM 挂载方式。
- 原型在 Chrome 和 Firefox 中可挂载、关闭和重新挂载，不影响 Gemini 原生导航和菜单。

### M1.1 领域模型、Dexie 与 Repository

**工作**

- 新增 Folder、membership、chat reference、settings、operation、sync state、snapshot 和 coordinator lease 表。
- 以当前 Dexie schema v12 为基线；v11 清理未发布的 Folder 试验表，v12 增加恢复状态表，不改写其他功能数据。
- 实现 zod 边界校验、HLC + device ID、fractional order key 和扁平数据到树投影。
- 实现 account-scoped Repository，所有变更与 Outbox 原子写入。
- P0 暂不暴露子 Folder UI，但树校验、无环、深度上限和子树 tombstone 必须在数据层成立。

**退出条件**

- Repository 单测覆盖跨账号访问、重复 membership、事务回滚、软删除、排序、循环/孤儿数据和一个 Chat 多 Folder。
- 固定 order-key 向量在 Chrome/Firefox 的执行环境中产生一致结果。

### M1.2 用户身份与 DOM 基础设施

**工作**

- 实现 `GeminiIdentityService` 的 observed/manual-confirmed 契约、去重、规范化、hash 和变化订阅。
- 实现集中 selector 配置和按业务语义的查询流程。
- 账号变化时先卸载旧投影和订阅，再加载新 scope。
- 身份未知、不唯一或未登录时，隐藏旧数据并禁止写入，但不删除持久化数据。
- 手动邮箱只对当前页面会话有效，且禁用 Browser Sync 跨设备传播与 Recents 隐藏；Drive 尚未实现。

**退出条件**

- DOM fixture 单测与真实页面手动验证都通过。
- 在页面内切换账号、URL 变化、focus 恢复和账号头重绘后不泄漏旧账号的 Folder 名或 Chat 标题。

### M1.3 Folder 核心 UI 竖切

**工作**

- 将 Folders controller 接入 `src/entrypoints/content/index.tsx` 的启动和 `ctx.onInvalidated` 清理流程。
- 实现 account-scoped 前端投影 store 和跨标签数据失效通知，React 组件只消费投影和 command。
- 插入 SideNav 面板，实现 Header、默认前 5 项、See more/Show less、Folder 展开/收起与设置入口。
- 实现 New/Edit Folder 弹窗、名称校验、图标和颜色选择、放弃变更确认。
- 实现 Folder 删除确认和受影响 Chat 去重数量。
- 实现 Folder 排序，UI 仅传递相邻实体 ID，不生成 `orderKey`。

**退出条件**

- 用户可从空数据完成创建、编辑、排序和删除，重载后结果一致。
- SideNav 重绘、收起/展开、功能停止和内容脚本失效时，旧 host、observer 和事件监听全部清理。

### M1.4 Chat 归类与 Gemini 集成

**工作**

- 使用 `active row + trigger aria-controls + menu.id` 唯一确认当前 Chat 和原生菜单。
- 幂等注入 `Add to Folder`，实现左右翻转、高度限制、已加入禁用态和 `New Folder`。
- 实现 Chat 项拖放到 Folder、Folder 内 Chat 排序和多 Folder 归属。
- 实现 `Remove from folder` 独立确认流程。
- 实现 `Delete chat`：只有 Gemini 删除成功后才以事务方式删除所有 membership 和无用标题缓存。
- 实现 Recents 隐藏标记与重新计算，当前 Chat、置顶 Chat 和手动身份模式不隐藏。
- selector 失配、身份异常、Folders 关闭或 runtime 异常时立即恢复原生 Recents。

**退出条件**

- 拖拽和原生菜单两条入口都能完成归类，且不修改 Gemini 原生 Chat DOM 数据。
- 菜单关闭、锚点断开、滚动、resize、点击外部、`Escape` 和账号切换后不留残留 UI。
- 删除 Gemini Chat 失败时 Folder 索引保持不变。

### M1.5 Browser Sync、备份与设置

**工作**

- 实现稳定 JSON 序列化、压缩、hash、Manifest、payload 校验和合并器。
- 实现 Browser Sync V3 generation：本地持久化可重试的 prepared generation，写入前执行配额预检，再写入完整 Chunk 集合与 Manifest；远端没有 `previous generation` 指针，失败恢复依靠本机持久化的替换信息。
- 实现 80% 容量警告、峰值空间预检、quota/rate-limit 错误和本地 pending 保留。
- Background Sync Scheduler 在本地写入、内容脚本启动、页面 focus、网络恢复和 Browser Storage change 等事件后调度；Coordinator 在扩展 origin Dexie 中通过 per-account lease 避免重复处理 Outbox。Content script 不访问 Repository、Dexie 或 Outbox。
- 实现确定性冲突合并、tombstone 防复活和远端数据全量校验。
- 实现自动恢复点、手动点、保护快照、每账号 10 个、无时间过期、全扩展 20 MiB 容量预算、60 秒／5 分钟连续操作合并与最近 3 个重要点优先保留、影响摘要、导入和导出。
- 在 Setting Panel 注册 Folders tab，提供开关、隐藏选项、历史版本、导入/导出、Browser Sync 容量和写入异常。
- 如 Milestone 1 先公开发布，容量警告只提供导出备份和稍后处理；不展示无法完成的 Drive 连接入口。
- Browser Sync 只表述“已保存，浏览器将同步到其他设备”，不伪造云端成功时间。

**退出条件**

- 新 generation 任一 Chunk 写入或 manifest 切换失败时，旧 generation 仍可完整读取。
- 两设备离线新建、同 Folder 编辑、同位置插入、移出/加入竞争和删除与旧更新均有自动化集成测试。
- 导入、恢复和批量删除前可回退；恢复不回滚 Folders 开关、隐藏选项和展开状态。

### M1.6 发布硬化

**工作**

- 使用项目 `i18n-writer` subAgent 完成全部 locale，并校验 key 对齐。
- 组件测试覆盖键盘、焦点、对比度、tooltip、确认弹窗和长 Folder 列表。
- 使用脱敏 DOM fixture 做回归，并在当前 Gemini 页面执行 Chrome/Firefox 手动验收。
- 执行 `pnpm compile`、Folders 相关 `pnpm test:run`、`pnpm run check:i18n`、`pnpm build` 和 `pnpm build:firefox`。
- 审查构建后 manifest，确认 Milestone 1 没有引入 Drive/OAuth 权限。

**Milestone 1 发布门槛**

- PRD 中的基础功能、失效保护、Browser Sync 和备份恢复验收项全部通过。
- 无跨账号数据闪现、读取、写入、导入或导出。
- 无无清理的 observer、DOM host、timer、lease 或后台队列。
- 断网、配额不足、同步数据损坏和 selector 失配均是 fail-safe，不会以空数据覆盖有效数据。

## 6. Milestone 2：Google Drive 集成

### M2.0 OAuth 与平台可行性验证

**工作**

- 在 Chrome MV3 和 Firefox MV2 上各完成一次最小 Drive `appDataFolder` 授权、写入、查询和读取。
- 明确 OAuth client 分发、redirect URI、最小 scope、token 生命周期、撤销和重新授权。
- 确定如何取得可用于匹配的授权账号标识，并与 `accountScopeId` 契约对齐。
- 决定“断开 Drive”后回到 Browser Sync 还是仅本地保留，并定义云端数据的保留/删除与二次确认。
- 更新 `docs/platforms.md`、manifest 设计和商店权限说明草案。

**退出条件**

- 两个平台均有可重复的授权流程，或已形成明确的平台差异发布决策。
- 授权账号无法与 observed Gemini 身份匹配时，设计默认禁止任何 Drive 读写。

### M2.1 Drive provider

**工作**

- 实现 Drive 认证 adapter，token 不进入 Folder 业务表、Bootstrap、快照或导出文件。
- 在 `appDataFolder` 中按 `appId + accountScopeId + appProperties` 发现数据，不依赖本地 file ID。
- 上传 immutable generation，再更新小型 manifest 提示；不覆盖唯一数据文件。
- 使用 Drive file version 做快速变更判断，下载后仍以 Envelope `dataRevision` 为业务依据。
- 保存每设备 Changes API page token，处理 token 过期和全量重新发现。

**退出条件**

- 账号不匹配、授权撤销、网络中断、manifest 竞争、多 generation、hash 错误和 schema 不支持都有 provider 测试。
- 任何远端错误都不会清空本地投影或 Outbox。

### M2.2 权威切换与冲突合并

**工作**

- 实现 `preparing → copying → verifying → complete` 的 Browser Sync 到 Drive 迁移状态机。
- 迁移期间 Browser Sync 继续作为权威，本地新操作继续进入 Outbox；只有 Drive 读回验证成功后才切 Bootstrap。
- 切换时创建新 `authorityEpoch`，旧 Browser Sync generation 不再接收完整数据写入。
- 检测相同 parent revision 的多个子 generation，合并并生成新 revision。
- 其他设备发现 provider/epoch 变化后停止写旧权威，授权 Drive 后重建本地投影。

**退出条件**

- 迁移每个阶段都可注入失败；失败时 Bootstrap 不切换、Browser Sync 仍可用、本地变更不丢失。
- 同一账号的 Chrome/Firefox 在无共享 Browser Sync 的前提下，可通过 Drive 重新发现并得到一致投影。

### M2.3 设置、状态与恢复操作

**工作**

- 在 Folders 设置的“同步与存储”内加入连接、迁移进度、重试、重新授权和断开。
- 只在 Drive 上传被服务端确认后展示“已同步”和最后成功时间。
- 实现正在同步、等待网络、同步失败、授权失效和账号不匹配。
- SideNav 仅保留低打扰状态入口：默认中性、需处理时橙点、Drive 正常时勾选。
- 手动邮箱模式下不展示可用的 Drive 连接动作。

**退出条件**

- 每个状态都回答三个问题：数据是否已在本机保存、当前保存在哪里、用户接下来需要做什么。
- 断开 Drive 的数据去向和后续 provider 选择在交互中明确，不会无确认删除云端或本地数据。

### M2.4 发布硬化

**工作**

- 执行两设备、两浏览器、离线、token 过期、账号切换、并发修改、分叉和迁移中断的端到端验证。
- 使用项目 `i18n-writer` subAgent 完成 Drive 相关 locale，运行 i18n 校验。
- 执行 compile、Folders/Drive 相关测试、Chrome/Firefox 构建和构建后 manifest 审查。
- 准备隐私说明、授权用途、商店审核文案和最小手动回归清单。

**Milestone 2 发布门槛**

- 授权账号不匹配时没有 Drive 数据读取、写入、合并或预览。
- Drive 成为权威后 Browser Sync 仅保存 Bootstrap/定位信息，不存在完整数据双主。
- 断网或 Drive 故障期间本地写入可用，恢复后 Outbox 可继续并不复活 tombstone。
- Browser Sync 到 Drive 迁移成功与所有中断点回滚都通过自动化测试和真实账号验证。

## 7. PR 拆分与依赖

每个 PR 只承担一个可审核责任，避免将 DOM、数据、同步和全部 UI 放入同一差异。

| 顺序 | PR 主题 | 依赖 | 可并行项 |
| --- | --- | --- | --- |
| 1 | 文档决策 + DOM/Shadow DOM 验证 | 无 | Manifest V3/order-key 契约 |
| 2 | Domain schema + order key + tree projection | PR 1 | Identity service |
| 3 | Dexie migration + Repository + Outbox | PR 2 | Selector fixtures |
| 4 | Identity + selector infrastructure | PR 1 | PR 2–3 |
| 5 | SideNav host + Folder CRUD UI | PR 3–4 | Browser Sync codec/provider |
| 6 | Native menu bridge + picker + membership | PR 3–5 | Backup service |
| 7 | Drag/reorder/remove/delete + Recents fail-safe | PR 6 | Settings page |
| 8 | Browser Sync coordinator + merge | PR 3 | PR 5–7 |
| 9 | Backup/import/export/history + Settings integration | PR 3, 5, 8 | i18n 草稿 |
| 10 | M1 i18n、端到端验收与硬化 | PR 5–9 | 无 |
| 11 | Drive OAuth/platform spike | M1 契约稳定 | 可在 M1 后期开始，不合并不完整代码 |
| 12 | Drive auth adapter + provider | PR 11 | Drive 状态 UI |
| 13 | Provider migration + fork merge | PR 12 | 状态 UI |
| 14 | Drive Settings/SideNav 状态 | PR 12–13 | i18n 草稿 |
| 15 | M2 i18n、跨浏览器 E2E 与发布硬化 | PR 13–14 | 无 |

关键路径：

```text
契约固化
  → Domain/DB/Repository
  → Identity + DOM infrastructure
  → Folder UI + Chat integration
  → Browser Sync + Backup + Settings
  → Milestone 1 release
  → Drive OAuth/provider
  → authority migration + fork merge
  → Drive states
  → Milestone 2 release
```

### 交付节奏建议

在未确定团队人数与迭代长度前，本计划不给出日历工期。排期时建议按以下交付包估算：

1. **M1-A：基础契约** — PR 1–4，产出可供 UI 使用的稳定 Repository、identity 和 DOM 契约。
2. **M1-B：用户主路径** — PR 5–7，产出可完成 Folder 组织的端到端竖切。
3. **M1-C：数据保护** — PR 8–9，产出 Browser Sync、备份恢复和设置。
4. **M1-D：发布候选** — PR 10，只处理回归、i18n、真实页面验收和发布阻断问题。
5. **M2-A：Drive 可行性与 provider** — PR 11–12。
6. **M2-B：迁移与状态** — PR 13–14。
7. **M2-C：发布候选** — PR 15，只处理跨设备/跨浏览器回归、合规文档和发布阻断问题。

如有两条工程线，一条负责 Domain/Repository/Sync，一条负责 Identity/DOM/UI；两条线只通过已评审的 command、projection 和 event 契约集成。

## 8. 测试与证据矩阵

| 层级 | 覆盖重点 | 发布证据 |
| --- | --- | --- |
| Domain 单测 | schema、HLC、order key、merge、tombstone、tree invariant | Vitest 报告 |
| Repository 集成 | Dexie migration、account scope、事务 + Outbox、回滚、snapshot | happy-dom/fake IndexedDB 测试 |
| DOM fixture | identity、SideNav 插入、menu 归属、幂等、重绘、失效清理 | 脱敏 HTML fixture + Vitest |
| React 组件 | 创建/编辑、picker、确认、设置、状态、键盘可访问性 | 组件测试 |
| Provider 测试 | Chunk/generation、quota、hash、Drive 授权、分叉、重试 | mock browser/Drive API |
| 多设备集成 | 离线 Outbox、并发变更、删除不复活、provider 迁移 | 可重复的双设备场景测试 |
| 真实页面 | 当前 Gemini DOM、账号切换、导航、原生菜单、Recents | Chrome/Firefox 手动验收清单 |
| 构建产物 | manifest 权限、Chrome MV3、Firefox MV2、locale 对齐 | build + manifest 审查 |

## 9. 主要风险与控制

| 风险 | 控制方式 | 阻断发布的条件 |
| --- | --- | --- |
| Gemini DOM 变更 | 语义 selector、唯一性校验、fixture、重绘 reconcile、实页验证 | 无法唯一确认 Chat/menu 仍注入 UI |
| 账号识别错误 | observed/manual 分离、scope 强制、先卸载后加载 | 任何跨账号数据可见或可写 |
| Browser Sync 容量与部分写 | 持久化 prepared generation 和替换信息；本机业务库保持权威并可重试同一 generation | 本地数据无法保留或失败后无法恢复发布 |
| 多标签/后台中断 | 持久 Outbox、per-account lease + TTL、幂等重试 | 依赖无清理长驻内存状态 |
| 删除数据被旧设备复活 | tombstone、明确 operation、不从旧快照推导新增 | 删除/旧更新集成测试未通过 |
| Recents 隐藏导致原生导航不可用 | GPK 自有标记、可逆样式、异常立即恢复 | 功能失效后仍有被隐藏 Chat |
| Drive 账号或授权错配 | 只允许 observed identity、每次读写校验、最小 scope | 不匹配状态下产生任何 Drive 数据访问 |
| Provider 迁移双主 | `authorityEpoch`、读回验证后切 Bootstrap、旧 provider 停写 | Browser Sync 和 Drive 同时作为完整权威 |

## 10. 完成定义

一个任务只有同时满足以下条件才算完成：

- 代码边界与本计划一致，没有在 UI 或 DOM 控制器内引入散落持久化/同步逻辑。
- 正常路径、异常路径、清理路径和账号切换路径均有测试。
- 所有用户可见文字进入 i18n，且全部 locale key 对齐。
- 不保存 Gemini 正文、原始邮箱或超出功能需要的数据。
- 相关自动化测试、TypeScript 编译、Chrome/Firefox 构建和手动验收通过。
- PR 描述列出已验证的真实路径、剩余风险和不在本 PR 范围的事项。
