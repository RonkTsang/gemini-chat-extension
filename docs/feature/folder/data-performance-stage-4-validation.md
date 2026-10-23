# Folder 数据性能：阶段 D 验收记录

日期：2026-10-20。状态：代码、自动化、Chromium/Firefox 构建与生产扫描通过；**真机与双设备交付待验证**。

## 实现范围

- `getOrCreateBrowserSyncPublication` 先读取 settings、Sync state、已有 publication 和 conflict 存在性。可复用的 prepared/writing publication 校验 hash/schema 后返回，不调用 `rawAccountData`。writing 必须完成原 id、原正文和原 settings，即使已有更新的本地编辑。
- `captureBrowserSyncData` 在一个只读事务中捕获组织、revision、settings、base、publication 身份、conflict 存在性与 Recovery pending revision，返回普通 `FolderBrowserSyncCapture` 值。它只沿本次调用传递，不保存在 Repository、Coordinator 实例或全局变量中。
- 普通发布、应用远端和保护快照复用该值。冲突的本地/远端选择也复用一次本地捕获，继续保留双方保护点。选择本地成功后，只按刚提交的确定变化更新捕获值中的 base/dirty/conflict/publication 字段，再准备发布；组织数组不重读。
- 提交前在短事务核对 revision、base、provider、dirty、同步 settings、conflict 摘要/存在性、pending publication 的 id/state/hash。应用冲突远端另核对完整 manifest。只比较会影响同步决策的字段，使用量、重试时间等不使捕获失效；折叠偏好可独立更新，应用远端时保留最新值。
- 版本变化时放弃提交；publication preparation 最多尝试 3 次，持续变化时返回 `STALE_REVISION`，Coordinator 按已有机制延后。没有跨运行缓存、额外后台任务或新的重试队列。
- `listBrowserSyncWakeScopes` 只读 publication 主键，保留 provider、dirty、base、pending、retry 等筛选条件。
- 干净副本仍比较组织内容和同步 settings，保留相同 base 下的局部数据丢失修复；缺失/不完整/损坏远端不变成“清空本地”。
- **没有修改数据库 schema，没有增加未发布 Folder 数据的迁移或旧格式回填。** 未修改 Sync 传输格式、压缩/hash 算法、Provider 或 Scheduler。

新增生产逻辑是捕获值和提交校验。小型状态重读是复用捕获所需的一致性守卫；部分守卫事务因此包含 settings/publication/conflict，并非为日志扩展。详细观测仍在 DEV 条件下复用现有事务计数器，没有新增生产诊断读取、持久日志、诊断状态或框架。

## 自动化结果与读取口径

基准：HEAD `5e1bab8be2118fc97b9a97a3a054facb695cd95f` 加已有暂存/未暂存变更。本阶段没有暂存、提交、推送或覆盖其他工作区修改。

| 检查 | 结果 |
| --- | --- |
| `pnpm compile` | 通过 |
| `pnpm test:run` | 123 个测试文件、1018 个用例通过 |
| `src/services/folder-sync/performance.test.ts` | 新增 29 项原生 IDB/Sync 集成用例通过 |
| `pnpm build` / `pnpm build:firefox` | Chromium MV3 / Firefox MV2 通过 |
| 生产诊断扫描 | 通过，分别检查 11 / 9 个 JS 文件 |
| `git diff --check` | 通过 |

独立原生 IDB 观测器核对完整捕获的事务次数；单次捕获必须同时覆盖 folders、memberships、references。以下数据只针对指定稳定分支：

| 分支 | 本地完整捕获次数 | 保障 |
| --- | --- | --- |
| Repository 复用 prepared / writing publication | 0 | 仍校验已有正文 hash/schema，完成后再次验证小型状态视图 |
| 首次真实编辑、远端 absent 且没有已知 base | 1 | 不发布默认空组织；已有 writing 则优先完成 |
| 基于当前 base 的普通发布 | 1 | Coordinator 捕获传给 publication preparation，不重复读取组织 |
| 应用新远端、同 base 的本地数据修复 | 1 | 比较、保护快照、写入共用捕获；提交仍做外部 ID 归属等必要点查 |
| 干净且内容一致 | 1 | 保留组织和 settings 比较，不以 base 相同跳过完整检查 |
| 已知 base 的 absent / incomplete / invalid | 0 | 保留本地，记录既有错误状态，不发布覆盖 |
| 恢复已持久化 writing publication | 0 | 先完成旧快照；新编辑保持 dirty，后续独立运行捕获一次发布 |
| 冲突选择本地 / 远端 | 各 1 | 双方恢复点保留，不做组织并集，不用新捕获替代用户选择的版本 |
| hash 期间出现一次新编辑 | 2 | 第一次提交被守卫拒绝，再捕获新版本 |
| hash 期间持续版本变化 | 最多 3 | 有界结束，不保存混合版本，不建立后台循环 |
| 启动发现 | publication 正文记录 0；测试中主键 2 | Google Drive 等其他 provider 不因 pending key 被错误唤醒 |

“完整捕获一次”不等于整个链路只读一次数据库；必要的短状态守卫、外部 ID 归属点查、保护点元数据操作和远端读取另外计量。不能把所有失败/竞争分支都要求为一次。

用例另覆盖：捕获后 revision/base/settings/publication/conflict 分别改变时应用失败且当前组织保留；折叠偏好独立改变时允许应用并保留新偏好；hash 期间 prepared 变为 writing 不被新 publication 覆盖；跨账号捕获拒绝；版本不变但 pending 改变时不误清健康警告；hash 在 IndexedDB 事务外执行。DEV/生产分支均确认稳定发布只有一次原生完整捕获，生产分支不输出详细诊断；开发报告与独立原生计数匹配。

产物扫描新增检查 publication 新建/复用、捕获失效的诊断事件标记。它只证明列出的标记缺席，不能证明所有辅助代码消失，也不能代替生产路径测试或源码复杂度审查。

日志：`/tmp/gpk-stage-d-compile.log`、`/tmp/gpk-stage-d-full-tests.log`、`/tmp/gpk-stage-d-performance-tests.log`、`/tmp/gpk-stage-d-chrome-build.log`、`/tmp/gpk-stage-d-firefox-build.log`、`/tmp/gpk-stage-d-production-scan.log`。

生产后台文件 SHA-256（不是整个扩展包的 hash）：

```text
chrome-mv3/background.js  293d6a5e41b686d76b9d38c65f3a28627184d50cb2e536f4c5d08b8c9d096652
firefox-mv2/background.js c4cd5161eb65542b59f47431af83aaf7ae29bd921520a7ab87659da03402a8bc
```

## 真机准备与日志

1. 沿用阶段 C 的最终 schema 和隔离测试账号。旧开发库不自动迁移；如仍使用旧结构，请按阶段 C 文档备份并准备测试库，不删除整个扩展数据库。A/B/C 的其他功能回归仍保留。
2. 两台设备安装本轮构建，使用相同浏览器同步账号、同一扩展 ID、同一个 Gemini 测试账号。Chromium 和 Firefox 各自在自己的浏览器同步环境中验证；不能用 Chrome 与 Firefox 之间的读取验证 `storage.sync` 交付。不要在真实生产同步账号删除或改写共享 keys。
3. Chrome：`VITE_FOLDER_DIAGNOSTIC_RPC_BYTES=true pnpm dev`；Firefox 单独执行 `VITE_FOLDER_DIAGNOSTIC_RPC_BYTES=true pnpm dev:firefox`。确认加载的实际构建与记录一致；两设备均打开 Gemini 的插件 Settings → Folders。无需发送 Gemini 消息。
4. 页面、扩展后台 Console 均开启 Preserve log、Verbose/Debug，过滤 `[Folders]`。Chrome 从扩展管理页检查 Service Worker；Firefox 从 `about:debugging#/runtime/this-firefox` 检查扩展。不要在采样时展开 IndexedDB 的 publication/conflict 正文表。
5. 使用阶段 C 的合成 fixture（先 5×1000，再 5×10000）。导入和 Recovery 自动任务完成后再采样；合成聊天不是真实 Gemini 会话，不执行原生删除或改名。大 fixture 可能超出 Browser Sync 容量，此时记录明确 quota 结果，不能把它判为“捕获复用失效”。可发布链路先用 5×10 或少量手工 Folder。
6. 每项先一次功能检查，再在同一数据规模下重复 20 次有效运行；错误、重试、worker 重启单列。记录浏览器/版本/OS/扩展 ID、构建标识、账号数量、seed 和数据规模。

关键证据：

- `browser-sync.coordinator.started`、`browser-sync.read.*`、`browser-sync.publish.*`、`browser-sync.snapshot.*`、`browser-sync.conflict.*` 带 syncRunId，区分各次运行。
- `data.access / operation=captureBrowserSyncData / phase=full-capture` 表示一次实际完整捕获，包含 capturedRevision 和各表读取数。普通异步 Recovery 仍可能输出 `operation=getAccountDataWithRevision`，不得将它当作 Sync 的重复捕获。
- `browser-sync.publication.prepared` 给出 publication id/revision 和 reusedCapture；首次发布由 Repository 自行捕获时为 false，复用 Coordinator 捕获时为 true。
- `browser-sync.publication.reused` 表示 Repository 直接复用已经校验的 pending；Coordinator 已持有 writing 时直接交给 Provider，不一定经过这个事件，需结合 writing/publication id 和原生访问证据判断。
- `browser-sync.capture.stale` 记录写入前校验失败后的尝试；由于当前视图变化而在更早阶段重试，不保证出现此事件。保留完整日志，不只筛选“成功”事件。

Repository 访问报告不额外携带运行上下文。用账号、capturedRevision、publication id 和 Coordinator 的 syncRunId 日志对照；并发或 worker 重启导致关系不唯一时标记不确定，不仅凭相邻时间推断因果。fake IndexedDB 的耗时不代表浏览器延迟。

## 真机步骤

| 场景 | 操作 | 预期 |
| --- | --- | --- |
| 首次发布 | 在没有历史 Folder 副本的隔离同步环境，A 新建测试 Folder，再添加少量合成聊天；等待发布。B 打开同账号 Folders | 首次真实编辑自动发布，A 对应链路一次捕获。B 实际读回相同 Folder/归属/同步开关；仅 A 的 accepted-by-browser-storage 不算双设备交付成功 |
| 普通发布与应用 | 先让 A/B 收敛；A 修改 Folder 名称或置顶，等 A 发布后让 B 刷新/重试同步。交替操作 20 次 | 稳定的 A 发布、B 应用各一次捕获；publication.prepared 在复用 Coordinator 捕获时为 true。B 内容和顺序与 A 一致，保护快照可恢复 |
| 干净副本 | 两设备完全收敛后，在 A 触发 Retry/刷新。操作前确认无编辑或 pending | 仍有一次组织比较，随后 snapshot.unchanged，不发生无意义全量应用或发布；不是“零捕获”场景 |
| settings 与折叠 | A 更改 enabled/hide-organized 设置并同步；另在 A/B 分别折叠不同 Folder | 同步开关与相应 publication revision 一致；折叠保持本地偏好，不作为同步冲突。应用远端不把旧捕获的 collapsedFolderIds 写回 |
| 冲突选择本地 | 两设备先收敛；使 A 暂时离线，A 编辑；B 在线编辑并完成发布。A 恢复连接，等待冲突后选择保留本地 | 先出现冲突，选择阶段一次本地捕获；历史保留双方组织，发布本地选择。B 最终实际读回 A 选择的组织，不做并集 |
| 冲突选择远端 | 重新建立共同基线后重复离线编辑，这次 A 选择远端 | 选择阶段一次本地捕获；本地与远端均有保护点，最终 A/B 与被选远端一致 |
| 编辑与 Sync 竞争 | A 快速连续更名/置顶，在发布过程中继续编辑；也可对大 fixture 重复操作以提高命中率 | 若命中版本变化，允许有界重捕获或 deferred；不得发布混合 settings/revision。若原 publication 已是 writing，先完成旧 id，dirty 保留，后续发布最终编辑。记录未命中竞争的样本，不伪称验证通过 |
| worker 中断与启动发现 | A 编辑后在后台写入过程中关闭 DevTools 并停止 worker；再打开页面或触发已有 retry。Firefox 重载扩展后刷新页面 | 命中 writing 时先恢复同一个 id/正文，后续新编辑另发；pending 不因启动发现遗漏。主键零正文预算由自动化原生 IDB 用例证明，单凭 UI 恢复不证明零读取 |
| 生产回归 | 加载本轮 Chrome/Firefox 生产输出，重复更名发布、远端应用与冲突选择 | 功能一致，没有新增详细诊断事件。记录必要错误；构建与扫描不代替真实浏览器运行 |

相同 base 下的局部数据丢失修复、缺失/不完整/损坏远端、writing 精确字节恢复等已有自动化故障注入。本轮不要求在真实数据上删除本地表或共享 keys 来重现；如需进一步真机故障注入，应在可丢弃的独立同步环境单独记录。当前这些真机故障项仍标记待验证。

分别保存 `/tmp/gpk-stage-d-page-A.log`、`/tmp/gpk-stage-d-worker-A.log`，B 同理。可运行：

```bash
node scripts/summarize-folder-performance-logs.mjs /tmp/gpk-stage-d-page-A.log /tmp/gpk-stage-d-worker-A.log
```

汇总脚本涵盖 RPC、投影和 data.access；publication 分支、重试及双设备到达顺序请保留原始日志复核。没有修复前同环境基线，不计算性能提升百分比。

回传模板：浏览器/OS/扩展 ID、构建、数据规模、场景/次数、syncRunId/publication id、完整捕获次数、失败/重试原因、双方实际读回的内容/版本、p50/p95/RPC bytes、页面/后台原始日志路径。原始日志不包含完整 payload 或聊天标题。取得这些证据前，阶段 D 保持“代码与自动化通过，真机待验证”。
