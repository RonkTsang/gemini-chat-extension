# Folder 数据性能阶段 2 验收记录

日期：2026-10-18。状态：**代码与自动化验证通过，Chrome/Firefox 真机待验证**。按计划实施阶段 B，不推进 C/D；阶段 A 的真机结果仍单独待回传。本轮无数据库升级，仍为 v15，不修改备份与 Browser Sync 传输格式。未提交 Git，保留已有在途修改。

## 实现与一致性边界

| 问题 | 本轮实现 | 自动化证据 |
| --- | --- | --- |
| 投影引用去重逐条扫描数组 | 每次完整投影构建用局部 Set 去重，随构建释放 | 共享 chat 只生成一个引用，跨 Folder 的 membership 保留 |
| 折叠/展开重读组织 | 当前标签页使用成功返回的 settings；其他标签页只请求 getSettings。失败保留旧状态，乱序本地写响应改读最新 settings | 折叠投影更新零额外 DB 读取；另一标签页仅读 settings/sync state；相同组织 revision 的不同 settings 事件仍处理 |
| 元信息更新重读聊天 | updateFolder 标记 folderMetadataIds，按主键读取对应摘要；结构变化标记 folders，重新分页读取全部根 Folder 摘要，保留存活 Folder 的聊天页 | 普通更名仅读取目标 Folder 一条、membership 原生 count 一次，membership 正文与 references 读取为 0 |
| 局部归属变化全量刷新 | 归属新增/移动/置顶/移除标记 folderIds，只重建受影响 Folder 的已加载聊天范围、数量与游标；所有范围从首页重建 | 目标已加载 20 条时重读两页，membership 正文=22；无关 Folder 的条目和游标保留 |
| 共享标题一致性 | 标记 chatIds；当前标签页直接应用返回的 reference，其他标签页按账号+chatId 主键读取。新增归属携带标题变更范围 | 同 chat 的多个 membership 共享更新后的引用；当前标题投影更新不新增 reference/聊天页读取 |
| 原生聊天删除范围不完整 | 从业务事务已经读取的 memberships 提取受影响 Folder IDs，随 commit 返回；超过 1000 个时明确回退 all | 无新增业务 DB 读取；沿用原子计数与保护点回归 |
| 响应/广播和分页竞态 | commit 携带事务内捕获的 baseRevision；响应和广播携带相同 requestId、版本和完整 affected。进行中的刷新合并重复 ID，其他并发组织变化合并为一次后续完整刷新 | 广播早于响应/重复广播只构建一次；并发不同编辑最终收敛，分页旧响应被丢弃 |
| 缺口或未知变化错误推进版本 | 只有基线匹配且所有局部读取都匹配目标版本才发布新投影。未知范围、版本缺口、查询期间编辑和整体替换回退完整刷新 | 真实 IDB 在两次局部页读取之间发生另一 Folder 编辑时，局部投影拒绝提交；runtime 回退完整读取 |
| 漏通知/切账号 | 状态发现更高或不同组织版本时触发完整刷新。账号与视图 sequence 丢弃旧响应，离开再回到同一账号也不应用旧设置响应 | 状态版本缺口收敛；A→B→A、分页与切账号回归 |

新契约是业务变更范围，不是诊断状态，不写入数据库或同步文件。baseRevision 复用事务原有的 prior state 读取。新增 getFolderSummaries/getChatReferences 两个局部查询，按实际业务所需表组织事务，并与 revision 在同一只读事务返回；无诊断驱动的额外读取或作用域扩张。

局部刷新保留全部根 Folder 摘要、折叠首屏预读和已加载范围。新增的 Folder 仍预读第一页，未取消现有产品行为。游标失效后从受影响 Folder 首页重建，不沿用旧游标跳页。被删除 Folder 的已加载行和游标移除，其他 Folder 的聊天页保留。

local-view 是特例：折叠不改变组织 revision，因此只更新 settings，不把设置 RPC 返回的较新组织版本标到旧组织投影上。同步设置（enabled/hideOrganizedChats）按实际 baseRevision 校验；远端整体应用显式标记 all。

并发范围无法可靠合并时选择完整刷新。runtime 只持有当前任务、一个后续刷新标记/最新 settings 事件，以及单个最近业务 requestId；没有历史 ID 列表、后台诊断队列或持久缓存。停止或切账号会失效进行中的结果。

## 自动化与生产证据

`projection.integration.test.ts` 将真实 client、command-service、repository、query-service 与 fake IndexedDB 接通，独立观测原生 IDB 请求。以下计数只覆盖**命令完成后的投影更新**，不包含业务写事务、必要保护快照或独立 Sync 状态查询：

- 3 个 Folder 各 35 条共享聊天，目标已加载 20 条：置顶刷新 membership=22、目标 Folder=1、membership count=1；只有目标 Folder 的两次 listFolderChats，开发/生产分支均验证。
- 元信息更名：目标 Folder=1、membership count=1、membership 正文=0、references=0。
- 当前标签页折叠：额外 DB 读取=0；另一标签页仅 getSettings，组织正文读取=0。
- 当前标签页标题更新：额外 DB 读取=0；共享引用只有一条，已有 memberships/cursors 保持不变。
- 删除 Folder 后：不重读存活 Folder 的聊天页；业务删除前的完整保护捕获不计入此投影预算。
- 新局部查询覆盖账号隔离和重复 ID；两页之间发生编辑时拒绝混合版本。

runtime 用例另外覆盖：保存失败、广播先于响应、重复通知、不同并发编辑合并、未知范围、缺失版本、整体替换、局部查询 stale、旧分页丢弃、相同版本不同 settings 消息、乱序设置响应、A→B→A 和状态发现漏通知。

fake IndexedDB 耗时不代表 Chrome/Firefox 延迟；标记扫描只证明指定字符串缺席，不证明全部辅助结构均消失。生产路径行为与源码复杂度分别评价：生产保留业务版本/范围校验、请求合并和错误反馈；详细链路与访问量统计仅存在于 DEV 条件下。新增 source 等私有参数服务于刷新来源的开发观测，未以此宣称全部辅助接口消失；未扩散 Repository 诊断接口。

最终验证（HEAD `b76a191` 加已有工作区修改，不能只用 HEAD 标识构建）：

- `pnpm compile`：通过。
- `pnpm test:run`：**121 个测试文件、972 个用例通过**，其中 8 个阶段 B 原生 IDB 集成用例、36 个 runtime 用例；阶段 A 的 19 个访问量/一致性用例继续通过。
- `pnpm build`：Chromium MV3 通过；`pnpm build:firefox`：Firefox MV2 通过。
- `node scripts/check-folder-production-diagnostics.mjs .output/chrome-mv3 .output/firefox-mv2`：通过，分别扫描 11 / 9 个 JS 文件。
- `git diff --check`：通过。日志汇总用例确认 full/partial 和来源不会混在同组耗时中，并保留回退原因。

原始日志：`/tmp/gpk-stage-2-compile.log`、`/tmp/gpk-stage-2-full-tests.log`、`/tmp/gpk-stage-2-chrome-build.log`、`/tmp/gpk-stage-2-firefox-build.log`。

生产后台文件 SHA-256（仅标识该文件，不代表整个扩展包）：

```text
chrome-mv3/background.js  20c7129a4553881819898f60f34071b2ffb1a21addc61d765233d737ce9d5fec
firefox-mv2/background.js 4ce12c1aa258e1c96e0380a2b3254f000e4625b894897bed13ec3417a0cf4d5f
```

## 真机准备

1. 使用隔离浏览器配置和测试 Gemini 账号。Chrome 与 Firefox 分别执行。沿用阶段 1 的 5 Folder × 10000 chat 数据；也可先用 5×1000。合成聊天仅用于 Folder 操作，不触发 Gemini 原生删除或改名。
2. 从测试账号导出的备份取真实 accountScopeId，用现有脚本生成文件。脚本不会覆盖已有文件；替换 YOUR_TEST_SCOPE，文件若已存在则换一个输出名：

   ```bash
   node scripts/create-folder-performance-fixture.mjs --scope YOUR_TEST_SCOPE --folders 5 --chats 1000 --seed phase-b-v1 --output /tmp/gpk-phase-b-1000.json
   node scripts/create-folder-performance-fixture.mjs --scope YOUR_TEST_SCOPE --folders 5 --chats 10000 --seed phase-b-v1 --output /tmp/gpk-phase-b-10000.json
   ```

3. 在 Folders 设置的 Backup file/备份文件入口导入，确认 5 Folder、1000 或 10000 个去重 chat。导入及其必要保护/同步处理完成后再开始采样。大数据可能超出 Browser Sync 配额，单独记录，不操作重建副本。
4. 开发构建：Chrome 运行 `VITE_FOLDER_DIAGNOSTIC_RPC_BYTES=true pnpm dev`，Firefox 运行 `VITE_FOLDER_DIAGNOSTIC_RPC_BYTES=true pnpm dev:firefox`，分别运行，以实际加载该构建的浏览器为准。
5. 页面 DevTools Console 和扩展后台 Console 都启用 Preserve log、Verbose/Debug，过滤 `[Folders]`。Chrome 后台从扩展管理页检查 Service Worker；Firefox 从 `about:debugging#/runtime/this-firefox` 检查扩展。IndexedDB 属于扩展后台，不是 Gemini 页面。
6. 记录浏览器/OS/扩展 ID、HEAD 与工作区状态、数据 seed/规模。每种场景单独清空并保存两端日志，避免把不同操作、不同页数混合求 p50/p95。

## 真机操作与预期

先每项一次确认功能，再对折叠、元信息和置顶分别采 20 次。以下“无某 RPC”只限定稳定基线下的本次操作；出现明确版本缺口或远端替换时允许完整回退，应同时回传原因日志。

| 场景 | 详细操作 | 预期 |
| --- | --- | --- |
| 冷启动与预读保留 | 刷新页面，等待 5 个 Folder 稳定，展开任意折叠项 | 初次仍使用 getSidebarState；所有 Folder 保留首屏预读，展开不先显示空列表。阶段 1 的 55 条 membership 预算仍适用于单次 Sidebar 查询 |
| 同页折叠/展开 | 第一个 Folder 先加载两次更多，再折叠/展开 20 对 | 仅 updateSettings；无 getSidebarState/listFolders/listFolderChats。展开后已加载范围与下一页仍正确。后台 Recovery/Sync 独立日志单列 |
| 双页折叠 | 打开同账号 A/B 两标签页，A 折叠/展开，观察 B | B 只 getSettings，不请求组织页。重复相同版本但不同折叠操作仍更新。记录广播/merged/deduplicated 事件 |
| 更名/图标/颜色 | A 修改第一个 Folder 名称、图标、颜色；观察 B，再恢复原值 | 两页均只更新对应元信息；可有 getFolderSummaries/count，无聊天页读取；已加载聊天与游标保留 |
| 置顶/取消置顶/排序 | A 第一个 Folder 已加载 30 条，在其内置顶、取消置顶、同组拖动；B 观察 | 仅受影响 Folder 从首页重建到原已加载范围；30 条通常对应 3 页，每页≤11 条正文。第二至第五 Folder 无 listFolderChats。无数据竞争时不应回退 full |
| 移除共享归属 | A 从第一个 Folder 移除一个共享聊天 | 仅该 Folder 数量/页面更新；其他 Folder 仍有该 chat，账号去重数不变。被移除页按当前排序补足已加载范围 |
| 共享标题 | 对真实测试会话先加入两个测试 Folder，再在一个 Folder 使用 Rename；不要操作合成聊天 | 成功保存后两处标题一致，命令页无需重拉聊天/引用；另一标签页只按 chatId 读引用。Gemini 原生改名的成功/未知/失败另记，勿将本地保存当作远端成功 |
| 删除 Folder | 删除第一个合成测试 Folder，检查其他四个；最后重新导入恢复测试数据 | 业务前保护捕获可以全量；投影阶段只更新摘要/settings，存活 Folder 不重拉聊天页。导入为 all，允许完整刷新 |
| 广播/分页竞争 | A 点击加载更多的同时，在 B 连续置顶或移除；再对两个不同 Folder 操作 | 允许 query-revision-changed/revision-gap 回退及一次后续完整刷新；不允许把旧页拼到新版本或遗漏最终编辑。保留原始日志，不只截图体感 |
| 切账号与重启 | 操作/分页期间切到另一测试账号，再返回；停止并重启 Chrome 后台 worker 后操作（Firefox 重载扩展后重载页面） | 旧响应丢弃；A→B→A 也不应用旧设置。重启后从持久组织重新建立基线，无诊断持久状态 |
| 生产回归 | 分别加载 pnpm build / pnpm build:firefox 输出，对同一数据重复折叠、元信息、置顶和双标签页操作 | 功能一致，没有详细诊断事件。生产 Console 仅用于必要错误，访问量须看开发构建及自动化证据 |

页面日志关注 projection.started/updated 的 source、mode，projection.partial 的 requestedChatPages，projection.merged/deduplicated/fallback/discarded；RPC 日志核对方法与业务 requestId。事务访问量使用后台 data.access，按账号/操作/revision 对照，不假定事务 trace 与 RPC trace 一一对应。projection.updated 不代表完成绘制；要比较可见延迟，请同时录制 Performance。

分别保存 `/tmp/gpk-stage-2-page.log`、`/tmp/gpk-stage-2-worker.log`（双标签页再保存 B 的日志），可运行：

```bash
node scripts/summarize-folder-performance-logs.mjs /tmp/gpk-stage-2-page.log /tmp/gpk-stage-2-worker.log
```

聚合脚本给出的 RPC/投影 p50/p95 不等于绘制耗时；请同时回传原始日志，便于按 mode/source/目标页数复核。无修复前同数据基线时不计算提升百分比。

回传模板：浏览器/版本/OS、构建标识、seed/规模、目标已加载条数、操作与次数、功能结果、RPC 方法/次数、目标/无关 Folder 页请求、fallback 原因、p50/p95/RPC bytes、页面/后台原日志路径。未取得这些真机结果前，本阶段保持“待验证”。
