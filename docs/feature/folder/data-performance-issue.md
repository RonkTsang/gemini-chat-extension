确认存在一批同类问题。**排除 Sync 压缩耗时后，当前 Folder 的多处局部操作仍采用“读取整个集合，再在 JavaScript 中筛选、排序、分页”的实现。**此前我只核对日志时序，没有继续检查数据访问复杂度，审查不充分。

本次检查覆盖了 `folders` 的 **35 个 RPC**、对应 repository，以及客户端刷新和恢复点链路。以下结论来自当前代码的静态审查，未修改代码，也未进行浏览器耗时基准测试。

**1. 高频查询：分页接口没有真正限制数据库读取量**

| RPC | 当前实现及问题 | 应有的数据访问范围 |
|---|---|---|
| [listFolderChats](/Users/ronktsang/projects/gemini-chrome-plugin/src/entrypoints/background/folders/query-service.ts:104) | 读取目标 Folder **全部 membership**，内存排序、过滤游标、截取一页。每次加载更多都会重新执行 | 从排序索引的游标位置读取 `limit + 1` 条 |
| [listFolders](/Users/ronktsang/projects/gemini-chrome-plugin/src/entrypoints/background/folders/query-service.ts:88) | 已使用排序索引，但仍先读取全部根 Folder，再重新排序、内存分页；为取得每个返回 Folder 的聊天数量，又读取其全部 membership | 索引分页；数量使用索引 `count()` |
| [getSidebarState](/Users/ronktsang/projects/gemini-chrome-plugin/src/entrypoints/background/folders/query-service.ts:62) | 读取全部根 Folder；对首批 Folder，先读取全部 membership 来计数，再调用 `listFolderChats` **第二次读取全部 membership** | 有限数量的 Folder、计数，以及每个 Folder 的首批聊天 |
| [getSyncStatus](/Users/ronktsang/projects/gemini-chrome-plugin/src/entrypoints/background/folders/query-service.ts:134) | 每次状态查询都读取全账号 Folder、membership，构造集合来计数；存在冲突时，还会读取包含完整组织数据的 conflict 记录 | 状态、计数和冲突摘要 |

这里最严重的是：**接口返回少量数据，数据库却读取大量数据。**

举一个代码层面的读取量示例：5 个 Folder，每个 1 万条聊天，一次普通刷新只展示每个 Folder 首批 10 条：

- `getSidebarState` 为计数读取 5 万条 membership。
- 为生成聊天首屏，再读取 5 万条。
- 随后的 `getSyncStatus` 再读取 5 万条。

**返回 50 条聊天，累计读取约 15 万条 membership。**这还没有计算新增操作自身的读取，也没有计算任何 Sync 或 Recovery 工作。这个数字是按代码路径推导的读取量，不是实测耗时。

聊天分页另有一个索引缺口：当前显示顺序包含“置顶组、普通组及各自顺序”，数据库只有普通 `orderKey` 索引。需要补足能表达显示顺序的索引，才能正确执行数据库分页，不能直接在现有查询末尾加一个 `limit()` 就结束。

**2. 局部写入：多个操作读取了远超实际影响范围的数据**

| RPC | 已确认的问题 | 数据量关联 |
|---|---|---|
| [createFolder / createFolderAndAddChat](/Users/ronktsang/projects/gemini-chrome-plugin/src/data/repositories/folderRepository.ts:441) | 读取全账号 Folder，逐个规范化名称查重，然后筛选同级 Folder、排序计算位置 | 随全账号 Folder 数及同级 Folder 数增长 |
| [updateFolder](/Users/ronktsang/projects/gemini-chrome-plugin/src/data/repositories/folderRepository.ts:524) | 只要传入 `name`，就读取全账号 Folder 查重，之后才判断是否实际改变 | 改名随 Folder 总数增长；仅修改图标、颜色的 repository 路径没有这个扫描 |
| [moveFolder](/Users/ronktsang/projects/gemini-chrome-plugin/src/data/repositories/folderRepository.ts:557) | 读取全账号 Folder，再通过数组查找校验祖先、构建子树、筛选并排序目标同级集合 | 即使只是根级拖拽排序，也受全账号 Folder 数影响 |
| [moveMembership](/Users/ronktsang/projects/gemini-chrome-plugin/src/data/repositories/folderRepository.ts:774) | 读取目标 Folder 全部 membership，查找锚点、复制并排序 | 随目标 Folder 聊天数增长 |
| [setMembershipPinned](/Users/ronktsang/projects/gemini-chrome-plugin/src/data/repositories/folderRepository.ts:819) | 读取整个 Folder 的 membership，再筛选置顶项。**取消置顶也执行这次全量读取** | 取消置顶本可直接更新一条记录，现在仍随整个 Folder 聊天数增长 |
| [removeMembership](/Users/ronktsang/projects/gemini-chrome-plugin/src/data/repositories/folderRepository.ts:846) | 删除一条 membership 后，调用全账号 `pruneChatReferences` | 删除一条关系，代价却随全账号 membership 和引用数量增长 |
| [deleteFolder](/Users/ronktsang/projects/gemini-chrome-plugin/src/data/repositories/folderRepository.ts:617) | 读取全部 Folder、重复遍历寻找后代；扫描全账号 membership 筛选待删除项，随后又进行全账号引用清理 | 删除一个小 Folder 也会触及其他无关数据 |

其中，[pruneChatReferences](/Users/ronktsang/projects/gemini-chrome-plugin/src/data/repositories/folderRepository.ts:277) 是特别明确的问题：

```text
删除一条 membership
→ 读取全账号所有剩余 membership
→ 构建所有 chatId 的 Set
→ 遍历全账号 chat reference，寻找孤立引用
```

正常实现只需针对刚删除的 `chatId`，通过现有 `[accountScopeId+chatId]` 索引检查是否还有 membership；没有才删除这一条引用。全账号清理不应属于每次移除聊天的正常路径。

这些扫描大多发生在业务读写事务内，还会延长事务占用时间。

写入优化的具体方向也很明确：

- 名称查重使用“账号 + 规范化名称”的索引。
- 普通排序通过索引读取首项或相邻项。
- 删除通过父子关系、Folder、chat 索引限定范围。
- 取消置顶直接更新目标 membership。

排序键耗尽时，当前实现确实需要批量重排同级记录。这是应当保留并单独验证的维护分支；普通新增、拖拽、置顶不应每次都提前读取整个集合。

**3. 客户端刷新进一步放大了上述问题**

[客户端构建投影](/Users/ronktsang/projects/gemini-chrome-plugin/src/entrypoints/content/folders/client.ts:99) 会：

1. 跟随所有 Folder 分页，取得全部 Folder。
2. 为全部 Folder 准备聊天页，包括折叠的 Folder。
3. 刷新时，重新拉取此前已加载的聊天数量。例如已展开加载 100 条，会从第一页重新请求到约 100 条。
4. 每一页又触发后台目前的“读取整个 Folder，再内存分页”。

因此，一个 Folder 已加载的页数越多，后续刷新可能重复扫描它越多次。

尤其是，[展开或收起 Folder](/Users/ronktsang/projects/gemini-chrome-plugin/src/entrypoints/content/folders/runtime.ts:615) 的链路也是：

```text
修改 collapsedFolderIds
→ updateSettings RPC
→ 完整 refresh
→ 重新加载 Folder、聊天页、Sync 状态
```

这只是本地视图设置，却触发了组织数据重新读取。修改图标、颜色、置顶、移除聊天等操作，也普遍使用完整刷新。

此外，客户端合并聊天引用使用数组 `.some()` 去重，随着已加载记录增加，最坏会形成平方级比较。[对应代码](/Users/ronktsang/projects/gemini-chrome-plugin/src/entrypoints/content/folders/client.ts:133)可以直接改用本次构建过程内的 `Set`。

现有预读行为可以保留，先修正数据库分页；展开、收起则应直接更新视图，其他局部变化应刷新实际受影响的范围。

**4. 恢复点：只需要元数据，却读取或传输了正文**

这里列出的都是数据访问问题，没有计算压缩耗时。

| 接口或操作 | 当前问题 |
|---|---|
| [listSnapshots](/Users/ronktsang/projects/gemini-chrome-plugin/src/entrypoints/background/folders/query-service.ts:179) | 读取账号全部恢复点，包括 `compressedPayload`；内存排序、分页后，返回的仍是包含正文的完整记录，正文随 RPC 发送到页面 |
| [getLocalStorageStatus](/Users/ronktsang/projects/gemini-chrome-plugin/src/services/folder-recovery/storage.ts:113) | 读取**所有账号**的全部恢复点，再对每条完整记录执行 `JSON.stringify`、UTF-8 编码，重新计算字节数 |
| [保存恢复点](/Users/ronktsang/projects/gemini-chrome-plugin/src/services/folder-recovery/snapshots.ts:59) | 正常成功路径先后读取两次当前账号完整恢复点集合；随后清理预算时，又读取全局完整集合 |
| [releaseSnapshot](/Users/ronktsang/projects/gemini-chrome-plugin/src/data/repositories/folderRepository.ts:974) | 只是释放保护标记，却读取并重新写入包含正文的整个恢复点 |

每账号 10 条、全局 20 MiB 的限制保证了它们有容量上限，但接近预算时，状态查询仍可能读取并重新序列化大量数据。

这里应当明确分离恢复点元数据和正文：列表仅返回摘要；保存时记录字节数；计数、预算和保护标记操作访问元数据，恢复时才读取正文。只在读取后删除返回值中的 `compressedPayload`，只能减少 RPC 传输，不能消除数据库正文读取。

**5. 其余接口的检查结果**

| 接口 | 结论 |
|---|---|
| `getPickerOptions` | 复用 `listFolders`，继承其全量读取和计数问题 |
| `resolveChatMemberships` | 已使用 chat 索引，但读取每个 chat 的全部 membership，最终只返回 chatId；可以执行存在性查询 |
| `getFolderDeleteImpact` | 读取目标 Folder 全部 membership，再构建 Set 计数；当前 Folder/chat 唯一约束下可使用索引计数 |
| `getSettings`、`updateChatTitle`、`dismissCapacityNotice` | repository 主要执行主键访问，未发现随组织总量扫描的问题 |
| `updateSettings` | repository 不扫描组织表；折叠 ID 数组有 500 条上限。主要问题在前述客户端完整刷新 |
| `removeChatAfterGeminiDelete` | 删除范围由 chat 索引限定，处理这个 chat 的全部归属符合操作语义；但同时删除归属和引用时，会重复更新两次 revision |
| `createSnapshot`、`prepareChatDeletion`、`exportBackup` | 操作本身要求读取完整账号数据，属于必要的全量操作 |
| `importBackup`、`restoreSnapshot` | 操作本身要求保护当前数据并替换完整组织，批量读写符合语义 |
| `getRestoreImpact` | 当前只是返回 `{ available: true }` 的占位实现，没有实际查询；不能算已实现的影响检查 |

前三个查询的问题位于 [query-service](/Users/ronktsang/projects/gemini-chrome-plugin/src/entrypoints/background/folders/query-service.ts:118)。当前未找到产品侧调用，优先级低于已经频繁使用的侧栏接口。

**6. Sync 链路还存在额外数据库读取，独立于压缩成本**

- `retrySync`、正常同步会先[捕获完整本地账号数据](/Users/ronktsang/projects/gemini-chrome-plugin/src/services/folder-sync/coordinator.ts:132)。正常需要发布新快照时，[准备 publication 又读取一次完整账号数据](/Users/ronktsang/projects/gemini-chrome-plugin/src/data/repositories/folderRepository.ts:1278)。
- `getOrCreateBrowserSyncPublication` 即使最后复用已有 publication，也已经先读取了全部当前组织数据。
- 应用远端、解决冲突的链路也有重复捕获；可复用同一份带 revision 的捕获结果，保留事务内版本校验。
- [启动发现待同步账号](/Users/ronktsang/projects/gemini-chrome-plugin/src/data/repositories/folderRepository.ts:1089)只需要 publication 的账号主键，却读取全部 publication 正文，可改为读取主键。
- `recreateSyncReplica`、`resolveSyncConflict` 包含必要的完整快照操作；`activityHint` 本身只调度，后台执行仍受上述读取问题影响。
- `measureBrowserSyncUsage` 当前读取并统计整个 Sync 区域，然后调用存在全量计数问题的 `getSyncStatus`。容量测量属于有界扫描，后者应先修正。

另外检查了 `folder-accounts` 的三个 RPC：它们处理账号历史，不随 Folder/chat 数量增长，没有发现本次同类的数据访问放大。

修复顺序建议是：**先修数据库分页、计数和局部写入扫描，再消除客户端完整刷新，随后处理恢复点正文访问与 Sync 重复捕获。**

验收应约束“数据库实际读取了多少记录、更新了哪些记录”，不能只断言“返回 10 条”。局部操作的访问量应由页大小、相邻记录或实际受影响的数据决定；增加无关 Folder、chat 后，不应跟着增长。