# Folder 数据访问性能审查与修复计划

审查日期：2026-10-18；更新：2026-10-20。状态：阶段 A/B/C/D（阶段 1–4）代码、自动化与构建验证已实施，真机待验证。详见 [阶段 1 验收记录与手工步骤](./data-performance-stage-1-validation.md)、[阶段 2 验收记录与手工步骤](./data-performance-stage-2-validation.md)、[阶段 3 验收记录与手工步骤](./data-performance-stage-3-validation.md)、[阶段 4 验收记录与手工步骤](./data-performance-stage-4-validation.md)。

审查对象：[data-performance-issue.md](./data-performance-issue.md)。依据是当前工作区（HEAD `201a0e3` 加已有暂存、未暂存修改），不是仅依据 HEAD。代码位置以下列函数为准，行号会随在途修改变化。原始审查仅新增本计划，不修改原反馈；阶段 A 的后续实施与证据单独记录于上述验收文档。

## 1. 结论与证据边界

反馈的六类主要数据访问问题均真实存在：内存分页、局部写入扫描、客户端全量刷新、恢复点正文读取、辅助查询过读、部分 Sync 分支重复捕获。它们足以证明访问量随数据增长，但没有浏览器基准数据，不能据此认定某个操作的实际延迟或唯一卡顿原因。

“5 个 Folder × 每个 1 万条 membership，显示首批 50 条却读取约 15 万条 membership”在指定条件下成立：一次成功投影的 `getSidebarState` 计数和首屏分别读取 5 万条，随后 `getSyncStatus` 再读 5 万条。它是应用层 materialize 记录数，不代表磁盘物理 I/O 次数；不含 revision 重试、额外刷新、引用读取、Recovery 或 Sync。

需要修正或补充原反馈：

1. `addMembership → upsertMembership` 的新增分支也读取目标 Folder 全部 membership，再计算顺序；应纳入高优先级修复。已有归属的幂等分支不执行这次扫描。
2. Sync 重复捕获是分支相关行为。缺失远端、已有 writing publication、已写入远端待确认等路径会提前返回；不能说每次 retry/正常同步必然先捕获全账号。
3. `deleteFolder`、没有现成保护点的 `removeChatAfterGeminiDelete` 有操作前完整保护快照。可消除的是业务删除事务里的无关扫描，不能承诺整个调用只读取待删除项。
4. `getSyncStatus.chatCount` 是有效 Folder 内去重 chat 数，不是 membership 条数。不能直接替换为 membership `count()`；references 也需先证明无孤立引用才能用于计数。
5. `resolveChatMemberships` 当前可能对同一个 chat 返回多次。改存在性查询时要明确返回唯一 chatId 的契约，而非将其描述为完全无行为变化。
6. `getRestoreImpact` 是功能占位问题，单独追踪，不属于扫描性能修复。
7. `removeChatAfterGeminiDelete` 两次 revision 写入确实存在，但发生在同一业务事务，不能等同于两次独立提交或两次已执行的后台任务。

## 2. 逐项核对

### 2.1 查询

证据：[query-service.ts](../../../src/entrypoints/background/folders/query-service.ts)、[db.ts](../../../src/data/db.ts)。

| 反馈 | 审查结果 | 代码依据 |
| --- | --- | --- |
| listFolderChats 全量读取再分页 | 确认 | `toArray → sort(compareMembershipOrder) → page`；现有索引无法表达置顶显示顺序 |
| listFolders 全量根目录、内存分页及数量过读 | 确认 | 排序索引后仍 `toArray`；每个返回 Folder 以 membership 数组长度计数 |
| getSidebarState 重复读取 membership | 确认 | 首批计数读取后又调用 `listFolderChats`；Folder 本身也是全量根目录读取 |
| getSyncStatus 全量组织与 conflict 正文 | 确认 | folders/memberships `toArray`，完整 conflict `get` 后只输出摘要 |
| getPickerOptions 继承 listFolders 问题 | 确认 | 直接复用 listFolders |
| resolveChatMemberships 只需存在性却取全量 | 确认，需明确去重契约 | 每个 chat 使用已有索引，但 `toArray` 后 flat/map |
| getFolderDeleteImpact 可用 count | 对当前“仅目标 Folder”语义成立 | 唯一 `[accountScopeId+folderId+chatId]` 索引保证不重复；若未来表示整个子树，不能直接累计各 Folder 的 chatCount |

后三个辅助查询目前在 src 中仅找到 RPC 定义和后台分发/实现，未找到产品侧调用。低于实际侧栏路径优先级。

### 2.2 局部写入

证据：[folderRepository.ts](../../../src/data/repositories/folderRepository.ts)。

| 操作 | 审查结果与限制 |
| --- | --- |
| createFolder / createFolderAndAddChat | 确认全账号 Folder 查重及筛选同级排序 |
| updateFolder | 确认传入 name 即扫描，即使名称最后不变；纯图标/颜色 patch 不扫描 |
| moveFolder | 确认全账号 Folder 构树、祖先/深度验证、同级排序；根级排序也如此 |
| addMembership / upsertMembership | 原反馈遗漏：新增时全 Folder 扫描，已有记录分支不扫描 |
| moveMembership | 确认目标 Folder 全量读取后筛选、找锚点、排序 |
| setMembershipPinned | 确认实际取消置顶也扫描；已经处于目标置顶状态时提前返回 |
| removeMembership | 确认删除后调用全账号 pruneChatReferences |
| deleteFolder | 确认全账号 folders、membership filter-delete、全账号引用清理；此外有必要的操作前保护快照 |
| removeChatAfterGeminiDelete | chat 索引范围正确；同时有关系和引用时两次 markOrganizationChanged |

`resolveFolderOrderKey` / `resolveMembershipOrderKey` 的空间耗尽重排是必要维护分支。应优化正常分支，保留重排及其原子性，不能只把所有数组调用改成 limit。

### 2.3 客户端与恢复点

证据：[client.ts](../../../src/entrypoints/content/folders/client.ts)、[runtime.ts](../../../src/entrypoints/content/folders/runtime.ts)、[snapshots.ts](../../../src/services/folder-recovery/snapshots.ts)、[storage.ts](../../../src/services/folder-recovery/storage.ts)。

| 反馈 | 审查结果 |
| --- | --- |
| 所有 Folder 分页与折叠项聊天预读 | 确认 captureProjection 会读完 Folder 并给每个 Folder 预读；是当前产品行为，不自动视为要删除的功能 |
| 刷新重拉已加载聊天页 | 确认以 previousCounts 为目标重读；revision 不一致还会完整重试一次 |
| 展开/收起完整 refresh | 确认 toggleCollapsed → updateSettings → refresh；后台已将纯折叠变更标为 local-view，不会因此主动调度 Sync/Recovery |
| 引用数组 some 去重 | 确认，最坏平方级；可用一次投影内的 Set |
| listSnapshots 返回正文 | 确认读取全账号快照，withSnapshotCounts 保留完整 row；缺少计数的旧记录还会校验、解码正文 |
| getLocalStorageStatus 全账号正文统计 | 确认全表 toArray，并对完整 row JSON/UTF-8 编码 |
| 保存恢复点重复读取 | 确认正常路径两次账号快照读取，再由 trimSnapshots 读取全局；quota 重试另有读取 |
| releaseSnapshot 正文读写 | 确认 get 完整 row，再 put 完整 row；单纯换 update 不构成正文隔离 |

### 2.4 Sync 与其余接口

证据：[coordinator.ts](../../../src/services/folder-sync/coordinator.ts)、repository 的 `getOrCreateBrowserSyncPublication`、`applyBrowserSyncSnapshot`、`listBrowserSyncWakeScopes`，以及 [command-service.ts](../../../src/entrypoints/background/folders/command-service.ts)、[rpc-handler.ts](../../../src/entrypoints/background/folders/rpc-handler.ts)。

- 完整远端分支捕获本地后，dirty/base 相同的发布路径可再次由 publication preparation 读取全账号；repository 判断复用 publication 也晚于 rawAccountData，确认存在无效读取。
- 应用远端时 coordinator 捕获后，repository 再捕获；冲突选择远端同样进入该路径。选择本地准备 publication 也会再次取数据。优化须保留并发校验。
- 启动发现账号只需 publication 主键，却使用 `toArray()`，确认。
- 容量测量自身是有界全区读取；随后 `getSyncStatus` 的组织扫描仍应修复。
- getSettings、updateChatTitle、dismissCapacityNotice、updateSettings 的 repository 主路径没有上述组织全表扫描。它们的客户端刷新成本另计。
- 手动快照、保护快照、导出要求完整账号读取；导入、恢复要求保护和完整替换。此类全量操作不应为了数量指标而删除。
- `getRestoreImpact` 分发直接返回 `{ available: true }`，确为占位。

## 3. 修复边界

- 保留账号隔离、物理删除、每账号 10 个恢复点和跨账号 20 MiB 逻辑预算。
- 保留保护快照、revision 守卫、同事务数据/计数/任务意图提交。压缩、hash 等异步计算在写事务外完成，提交前验证捕获版本。
- 不改 Sync 传输格式、不迁移压缩算法、不重做 Recovery 调度。不要用无界后台缓存掩盖查询问题。
- 已确认 Folder 尚未发布：集中定义最终 schema，保留已发布功能的数据库版本历史；正式升级只新增 Folder 表，不兼容开发期间的 Folder 数据结构。开发库验证前需单独备份并处理旧 Folder 测试数据，不自动清空数据库或其他功能数据。此前阶段记录中的 v13/v14/v15 迁移验证属于历史实现，已由“已有非 Folder 数据保留、新建最终 Folder 表”用例替代。

## 4. 分阶段实施

### 阶段 A：数据库分页、计数、局部写入（优先）

涉及：db、domain types/schemas、repository、query-service 及测试。

1. 增加本地派生字段和索引：Folder `nameKey` 复用现有名称规范化逻辑；Folder 排序索引包含 `[accountScopeId+parentFolderId+orderKey+id]`。membership 增加 `displayOrderKey`（置顶 `0+pinnedOrderKey`，普通 `1+orderKey`）及 `[accountScopeId+folderId+displayOrderKey+id]`，同时保留普通顺序索引供取消置顶位置和邻居查询使用。显示键不进入同步/备份协议。
2. 所有写入入口（新增、移动、置顶、重排、导入、恢复、远端替换）统一生成派生字段。nameKey 先用非唯一索引配合写事务查重，保持已有输入验证契约；不得在未检查历史或导入重名数据前直接加唯一约束。
3. Folder 与聊天页用完整复合游标作严格下界，数据库读取 limit+1；避免 offset 和 JS filter 跳过历史页。索引排序、游标比较和 tie-break 全部统一为确定性字节序；当前 Folder localeCompare 与 page 的字符串比较并不一致，需要回归覆盖。
4. getSidebarState 复用分页 helper；页内 Folder 用索引 count()，聊天只取首批。getPickerOptions 同享优化。按页读取 references，可 bulkGet。
5. getSyncStatus 的 Folder 数先用索引 count。去重 chat 数建立账号级持久摘要，与组织修改同事务维护：首个 membership 加入时 +1，最后一个移除时 -1，跨 Folder move 不变；删除子树仅对受影响 chat 检查剩余归属。全量替换时从已验证输入重算。初始化/修复允许一次全量重建，不能让每次状态查询偷偷重建。摘要必须与有效 Folder 语义一致。
6. conflict 摘要与正文分开存储或在 sync state 保存摘要，在记录、解决、清除冲突时同事务维护；状态查询不 get conflict 正文。存在性判断使用 key/existence 查询。
7. 名称未变先返回；更名通过 nameKey 索引查重。新增/移动通过主键验证锚点和所属账号/父级，再用排序索引取邻居。普通 orderKey 与显示置顶顺序分开处理，保留取消置顶恢复普通位置的语义。只有 keyBetween 报空间耗尽才加载相应重排范围。
8. 取消置顶只改目标；置顶读取置顶组边界。removeMembership 仅按刚删除的 chatId 检查剩余关系并删除孤立引用。
9. deleteFolder 按父子索引遍历真实后代，按 folder 索引删除关系，按受影响 chatId 清理引用。moveFolder 同父级排序跳过结构扫描；换父级时按主键读取祖先、按父子索引遍历真实子树，保留循环和深度限制。不要借优化删除当前支持的树安全检查。
10. removeChatAfterGeminiDelete 同一有效变更只更新一次 revision。辅助查询存在性与目标 Folder count 改动可一并落地；getRestoreImpact 另列功能任务。

验收：普通页仅 materialize limit+1 条；5×1 万场景 getSidebarState 的 membership 正文读取上限为 55 条（每个首屏 10+1），计数走原生索引 count；getSyncStatus 不 materialize 组织或 conflict 正文。此处不声称 count 的底层索引工作恒定时间。

### 阶段 B：客户端按变化刷新

涉及：client、runtime、commit/invalidation 契约、rpc-handler、相关 runtime/client 测试。

1. 引用去重改为每次投影构建内 Set，生命周期随构建结束释放。
2. 折叠设置以成功 RPC 返回值更新当前投影；失败保留原状态。当前标签页和其他标签页的 local-view invalidation 都只读/更新 settings，不重拉组织。启用、隐藏已整理聊天等同步设置与折叠分开处理。
3. 为 commit/invalidation 提供明确影响范围：Folder 元信息、受影响 Folder 的聊天页、共享 chat 标题、组织整体替换。普通更名/图标/颜色不重拉聊天；新增/移动/置顶/删除只重新获取受影响 Folder 已加载范围及数量。
4. 处理命令返回与广播到达的竞态并合并重复刷新；并发切账号用 sequence/scope 丢弃旧响应。设置改变不一定改变组织 revision，不能只靠 revision 去重所有消息。
5. 局部 patch 只有在已知投影基线和完整变化范围时才能推进 revision。未知来源、跨版本消息缺口、整库替换回退完整刷新，禁止把旧的其他 Folder 数据直接标为新 revision。明确游标失效后从受影响 Folder 首页重建。
6. 本阶段保留所有 Folder 摘要、折叠首屏预读和已加载页数；按需取消预读属于另一个产品决策。

验收：折叠/展开不调用 getSidebarState/listFolders/listFolderChats；同一 chat 多 Folder 标题一致；无关 Folder 不重拉；远端全量替换仍收敛；并发 mutation、分页、广播和切账号不混合 revision。

### 阶段 C：恢复点元数据与正文分离

涉及：db、snapshot domain/RPC 类型、recovery storage/snapshots、repository、runtime 和 RecoverySection 类型消费。

1. 元数据表存 id、scope、时间、reason/reasons、hash、revision、计数、保护 leases、payloadBytes 等；独立正文表按 snapshotId 保存 compressedPayload。正文仅恢复、校验、明确导出时读取，生成新快照时写入。
2. 明确 SnapshotSummary RPC 类型白名单，列表仅返回 UI 所需字段；手动创建和 prepareChatDeletion 的响应也不回传正文，保护操作只返回必要 id/token。当前这些命令直接返回完整 snapshot row，应一并收口。
3. 列表按实际 `updatedAt ?? createdAt` 和 id 排序，不误用 createdAt 代替当前顺序。每账号最多 10 条元数据时，内存排序可接受；无需为十条摘要引入复杂分页机制。
4. 保存时计算正文 UTF-8 字节数，预算使用固定正文 bytes 加小型元数据序列化 bytes；字段定义避免总数字段自包含的循环计数。JSON 表示的引号/转义和表拆分开销需采用一致的逻辑预算口径，不将其称为浏览器实际磁盘占用。元数据改变只重算元数据部分。
5. 分组、去重、保留优先级、quota 重试只读取元数据。正文与元数据创建/替换/删除同事务；清理同时物理删除正文，保护 lease 生效期间不得清理。Folder 尚未发布，直接定义最终表结构，不保留开发版 schema 迁移、旧快照回填或启动补校验。新快照保存时写入计数和 bytes；明确恢复时校验正文，损坏数据显式标记，不在每次列表请求重复解码。
6. releaseSnapshot 只访问元数据；getLocalStorageStatus 允许全局元数据求和，但不能读全部正文。维持现有保护数量限制和失败回滚规则。

验收：列表、状态、释放保护点的正文表读取数和 RPC 正文字节数均为 0；接近 20 MiB、多个账号、分组复用、多 lease、quota 重试及 worker 重启后，预算和物理删除仍正确。

### 阶段 D：Sync 捕获复用

涉及：coordinator、repository、启动发现及 Sync 测试。

1. publication preparation 先读小型状态和已有 publication；可复用时不调用 rawAccountData，继续验证已有 payload 的 hash/schema，writing publication 必须完成原快照。
2. 将一次运行内的 `{data, dataRevision}` 捕获传给准备 publication、应用远端、保护快照等后续步骤。settings、baseSnapshotId 和冲突状态也须在匹配的事务视图内捕获/验证；不能仅复用数组而漏掉状态变化。
3. 提交前仍在短事务校验 revision、base、conflict 和 pending publication 身份。版本改变则放弃/有界重试，不能绕过必要重读；捕获不跨运行缓存。
4. listBrowserSyncWakeScopes 改读 publication 主键，保留 states 筛选条件。
5. 保留干净副本内容比较和局部数据丢失修复；不能因 baseSnapshotId 相同就跳过所有数据校验。保留缺失/损坏远端的保护行为和冲突双份快照。

验收：稳定版本的普通发布/远端应用链路至多一次本地完整捕获；复用 publication 的 repository 路径零组织捕获。分别测试 absent、incomplete、invalid、writing、冲突本地/远端选择及捕获后发生编辑，不对所有分支强行使用同一读取次数断言。

## 5. 可验证性与关键链路 debug 日志

目标：每项修复都必须能通过自动化断言和真机证据判断是否生效。日志与测试是各阶段实现的一部分，不在功能完成后另行补齐。不能仅凭代码改写、返回数量或主观体感宣布完成。

复用现有 `folderTrace` / `devLogger` 的日志机制及 debug 开关，不新增默认开启的高频 console 输出。实现以下关键链路的结构化 debug 日志：

| 链路 | 必须可观测的事件与结果 |
| --- | --- |
| 用户操作 → RPC → 业务事务 → 客户端更新 | 操作开始、RPC 完成/失败、事务提交/回滚、投影更新完成；区分提交耗时和用户可见更新耗时 |
| 分页与计数 | 查询名、目标范围、limit、是否有游标、实际 materialize 记录数、返回数、是否有下一页、count 请求次数；能够识别索引分页与全量读取 |
| 局部写入 | 操作类型、读取/写入/删除数、是否发生重排、重排范围；保护快照读取与业务删除读取分别计量 |
| 客户端刷新 | 触发来源（命令返回/广播/聚焦/启动）、完整或局部刷新、受影响 Folder 数、请求页数、去重/合并结果、回退完整刷新的原因 |
| Recovery | 捕获、保存、分组/复用、清理、释放保护的开始与结果；元数据/正文读取数、正文读写字节、清理数量、预算前后值、quota 重试次数 |
| Sync | syncRunId、捕获次数、publication 新建/复用、复用捕获结果、revision 校验失败/重试、应用远端结果；必要完整读取与重复读取分开记录 |

公共字段至少包括事件名、traceId/requestId（跨 RPC 传递关联）、所在上下文、阶段、结果和本地阶段 `durationMs`。涉及一致性时记录捕获/提交 revision；Sync 关联 syncRunId，异步 Recovery 关联触发 revision。不要把一次用户操作之后独立调度的任务误记为同一同步调用耗时。耗时在各上下文用单调时钟测量，不能直接相减不同上下文的 `performance.now()`。

日志计数必须来自实际数据库访问结果或观测层，不能用返回页长度代替读取量。区分完整记录、索引键、原生 count 请求、正文 bytes 和 RPC 序列化 bytes；不把这些指标称为物理磁盘 I/O。测试环境通过数据库观测层核验日志计数，防止漏计 helper 内部扫描。

日志不得输出聊天标题、正文、压缩 payload、完整快照或备份。账号/实体关联采用最小必要的诊断标识，不打印完整对象。按阶段汇总，不逐条记录 membership；统计状态仅在请求/运行生命周期内保留并在 finally 清理，禁止无界全局缓存。关闭 debug 时不额外扫描、读取正文或序列化大对象以计算日志指标；RPC 字节精确测量仅在诊断开关启用的验证环境进行。

每阶段交付日志事件清单及一组成功、失败/回退样例，使真机操作可沿同一 trace 找到“触发 → 数据访问 → 提交 → 界面更新”，并识别后台独立任务。

## 6. 自动化测试与真机测试

每阶段作为独立可审查变更；A 完成后推进 B，C/D 可独立实施，但不得覆盖当前工作区其他在途修改。

| 验证层 | 数据与检查 |
| --- | --- |
| 查询行为 | 空数据、重复 orderKey、置顶/普通交界、游标边界删除、不同账号、最后一页；逐页拼接与完整期望顺序一致 |
| 访问量 | 1/5/50 个 Folder，单 Folder 10/1,000/10,000 条；固定目标页，增加无关数据。通过 Dexie DBCore/IndexedDB 请求观测区分返回记录、键、count、写入数；不能只 spy toArray 调用次数 |
| 写入正确性 | 跨 Folder 共享 chat、最后归属删除、排序键耗尽、重名、跨账号锚点、导入/恢复/Sync 全量替换；摘要与从数据重算结果一致 |
| 并发一致性 | 捕获后编辑、分页期间编辑、广播早于命令响应、切账号、整库替换、事务回滚；失败不推进计数或 revision |
| Recovery | 近预算、多账号、同内容复用、保护 lease、quota 重试、正文损坏；列表不读/传正文，清理不留孤儿 payload |
| 真浏览器 | 固定数据、浏览器版本和硬件，分别记录冷启动/热刷新、load more、增删/置顶/折叠的多次 p50/p95，区分命令提交、投影刷新、Recovery、Sync；记录耗时与 RPC 字节数，不将 fake IndexedDB 时长当生产结果 |

### 6.1 自动化测试：作为合并门槛

使用 Vitest 和测试数据库覆盖 repository、query/RPC、client/runtime、Recovery、Sync，并增加访问量观测。每项修复同时断言业务结果和实际访问范围；不得仅断言返回条数或 mock 方法调用次数。

| 修复项 | 必须通过的自动化断言 |
| --- | --- |
| 数据库分页 | limit=10 时最多 materialize 11 条 membership；5 个 Folder 首屏最多 55 条；逐页拼接无重复、无遗漏、顺序一致 |
| 状态查询 | getSyncStatus 不读取组织完整记录或 conflict 正文，去重 chatCount 与从有效组织重算的值相等 |
| 局部写入 | 普通新增/拖拽/置顶只读目标、锚点和邻居；取消置顶不扫描 Folder；移除归属只检查相关 chat；空间耗尽单独验证允许的重排范围 |
| 数据规模增长 | 固定目标页/操作，将无关数据扩大 10 倍，普通局部路径的完整记录读取量不随之增长；count 请求单列，不假设其底层恒定耗时 |
| 客户端刷新 | 折叠不请求组织分页；元信息修改不重拉聊天；局部操作不刷新无关 Folder；未知变化回退完整刷新 |
| Recovery | 列表/状态/释放保护的正文读取数与 RPC 正文字节数为 0；近预算清理不留孤儿正文，不删除有效保护点 |
| Sync 捕获复用 | 稳定版本普通发布/应用至多一次本地完整捕获；复用 publication 的 preparation 零组织捕获；并发编辑触发守卫而非覆盖新数据 |
| 日志可信度 | 日志计数与数据库观测值一致；提交/回滚、重试/回退可区分；关闭 debug 不新增数据读取；日志不包含标题、payload 或完整对象 |

必须覆盖广播先于响应、分页期间编辑、切账号、捕获后编辑、事务失败、worker 重启恢复等情况。断言失败后不能推进摘要、revision 或虚假的成功状态。每阶段运行相关测试及 `pnpm compile`；最终执行 `pnpm test:run`、Chromium/Firefox 构建。fake IndexedDB 的耗时只用于测试诊断，不作为真机性能结论。

### 6.2 真机测试：验证真实扩展链路

使用实际浏览器加载待验收构建，在 Gemini 页面按项目 live 验证流程执行；仅在隔离的测试账号/浏览器配置中准备合成数据。Chromium 与 Firefox 分别记录结果，不能用构建成功代替运行验收。涉及 Sync 云端交付的结论需第二设备读取确认，单设备 storage 写入成功只证明本地接受。

1. 固定数据生成 seed，记录构建版本、浏览器版本、硬件、账号数量和数据规模。数据覆盖 10/1,000/10,000 条聊天、5/50 个 Folder、跨 Folder 共享 chat、置顶、已加载多页，以及多账号恢复点接近 20 MiB 预算。
2. 在相同环境和数据下采集修复前后基线。分别执行冷启动、热刷新、加载更多、新增/移除/移动/置顶、折叠/展开、恢复点列表/释放保护、Sync 发布/应用。每个性能场景至少记录 20 次有效运行；冷启动须明确重启页面还是 service worker，不能与热运行混合统计。
3. 保存页面与后台 debug 日志，通过 trace/request/run ID 对齐；记录读取记录数、正文读取量、RPC bytes、命令提交与界面更新耗时。汇总 p50/p95；不静默剔除慢样本，失败和重试单列原因。日志开关在前后对比中保持一致，并关闭 debug 做一轮交互回归，检查观测开销。
4. 增加无关数据再次执行同一局部操作，核对访问量预算；检查分页顺序、数量、共享标题、折叠状态和刷新范围。观察到耗时下降但仍有全量扫描，仍判定未完成。
5. 实测双标签页并发、分页途中编辑、切账号、worker 停止后恢复；验证请求失败后界面反馈与已提交数据一致。记录可重复步骤、预期、实际结果和对应日志片段。

先建立可重复基线再定耗时目标，本计划不虚构毫秒 SLA。若自动化和真机结果不一致，以差异为未解决问题继续调查，不能只选择通过的一侧作为完成证据。

### 6.3 完成判据与交付记录

每个修复项提供“问题 → 代码变更 → 自动化测试 → 真机操作 → 日志证据 → 结论”的对应记录，证据注明构建版本与数据集。建议验收记录使用以下列：

| 修复项/阶段 | 自动化用例与结果 | 真机环境与步骤 | 访问量前后对比 | p50/p95 与 RPC bytes | 日志位置/trace | 结论及未解决项 |
| --- | --- | --- | --- | --- | --- | --- |
| 待实施后填写 | — | — | — | — | — | 未验证 |

只有访问量断言通过、功能与并发/恢复保障测试通过、构建通过、真机链路验证通过且无未解释回退/扫描时，才标记对应修复完成。未执行真机或缺少关键日志证据时，状态必须写“待验证”，不能写“已完成”。

原始审查完成的是代码静态核对与计划编写；阶段 A/B/C/D 后续已执行自动化测试与构建，浏览器验收仍待验证。修复完成的判据是数据访问范围收敛且语义、并发与恢复保障保持成立，而不是单纯“返回记录少了”。
