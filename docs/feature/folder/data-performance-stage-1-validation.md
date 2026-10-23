# Folder 数据访问修复：阶段 1（A）验收记录

日期：2026-10-18。对应 [修复计划阶段 A](./data-performance-fix-plan.md)。

状态：**代码与自动化验证通过，真机待验证**。本次不推进阶段 B/C/D；客户端修改只增加关联日志，不改变刷新策略。未提交 Git，保留工作区原有暂存和未暂存修改。阶段 A 初版基线为 `feat/chat-folder` / HEAD `201a0e3` 加工作区在途修改；本轮设计治理基线为 HEAD `b76a191` 加工作区在途修改，不能只用 HEAD 标识构建。

后续阶段 B 已单独实施，见 [阶段 2 验收记录](./data-performance-stage-2-validation.md)。本文中“折叠仍完整刷新”等描述是阶段 A 当时的行为与验收边界，不代表当前阶段 B 构建；原有记录保留，不以阶段 B 自动化结果替代阶段 A 真机验收。

## 实现与边界

| 问题 | 实现 | 自动化证据 |
| --- | --- | --- |
| 首屏与聊天分页全量读取 | 完整的四段复合游标，严格下界，索引读取 `limit+1`；排序与 ID tie-break 统一为 IndexedDB/JS 字符串顺序 | native IndexedDB 请求观测；重复 key、大小写 ID、置顶边界、删除游标边界、末页、空页、账号隔离 |
| 列表计数过读 | 页内 membership 原生 `count()`；references 按页 `bulkGet`；Sidebar 复用相同分页 helper | 1/5/50 Folder、10/1000/10000 chats 的代表数据集；5×10000 首屏 55 条 membership |
| 状态扫描组织与冲突正文 | `folders.count()` + 持久账号摘要；冲突摘要放在 sync state | 组织/冲突正文读取均为 0；共享 chat 去重；冲突记录/解决与摘要同事务 |
| 新建、更名、普通排序扫描 | 非唯一 nameKey 索引查重；目标、锚点及最多两条邻居；仅耗尽或相同 key 无可插入间隔时重排 | 未改名只读取目标；跨账号/非邻接锚点拒绝；同账号数据扩大十倍读取量不增长；置顶重排保持普通顺序 |
| 归属删除、树操作扫描 | 仅清理相关 chat 引用；真实子树按父子索引遍历；换父级仅读祖先与实际子树；同父级排序跳过结构遍历 | 共享 chat、最后归属、物理删除、循环/深度限制、外账号父级 |
| 去重 chatCount | 仅保留 `folder_organization_summaries`；按相关 chat 的有效归属存在性维护首归属 +1、末归属 -1，移动不变；完整替换从已验证输入重算。v15 移除初版 usage 表 | 导入、恢复、远端替换、worker/数据库重开、写失败回滚；摘要与独立重算一致 |
| v13 既有库 | v14 回填本地排序/名称字段和冲突摘要；v15 移除 usage 表与冗余排序索引并重算账号摘要；保留历史重名，不加唯一约束 | 有数据的 v13 升级；保留其他产品表；孤立 membership 不进入有效 chatCount |
| Gemini 删除两次 revision | 一次业务变更只写一次 revision | 直接断言 sync state put 次数与最终组织/计数 |
| 日志可信度 | DBCore cache/hook 下层计数，与独立原生 IDB success 事件观测对照 | records/keys/count/writes 一致；debug 关闭不增加 IDB 读取；正文/标题不进入日志；字节测量显式开启 |

`nameKey`、`displayOrderKey` 只用于本地；便携 schema 与转换显式排除它们。恢复点压缩、保护点、10 条/20 MiB 逻辑预算、Sync 传输格式和 revision 守卫保持现有边界。计数摘要和数据、revision、Recovery pending 在同一写事务内提交；失败一起回滚。不再持久化逐聊天归属计数行。派生字段仅在 Repository 的实际持久化写入边界生成，schema/便携格式转换不生成本地字段；移除数据库派生 hook。

保护性删除/导入/恢复仍会完整捕获账号。日志将其标为 `phase=full-capture`，与业务事务分开。阶段 C 的恢复点正文分离和阶段 D 的 Sync 捕获复用尚未实施。

## 阶段 A 初版自动化执行记录

- `pnpm compile`：通过。
- `pnpm test:run`：120 个测试文件、946 个用例全部通过（包含 14 个数据库访问量/一致性用例）。
- `pnpm build`：Chromium MV3 通过。
- `pnpm build:firefox`：Firefox MV2 通过。
- `git diff --check`：通过。

主要新增用例：`src/data/repositories/folder-performance.test.ts`；独立观测器：`src/test/folder-idb-observer.ts`。另有客户端诊断开关用例和 `scripts/folder-performance-tools.test.ts`。既有 repository、RPC、client/runtime、Recovery 和 Sync 测试一起回归。

实际验证的读取预算：

| 场景 | 组织完整记录读取 | 原生 count 请求 |
| --- | --- | --- |
| 5 Folder × 每个 10000 membership，`getSidebarState(folderLimit=5)` | folders=5，membership=55，references=50 | membership=5 |
| `listFolderChats(limit=10)` | membership ≤11，references ≤10 | 0 |
| 同数据 `getSyncStatus` | folders=0，membership=0，conflict=0 | folders=1 |
| 取消置顶业务事务 | membership =1（目标读取，无更新 hook 读取） | 无 Folder 全量计数 |
| 同账号固定操作，扩大目标聊天数与无关 Folder 数十倍 | 新增/置顶/取消置顶/移动/移除的 membership 完整记录读取量保持相同 | count 单独统计 |

这些是应用层返回记录数，不是物理磁盘 I/O，也不说明原生 count 底层工作恒定。fake IndexedDB 耗时不作为 Chrome/Firefox 性能结论。修复前“约 15 万条”的数字是计划中已限定条件的静态访问量推导，目前没有修复前后的真机耗时基线。

## 日志事件与口径

仅开发构建通过现有 devLogger 输出新增 debug 日志；Console 需启用 Verbose/Debug。

| 上下文 | 事件 | 用途 |
| --- | --- | --- |
| Gemini 内容脚本 | `rpc.started / rpc.completed / rpc.failed` | requestId、traceId、方法、RPC 往返耗时；可选响应 bytes |
| 后台 | `data.access`，`phase=query` | operation、返回量/next、投影 dataRevision、实际 records/keys/countRequests，按表分列；分页入参见 RPC 日志 |
| 后台 | `data.access`，`phase=transaction` | 账号、提交/回滚、capturedRevision/committedRevision、实际读写/删除请求数；不再重复输出 mutation.transaction 系列日志 |
| 后台 | `order.rebalanced` | 耗尽维护分支、表/索引/目标范围、重排行数、该阶段耗时 |
| 后台 | `data.access`，`phase=full-capture` | 必要账号捕获的正文记录数和 capturedRevision，不与业务删除混计 |
| Gemini 内容脚本 | `projection.started / updated / failed / discarded / retry` | 状态投影提交完成、版本重试、切账号丢弃；本地单调时钟耗时 |

表完全没有出现时该范围读取为 0。`writes` 是成功的 IDB put/add 请求数；`deleteRequests` 是删除主键请求数（主键不存在也可能成功），`deleteRanges` 是范围删除请求数；不能把后两者称为已删除记录数。`result=rollback` 时出现的成功请求未成为持久提交。嵌套/并行 helper 由外层事务统一计量，避免相互污染或重复输出。

RPC 两端用相同 requestId；开发构建中，投影内多个 RPC 用相同 traceId。运行时治理后，不再把请求上下文传入 Repository 或保存在 QueryService 中：每个访问量观测使用独立事务 traceId，写事务通过账号、操作和 committedRevision 对照 RPC 提交，投影查询通过 dataRevision 对照响应。失败事务只有 capturedRevision；同版本并发操作不能保证唯一对应到某个 RPC，不应仅凭时间相邻推断因果。异步 Recovery/Sync 有独立生命周期，不把它们加到 RPC 提交耗时里。不同上下文的 `performance.now()` 不能直接相减。

`projection.updated` 表示 runtime 已提交新状态，**不代表浏览器完成绘制**；最终可见耗时需要 Performance 录制核对。阶段 B 仍会进一步补齐刷新来源、影响范围和合并日志。

以下为自动化已覆盖路径的字段示例，trace/revision/耗时作了占位处理，不是真机样本：

```json
{"event":"data.access","traceId":"folder-data-read","context":"background","phase":"query","operation":"getSidebarState","result":"success","durationMs":1.0,"dataRevision":"R1","chatPageLimit":10,"returned":5,"hasNextPage":false,"tables":{"folder_memberships":{"records":55,"keys":0,"countRequests":5,"writes":0,"deleteRequests":0,"deleteRanges":0}}}
{"event":"data.access","traceId":"folder-data-write","accountScopeId":"account-scope-0001","context":"background","phase":"transaction","operation":"upsertMembership","result":"rollback","durationMs":1.0,"capturedRevision":"R1","tables":{"folder_memberships":{"records":1,"keys":0,"countRequests":0,"writes":1,"deleteRequests":0,"deleteRanges":0}}}
{"event":"projection.retry","traceId":"view-trace","context":"content","phase":"projection","result":"retry","reason":"STALE_REVISION","attempt":1}
```

## 手工验证：准备与日志

1. 使用隔离的浏览器配置、测试 Gemini 账号和浏览器同步身份。测试备份会替换该账号的 Folder 组织，按计划只导入合成数据。数据中的聊天不是真实 Gemini 会话；只操作 Folder、置顶、排序、移除归属，不点击合成聊天或调用 Gemini 删除/改名。
2. Chrome 使用项目 live 验证流程：打开 `https://gemini.google.com/app`，从侧栏插件入口（`data-test-id=gemini-power-kit-mavatar-container`）打开设置 → Folders。Firefox 单独重复验证。无需给 Gemini 发消息。
3. 先在终端启动开发构建（从本仓库根目录执行）：

   ```bash
   VITE_FOLDER_DIAGNOSTIC_RPC_BYTES=true pnpm dev
   ```

   Firefox 使用 `VITE_FOLDER_DIAGNOSTIC_RPC_BYTES=true pnpm dev:firefox`。分别运行，不混用输出目录。若 WXT 打开的配置未登录，先登录测试账号；以实际加载此开发构建的浏览器为准，不使用另一份旧扩展。
4. 页面打开 DevTools → Console，启用 Preserve log 和所有级别，过滤 `[Folders]`。Chrome 再从扩展管理页打开本扩展 service worker 的检查窗口；Firefox 从 `about:debugging#/runtime/this-firefox` 找到扩展并检查后台。后台同样保留日志并启用 debug。**IndexedDB 属于扩展后台，不是 gemini.google.com 页面。**
5. 记录浏览器完整版本、OS/硬件、扩展 ID、构建日期、代码版本（HEAD + 工作区状态）、数据 seed 与规模；同一轮前后保持日志开关一致。
6. 在 Folders 的“备份文件 / Backup file”处导出当前测试账号的备份，在文件中取顶层 `accountScopeId`。它必须与随后生成文件的 scope 相同，不要另编账号值。
7. 先生成小样本，确认导入链路，再生成主验收数据。文件必须尚不存在，工具不会覆盖已有文件：

   ```bash
   node scripts/create-folder-performance-fixture.mjs --scope YOUR_TEST_SCOPE --folders 5 --chats 10 --seed phase-a-v1 --output /tmp/gpk-phase-a-small.json
   node scripts/create-folder-performance-fixture.mjs --scope YOUR_TEST_SCOPE --folders 5 --chats 10000 --seed phase-a-v1 --output /tmp/gpk-phase-a-large.json
   ```

   把 `YOUR_TEST_SCOPE` 替换成导出值。通过“导入备份 / Import backup”选择小文件，检查预览为 5 Folder / 10 个去重 chat 后确认。主文件应为 5 Folder / 10000 个去重 chat，实际 membership=50000：同一组 chat 在全部 5 个 Folder 共享，每 7 个一个置顶。
8. 导入完成后再清空两端 Console，刷新 Gemini，开始采样。导入、保护点、后台 Recovery/Sync 的必要全量处理另记。大数据可能超出 Browser Sync 配额；记录该状态，不操作“重建副本”，也不把配额失败解释为索引分页失败。

## 手工验证：操作与预期

先做每项一次的功能与访问量检查，结果正常再采 20 次。每个场景单独保存日志，避免统计脚本把不同数据集或冷热运行混为一组。

| 场景 | 具体操作 | 预期与取证 |
| --- | --- | --- |
| 页面冷启动 | 导入主文件后刷新 Gemini，等 Folder 列表稳定；重复 20 次 | 每次 `getSidebarState` 的 membership records=55/countRequests=5，references=50；状态请求不读组织/冲突正文。此处定义“页面重载”，不能称为 worker 冷启动 |
| 热刷新 | 页面加载完成后切到另一标签页再切回 Gemini，等本轮请求完成；重复 20 次 | 每个分页仍符合 limit+1；记录 projection/RPC/事务各自耗时，不把多次 RPC 的 duration 简单当整页耗时 |
| 加载更多 | 展开第一个 Folder，连续点两次加载更多；看每页新增 10 条且无重复 | 每条 `listFolderChats` 的 membership records≤11，references≤10；保留游标与 trace 对应日志；重复轮次前刷新回首屏 |
| 置顶/取消置顶 | 对首屏普通聊天的菜单执行置顶，再取消；重复 20 对 | 固定目标/边界读取，不扫描 10000 条；取消置顶 membership 正文=1；取消后恢复普通位置。业务请求和随后当前客户端的刷新分开看 |
| 排序 | 同一 Folder 的相同 pin 组内拖动聊天；拖动根 Folder 排序 | 普通情况只读目标、锚点和邻居；不应出现 order.rebalanced；顺序在重载后保持 |
| 元信息与重名失败 | 更改 Folder 名称/图标/颜色；把一个 Folder 更名为另一个现有名称 | 正常更名查索引；重名显示错误，后台 rollback，数据/计数不变。可再保存原名检查幂等分支 |
| 局部移除与共享计数 | 从第一个 Folder 移除某个共享聊天的归属 | 该 Folder 数量减 1，其余 Folder 仍有该聊天；账号去重数量仍为 10000；业务事务只检查相关 chat，不能扫描账号全部 membership |
| 必要完整捕获与局部删除 | 删除一个测试 Folder，随后从导入文件恢复原数据 | full-capture 可以读完整账号；deleteFolder 的业务事务只读取真实子树及其 membership。原有共享 chat 留在其他 Folder；恢复后计数与分页重新正确 |
| 双标签页与分页期间编辑 | 打开两个相同账号 Gemini 标签页；A 加载更多时在 B 排序/置顶/移除；A 再加载下一页 | 允许 revision 守卫和一次投影重试；不允许重复/混合页、丢失已提交编辑或虚假成功。记录两个页面及后台日志 |
| 切账号 | 加载投影或下一页时切换到第二个测试 Gemini 账号，再切回 | 旧响应被 sequence/scope 丢弃，不能把旧账号条目或计数放入新账号；保留 discarded/retry/失败日志 |
| worker 恢复（Chrome） | 关闭后台检查窗口；从 Chrome 任务管理器按扩展 ID 找到其 Service Worker 任务并结束；回 Gemini 触发操作，再打开后台检查窗口 | 新 worker 能从 IndexedDB 直接读取持久计数；无每次查询重建；操作与计数保持正确。若任务管理器未列出目标任务，请回报，不能用普通页面刷新冒充此项 |
| 后台恢复（Firefox） | 在扩展调试页重载该测试扩展，然后重载 Gemini | 这是 MV2 背景页重启，单列结果；计数与数据保持一致，不称为 MV3 worker 测试 |

对 Folder 首屏数量以 UI 实际展开/预览规则为准，读取预算核对 RPC 日志；本阶段客户端仍会预读全部 Folder 的首批聊天、重拉已加载页。50 个 Folder 时另外 45 个 Folder 会产生额外分页请求，**55 只限定单次 getSidebarState 的前 5 个 Folder**。折叠/展开仍会触发刷新，属于阶段 B，不是本阶段回归失败。

如需核对后台持久计数，可在**扩展后台 Console**执行只读检查，替换 scope：

```js
(async () => {
  const scope = 'YOUR_TEST_SCOPE';
  const request = (r) => new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
  const database = await request(indexedDB.open('gemini_extension'));
  try {
    const tx = database.transaction(['folder_organization_summaries', 'folders', 'folder_memberships'], 'readonly');
    const summary = request(tx.objectStore('folder_organization_summaries').get(scope));
    const folders = request(tx.objectStore('folders').index('accountScopeId').count(scope));
    const memberships = request(tx.objectStore('folder_memberships').index('accountScopeId').count(scope));
    console.log({ version: database.version, summary: await summary, folders: await folders, memberships: await memberships });
  } finally { database.close(); }
})();
```

未操作的大数据应为 version=15、folderCount=5、membershipCount=50000、summary.chatCount=10000。只读诊断产生的 count 请求属于人工检查，不计入业务 RPC。

## 日志导出与回传

1. 分别保存页面和后台 Console 日志，命名如 `chrome-large-page-cold.log`、`chrome-large-worker-cold.log`；保留 `[Folders]` 的 JSON 行和相关失败上下文。失败、慢样本、重试都保留；不要只选成功样本。
2. 单个场景运行统计工具：

   ```bash
   node scripts/summarize-folder-performance-logs.mjs /path/to/page.log /path/to/worker.log > /tmp/gpk-phase-a-summary.json
   ```

   工具按上下文、事件、operation/method、结果及可用的 limit/游标字段分组，分别给出 p50/p95、响应 bytes、各表 records/count 的 min/max。当前访问量事件已不携带分页入参，采样时应按操作与数据规模分别导出日志，避免混合不同分页配置。不合并不同上下文时钟，不推算绘制时间。不同行格式可能没有被解析，需同时回传原日志以核查遗漏；`parsed=0` 不能作为通过证据。
3. 主数据跑通后，可用 `--folders 1/5/50` 与 `--chats 10/1000/10000` 扩大无关范围，使用新输出路径并重新导入。相同 seed 下数据可重复生成；每组独立归档。每个性能场景至少 20 个有效样本，失败/重试另列。
4. 最后加载 `pnpm build` / `pnpm build:firefox` 的生产输出，在相同隔离数据上做关闭 debug 的交互回归。生产构建没有新增诊断日志，不能用它来核对访问量。
5. 回传以下信息即可继续验收：

   ```text
   浏览器/完整版本：
   OS/硬件：
   构建日期/版本/扩展 ID：
   数据：seed / Folder 数 / 每 Folder membership 数 / 去重 chat 数：
   场景与有效次数（失败/重试另列）：
   实际 UI 结果与异常步骤：
   getSidebarState membership records/countRequests：
   getSyncStatus folders/membership/conflict records：
   最慢成功 trace/requestId；失败 trace/requestId：
   页面日志 + 后台日志 + summary.json：
   ```

若有修复前隔离构建，在另一份隔离配置用相同 seed、规模和日志开关采基线；不要把已升级 v14/v15 的配置降级回旧扩展。没有基线时本轮只报告修复后的访问量与耗时，不报告性能提升百分比。数据访问预算、并发/失败行为和两个浏览器实测均通过后，才能将阶段 1 改为已完成。

## 阶段 A 初版验证汇总

2026-10-18 最终工作区验证：`pnpm compile`、全量 120 文件 / 946 用例、Chromium MV3 构建、Firefox MV2 构建、`git diff --check` 均通过。两种构建仅提示跳过对应平台不适用的 entrypoint。

本轮原始自动化日志保存在本机：

- `/tmp/gpk-phase-a-final-full-tests.log`
- `/tmp/gpk-phase-a-final-compile.log`
- `/tmp/gpk-phase-a-final-chrome-build.log`
- `/tmp/gpk-phase-a-final-firefox-build.log`
- `/tmp/gpk-phase-a-automated-log-summary.json`（自动化日志样本，不能作为真机性能基准）

生产构建后台文件 SHA-256（仅标识该文件，不代表整个包）：

```text
chrome-mv3/background.js  9c7e56e41796908b3bbfca754741f37f92c313f99e100b0707223e3a2e99fc11
firefox-mv2/background.js 4f064f10c2c4b8b2336511981d73f05764f5e990693e810054861737cc791579
```

真机环境、p50/p95、RPC bytes 与原始日志：**待用户回传**。


---
# 第一轮人工审查结论

就本次阶段 1 的新增设计而言，**建议收敛以下六处。优先处理派生数据、事务范围和重复维护，再清理诊断代码的生产开销。** 以下是代码层面的判断，尚未测量它们各自的真机耗时。

| 优先级 | 当前设计 | 生产影响与维护成本 | 建议 |
|---|---|---|---|
| 高 | **`folder_chat_usage` 逐聊天计数表** | 每次归属增删额外读写；远端应用、导入、恢复时删除并重建全部计数行；所有写入入口都要维护一致性 | 移除该表，改为通过索引检查相关聊天是否还有有效归属，维护账号级总数 |
| 高 | **统一扩大事务范围** | 查询统一声明七张表；所有 mutation 自动加入 usage、summary 表。不相关操作也扩大了事务作用域，可能增加排队 | 按业务操作声明必要的表；外层保证数据与 revision 一致，内部 helper 复用事务；日志只附着其上 |
| 高 | **派生字段多层重复生成** | `nameKey`、`displayOrderKey` 同时在解析、转换、Repository 和数据库 hook 中生成；增加对象复制、计算与维护入口，hook 路径还可能附带目标读取 | 统一到一个明确的持久化边界，覆盖普通写入、重排和完整替换；删除其他层的重复生成 |
| 中 | **为诊断创建请求级 Repository / QueryService** | 每次命令或 RPC 增加实例、闭包与诊断字段；分配成本较小，但调用结构变复杂 | 生产复用业务实例，开发环境才创建请求诊断上下文 |
| 中 | **日志关闭后仍执行辅助逻辑** | trace 生成、计时、参数对象构造、结果摘要判断，以及部分成功日志字段仍存在于生产路径 | 在调用处显式用 `DEV` 隔离；保留必要错误日志，避免依赖空 logger 消除参数求值 |
| 中 | **旧排序索引与新排序索引重叠** | 旧的三段排序索引仍与新增四段索引同时维护，占用空间并增加写入维护量 | 当前源码中旧索引名只出现在 schema 定义中，可在核对兼容性后移除 |

对应的主要位置是 [计数维护](/Users/ronktsang/projects/gemini-chrome-plugin/src/data/folder-summary.ts:23)、[查询事务包装](/Users/ronktsang/projects/gemini-chrome-plugin/src/entrypoints/background/folders/query-service.ts:53)、[派生字段 hook](/Users/ronktsang/projects/gemini-chrome-plugin/src/data/db.ts:165) 和 [请求级实例](/Users/ronktsang/projects/gemini-chrome-plugin/src/data/repositories/folderRepository.ts:214)。

收敛时应保留这些必要机制：

- **索引分页、完整游标和确定性排序**，避免恢复全量读取。
- **账号级去重计数摘要**，暂时保留。删除 usage 表后，仍须正确处理共享聊天、孤立归属和最后一次移除；不能直接拿 membership 数或 reference 数代替。
- **小型冲突摘要**，避免状态查询读取冲突正文。
- **revision 守卫、账号隔离、保护快照和同事务提交**，这些承担业务正确性。
- **开发环境数据库观测与自动化访问量断言**，保留验证能力，同时减少对业务接口的侵入。

实施顺序建议为：**移除逐聊天计数表 → 收窄事务范围 → 统一派生字段维护 → 清理诊断实例与生产辅助计算 → 删除冗余索引。**

每一步都需继续通过原有访问量、同步替换、并发和回滚用例。若已有 v14 数据库，删表、删索引应通过新的升级步骤处理，保留用户数据。



## 第一轮设计治理实施与验证

日期：2026-10-18。代码基线：`b76a191` 加已有工作区修改。状态：**上述六项治理已实施，代码与自动化验证通过；阶段 A 真机验收仍待验证**。本轮未提交 Git，保留原有在途修改。以下为第一轮实现快照；诊断字段与请求级实例的后续运行时收口见文末。上方第一轮人工审查保留为历史记录。

| 治理项 | 最终实现 | 验证 |
| --- | --- | --- |
| 逐聊天计数表 | 删除运行时 usage 维护，仅持久化账号去重计数。新增前/删除后通过 `[accountScopeId+chatId+folderId]` 读取索引键并验证 Folder 的账号归属，遇到孤立或外账号 Folder 继续查找，找到首个有效归属即停止。只访问相关 chat，不 materialize 其他 membership | 共享归属、最后移除、孤立/外账号 Folder、并发首次加入和并发末次移除、回滚、导入/恢复/远端替换及重开数据库 |
| 事务作用域 | 单一 `QUERY_TABLES` 声明每种查询的必要表；revision 读取仅额外加入 sync state；内部 helper 复用同一事务。通用 mutation 不再自动加入派生表，只有可能改变去重数量的操作显式声明账号摘要表 | 原生 IDB transaction.objectStoreNames 和事务数断言；分页期间编辑的原有 revision 用例继续通过 |
| 派生字段 | 移除 schema/便携格式转换的派生处理与 DB 创建/更新 hook，保留实际 put/bulkPut/重排写入点的统一函数。同步数据和备份继续排除本地字段 | 所有写入口与恢复/Sync 回归；取消置顶 membership 正文读取由最多 2 条降到 1 条 |
| 诊断实例 | 开发环境仍可使用请求局部上下文；生产命令复用 Repository，RPC 复用 QueryService，forRequest 在生产直接返回原实例 | `DEV=false` 身份断言；实际生产包方法检查 |
| 生产诊断开销 | 计时、额外 trace ID 生成/传输、结果摘要检查、详细成功日志和 DBCore 观测均在开发条件内。移除 upsertMembership 重复的分步骤日志，由事务日志与访问量观测统一覆盖 | 关闭 debug 的读取对照、RPC 时钟/序列化开关测试；两个生产构建执行诊断标记扫描 |
| 表与索引迁移 | 新增 v15：物理删除 usage 表和两条旧三段排序索引，保留四段排序索引。增加 chat+folder 索引，供有效归属检查读取 Folder ID 而无需读取 membership 正文；账号摘要在升级时一次重算，业务数据、设置、revision/base 均保留 | v13→v15 与有数据的 v14→v15；原生 objectStoreNames/indexNames、其他产品数据、错误旧摘要修复和空账号计数断言 |

删除子树时，相同 surviving Folder 的存在性在**本次删除事务**内复用，以免一万个共享聊天重复读取同一 Folder；Map 随调用结束释放，大小由此次相关 Folder 数决定，无后台全局缓存。受测删除场景业务事务仍只 materialize 目标子树的 102 条 membership，并只读取目标 Folder 和一个存活 Folder；保护点完整捕获独立计量。

当前核心读取预算保持：5×10000 首屏 membership=55、references=50、membership countRequests=5；`getSyncStatus` 的 folders/membership/conflict 正文读取均为 0。计数摘要与组织写入、revision、Recovery pending 保持原子提交；生产未新增日志统计扫描或额外序列化。这里没有给出未经真机测量的延迟提升比例。

最终检查：

- `pnpm compile`：通过。
- `pnpm test:run`：**120 个文件、950 个用例通过**，包含 18 个数据库访问量/一致性/治理用例。
- `pnpm build`：Chromium MV3 通过；`pnpm build:firefox`：Firefox MV2 通过。
- `node scripts/check-folder-production-diagnostics.mjs .output/chrome-mv3 .output/firefox-mv2`：通过，分别扫描 11 / 9 个 JS 文件。仅证明脚本列出的诊断标记未进入生产包，不能证明所有辅助逻辑已消失；必要错误日志保留。生产运行开销须结合下方路径测试判断，源码复杂度单独审查。
- `git diff --check`：通过。

原始自动化日志：`/tmp/gpk-governance-compile.log`、`/tmp/gpk-governance-full-tests.log`、`/tmp/gpk-governance-chrome-build.log`、`/tmp/gpk-governance-firefox-build.log`。

本轮生产后台文件 SHA-256（仅标识该文件，不代表整个包）：

```text
chrome-mv3/background.js  9f9c959b54a7f78e458033c67a6b9854d48f34686c3b589e5f7a115cb62d6ce3
firefox-mv2/background.js 5bd207229e9841c0d583b7400cf082cdb160722a205aea86f10edee83748ae53
```

手工验证沿用上方步骤，数据库预期版本更新为 **15**。请用本轮开发构建重新采样；旧 v14 日志只对应初版。重点补充 v14 原配置升级后的数量/排序/设置保留、共享聊天末次移除、双标签页并发及后台重启。真实浏览器 p50/p95、RPC bytes 与原始日志仍待回传。

### 后续治理约束与证据边界

详细访问量与链路诊断仅用于开发构建和测试环境。生产保留必要错误反馈与业务请求标识；不为排查新增持久日志、后台队列、诊断状态、额外读取或改变事务边界。

- 上一轮遗留的 Repository `diagnostics` 字段和 `forRequest()` 已在本轮运行时治理中删除。诊断收口到 RPC／事务边界，不为清理引入代理或上下文框架，不再扩散诊断接口。
- QueryService 的 `read()` 保留业务事务组织，开发统计已移至独立函数，由事务边界以 DEV 条件调用。事务范围由业务一致性决定，开发观测必须保持可移除，不得继续加入诊断缓存、队列或重试职责。现有 revision 一致性检查与业务重试不属于新增诊断职责。
- 产物标记扫描只验证指定字符串是否存在；`DEV=false` 的源码路径测试验证选定行为，也不等同于真实浏览器执行生产包。分别记录运行开销、源码复杂度及真机证据，不以扫描通过宣称零开销或全部辅助逻辑已删除。

生产路径回归补强现有用例：在同一数据上对比开发／生产分支的投影结果、原生 IDB 访问计数与事务表范围；确认生产复用 Repository、不输出详细诊断，客户端不额外计时/序列化且不发送诊断 traceId，同时保留业务 requestId 和失败错误反馈。

上一轮边界补强只修改记录与测试，未修改运行时代码。当时两个相关测试文件共 25 个用例、`pnpm compile` 与 `git diff --check` 均通过。原始日志：`/tmp/gpk-governance-boundary-tests.log`、`/tmp/gpk-governance-boundary-compile.log`；该轮未重新构建。

### 运行时代码收口与最终验证

本轮直接修改运行时代码，完成以下收口：

1. 删除 Repository 接口和实现的 `forRequest()`、诊断构造字段及 membership 输入中的无用 traceId。移除仅转发诊断参数的私有 mutation 包装，直接调用现有事务函数；业务验证、设备初始化及 Recovery/Sync 原子提交保持原样。
2. QueryService 删除 requestId/traceId 构造字段；RPC 和命令在开发／生产环境都复用现有实例。查询事务仍由原有 `QUERY_TABLES` 决定，revision 与数据仍在同一个事务内读取。
3. 将结果统计集中到现有开发观测模块的 `observeFolderQuery()`，业务查询不再传递分页诊断对象。独立函数不管理事务、不增加读取，只检查已返回的结果；DEV 条件移除后，查询只保留业务一致性事务。
4. 写事务删除重复计时、trace 构造及 started/committed/rolled-back 日志，只保留单次访问量报告。成功报告等待实际事务提交，失败报告保留回滚语义；生产直接返回业务事务结果，开发观察的附加 Promise 回调不进入生产分支。

没有新增代理、上下文框架、持久日志、后台队列或诊断缓存，也没有为观测扩大事务范围或增加读取。事务日志与 RPC 不再保证共享 traceId，这一取舍及并发限制已在上方日志口径中说明。

验证证据分别记录：

- **生产路径测试**：`DEV=false` 与开发分支的投影结果、原生 IDB 读写计数、事务数量及表范围一致；保留业务 requestId 和必要错误反馈。并发查询各有独立统计，失败观测不会污染后续查询；已有数据/revision/Recovery pending 回滚用例通过。
- **源码复杂度**：Repository 的诊断字段、`forRequest()`、请求级 QueryService 创建和诊断转发包装均已物理删除；QueryService 不再检查返回结果形状。仍保留业务事务闭包和 DEV 观测调用点，不宣称全部辅助结构消失。
- **生产产物**：重新构建 Chromium MV3 和 Firefox MV2；标记扫描分别通过 11 / 9 个 JS 文件。额外检查两个后台产物均无 `forRequest` / `diagnostics` 字符串；核对生成的查询与 mutation 函数，查询不检查结果摘要，mutation 不包含诊断完成回调。以上是指定产物和路径的证据，不等同于真机延迟验证。
- **自动化结果**：`pnpm compile`、全量 **120 文件 / 952 用例**（其中数据库治理 19 用例）、两平台构建及 `git diff --check` 均通过。仅注释和本记录在最终构建后调整。

原始日志：`/tmp/gpk-runtime-governance-compile.log`、`/tmp/gpk-runtime-governance-full-tests.log`、`/tmp/gpk-runtime-governance-chrome-build.log`、`/tmp/gpk-runtime-governance-firefox-build.log`。

最新生产后台文件 SHA-256（覆盖前轮哈希，仅标识该文件）：

```text
chrome-mv3/background.js  fc4accf28db2d65f0774b9497382e42a74cdf66633fcc0e0abbebc5c31aa0914
firefox-mv2/background.js 3971613d346424475598d4e63c853b99fd7da989020bfd83c7bdd6eec0f95824
```

数据库仍为 v15，无新增数据迁移。手工验证继续按上方步骤执行，使用本轮构建和更新后的日志口径；阶段 A 真机结果仍待回传。本轮未提交 Git，保留既有在途修改。
