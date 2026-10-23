# Folder 数据性能：阶段 C 验收记录

日期：2026-10-19。状态：代码、自动化与双浏览器构建验证通过；**真机待验证**。阶段 D 未实施。

## 实现与复杂度边界

- `folder_snapshots` 只存元数据；`folder_snapshot_payloads` 按同一个 id 保存压缩正文。创建、分组替换、清理删除同时提交两张表，失败同时回滚。
- 列表和容量查询只读元数据，释放保护只更新元数据。保存/去重/清理不读取正文记录；去重额外查询一个正文主键，避免把已缺失正文的记录当作删除保护点复用。这是业务存在性检查，开发、生产路径一致。
- 新快照保存时计算计数、hash 和正文 bytes。明确恢复时读取目标正文并校验 hash/schema；缺失或损坏则标记 invalid，历史列表不重复解码。WebCrypto 不可用不等于数据损坏，不将它标成 invalid。
- 恢复先保护目标，再读取正文；提交组织数据时，在同一业务事务检查目标 scope、hash 和本次 lease 有效性。压缩、hash 和解码在 IndexedDB 事务外完成，避免异步 crypto 导致事务自动关闭。
- 列表、手动创建只返回 `FolderSnapshotSummary` 白名单。`prepareChatDeletion` 只返回 id/protectionToken，正文、内部 hash、lease 列表和预算字段不进入这些 RPC 的 data。
- 保留每账号 10 条、3 条重要恢复点优先、60 秒分组间隔/5 分钟上限、15 分钟保护 lease、100 个并发 lease 上限，以及一次 quota 重试规则。
- **Folder 尚未发布，只有一份最终 schema（Dexie version 16），没有开发版数据迁移、旧快照搬迁、计数回填或 ready/启动校验任务。** 已发布功能的表和版本历史保留，已有非 Folder 数据保留用例通过。旧开发版 Folder 数据不作为兼容输入；本次未读取或清理真实浏览器数据库。
- 详细访问量与链路日志全部在 DEV 条件内，复用已有事务计数器。没有诊断持久状态、缓存、队列或重试框架。新增正文表和提交守卫服务于业务原子性；没有为了日志扩大事务作用域。列表查询的一次隐式只读事务改为相同单表作用域的显式只读事务，以复用既有查询观测。

逻辑预算定义：

```text
payloadBytes = compressedPayload.byteLength  // gzip ArrayBuffer
snapshotBytes = UTF8(JSON.stringify(persistedMetadata)).length + payloadBytes
```

2026-10-20 切换原生 gzip 后采用上述口径。persistedMetadata 包含 payloadBytes、validationState 和保护 lease 等持久字段，仅排除响应用 protectionToken；正文按二进制 byteLength 计量，不作 JSON 序列化。表拆分后重复保存的主键、索引和存储引擎开销不属于该口径。**20 MiB 是逻辑预算，不是浏览器实际磁盘占用。** lease 变化只重算小型元数据，不重新读取或序列化大正文。

## 自动化证据

工作区基准：HEAD `b76a1913d62b8e6612164ed03c8d4e99ec8618c9` 加现有暂存/未暂存变更，不是只对 HEAD 验证。没有暂存、提交或覆盖其他在途修改。

| 检查 | 结果 |
| --- | --- |
| `pnpm compile` | 通过 |
| `pnpm test:run` | 122 个测试文件、989 个用例通过 |
| 阶段 C 新增原生 IDB/恢复集成用例 | `src/services/folder-recovery/performance.test.ts`：18 项通过 |
| `pnpm build` | Chromium MV3 通过 |
| `pnpm build:firefox` | Firefox MV2 通过 |
| `node scripts/check-folder-production-diagnostics.mjs .output/chrome-mv3 .output/firefox-mv2` | 通过，分别检查 11 / 9 个 JS 文件 |
| `git diff --check` | 通过 |

新增用例独立观测原生 IndexedDB API，验证列表、容量、释放保护的正文表访问为零，且对应事务不包含正文表；实际 RPC handler 验证响应白名单。分组/复用均无正文记录读取，分组写一条正文，复用只查询一条正文主键、不重写正文。开发事务报告与独立原生计数匹配。

另覆盖创建/分组/删除失败的双表回滚、quota 失败后单次成功重试、Unicode/JSON 转义预算、lease 更新预算、跨账号与数据库重开、正文缺失/hash/schema 损坏、恢复目标被锁后不能被分组覆盖、提交前 lease 过期或 hash 改变时保持现有组织，以及跨账号拒绝。20 MiB 边界用例注入正文长度元数据验证预算刚好满/超出 1 byte 及 lease 过期后的物理删除；它不是 Chrome 真实磁盘配额测试。既有大组织用例另验证实际压缩后超过 100 KB 的正文计量。

生产分支测试移除开发中间件后，保存/分组/复用/释放/容量查询的原生数据库操作、事务范围和预算与开发分支一致，且没有详细日志。**产物扫描仅证明指定诊断标记缺席**，不能证明所有辅助逻辑消失。源码仍包含必要的摘要白名单、业务校验和事务边界；没有新增 Repository 诊断接口或上下文框架。

原始日志：`/tmp/gpk-stage-c-compile.log`、`/tmp/gpk-stage-c-full-tests.log`、`/tmp/gpk-stage-c-performance-tests.log`、`/tmp/gpk-stage-c-chrome-build.log`、`/tmp/gpk-stage-c-firefox-build.log`、`/tmp/gpk-stage-c-production-scan.log`。

生产后台 SHA-256（仅标识该文件，不代表整个扩展包）：

```text
chrome-mv3/background.js  3bb49f7000d45e533fedb100cabb66140ffe0a8ff7867fd31902e0b00961b7bd
firefox-mv2/background.js c0c906babb9688308c9ff9e79e7879f87f23472b28872d339024a40da974cbea
```

## 手工准备

1. 沿用阶段 A/B 的隔离测试账号和测试浏览器配置。若其中仍有旧开发版 Folder 数据，先导出组织备份；本阶段请使用没有旧 Folder 数据的测试配置加载构建，再导入备份。**不要删除整个 `gemini_extension` 数据库来处理旧 Folder 数据**，其中还包含其他功能数据。旧备份的导入属于正常业务操作，不是后台自动迁移；旧恢复点历史不导入。
2. Chrome 执行 `VITE_FOLDER_DIAGNOSTIC_RPC_BYTES=true pnpm dev`；Firefox 单独执行 `VITE_FOLDER_DIAGNOSTIC_RPC_BYTES=true pnpm dev:firefox`。确认实际加载的是本次构建。手工 UI 路径沿用项目 `gemini-power-kit-verify`：Gemini 侧栏插件入口 → Settings → Folders。无需发送 Gemini 消息，也不操作原生聊天删除。
3. 从当前测试账号导出的备份取得 accountScopeId，替换下面的 `YOUR_TEST_SCOPE`。运行后在 Folders 的 Backup file/备份文件入口导入：

   ```bash
   node scripts/create-folder-performance-fixture.mjs --scope YOUR_TEST_SCOPE --folders 5 --chats 1000 --seed phase-c-v1 --output /tmp/gpk-phase-c-1000.json
   node scripts/create-folder-performance-fixture.mjs --scope YOUR_TEST_SCOPE --folders 5 --chats 10000 --seed phase-c-v1 --output /tmp/gpk-phase-c-10000.json
   ```

   同一输出文件已存在时换文件名。合成聊天只用于 Folder 组织操作，不点击合成聊天或调用 Gemini 删除/改名。大数据超出 Browser Sync 容量时单独记录，勿将云端状态当作 Recovery 成败。
4. 页面和扩展后台 Console 开启 Preserve log、Verbose/Debug，过滤 `[Folders]`。Chrome 从扩展管理页打开 Service Worker 检查窗口；Firefox 从 `about:debugging#/runtime/this-firefox` 检查扩展。**数据库和下方访问监测在扩展后台，不在 Gemini 页面。**
5. 记录浏览器/OS/扩展 ID、构建命令、HEAD/工作区状态、账号数量及 fixture seed/规模。先等导入及自动恢复点任务稳定，再开始每项采样。

## 一次性正文表访问监测

为独立核对容量查询等没有完整事务报告的路径，在**开发构建的扩展后台 Console**执行下面代码。只统计调用次数，不读取正文、不打印标题/payload；不要同时在 IndexedDB 面板展开正文表，否则面板读取也会被计入。

```js
globalThis.__gpkStageCPayload?.stop()
{
  const calls = {}
  const restorers = []
  for (const prototype of [IDBObjectStore.prototype, IDBIndex.prototype]) {
    for (const name of ['get', 'getAll', 'getKey', 'getAllKeys', 'count', 'openCursor', 'openKeyCursor', 'put', 'add', 'delete']) {
      const descriptor = Object.getOwnPropertyDescriptor(prototype, name)
      if (!descriptor || typeof descriptor.value !== 'function') continue
      const original = descriptor.value
      Object.defineProperty(prototype, name, { ...descriptor, value: function (...args) {
        const store = this.objectStore ?? this
        if (store.name === 'folder_snapshot_payloads') calls[name] = (calls[name] ?? 0) + 1
        return original.apply(this, args)
      } })
      restorers.push(() => Object.defineProperty(prototype, name, descriptor))
    }
  }
  globalThis.__gpkStageCPayload = {
    reset() { for (const key of Object.keys(calls)) delete calls[key] },
    report() { return { ...calls } },
    stop() { restorers.reverse().forEach((restore) => restore()); delete globalThis.__gpkStageCPayload }
  }
}
```

每项开始前 `__gpkStageCPayload.reset()`，结束后 `__gpkStageCPayload.report()`，复制结果。`get/getAll/openCursor` 是正文读取请求，主键请求另列；它们不是实际返回记录数或物理磁盘 I/O。后台 worker 重启会移除这段脚本，需要重新安装。结束后运行 `__gpkStageCPayload.stop()`。

## 真机步骤与预期

每项先执行一次功能检查，再对历史展开/容量查询各采 20 次有效运行。保存原始页面和后台日志；独立任务与失败重试单列，不混入本次列表耗时。

| 场景 | 操作 | 预期与应回传证据 |
| --- | --- | --- |
| 列表与容量 | 创建一次手动恢复点，等后台稳定，重置正文监测；关闭/重开设置并展开恢复点历史，重复 20 次 | `listSnapshots` 的 data.access 只有元数据；`recovery.storage-status` 给出 metadataRows/snapshotBytes。正文监测 `{}`，RPC 响应有摘要但无 compressedPayload。记录 RPC 次数、responseBytes、p50/p95；RPC 总字节数不是 0 |
| 分组替换 | 连续两次修改合成 Folder 名称，间隔小于 60 秒，并等待每次自动恢复点保存；核对历史和后台事件 | 自动恢复点 id 相同，updatedAt 与计数更新，outcome=grouped，正文 writes=1/records=0。手动恢复点会中断分组；重命名回相同组织可能触发 reused，需分别记录 |
| 去重与保护释放 | 执行下方 prepare/release RPC 步骤 | prepare 只返回 id/token；复用可有正文主键请求，无正文读取/重写。释放单独重置监测，结果 `{}`；元数据中对应 lease 移除，其他 lease 保留 |
| 保留与物理清理 | 每次改成不同 Folder 名称后手动创建恢复点，共 12 次，保证各组织不同；检查两张表的主键 | 单账号最多 10 条；两表相同 id 集合，被淘汰 id 在两表都消失。只查主键即可，不展开正文。将主键检查与性能采样分开，检查自身会产生主键请求 |
| 恢复与双页竞争 | 手动创建目标，再修改 Folder；在 A 恢复目标，同时 B 修改组织或产生自动恢复点 | 恢复明确读取一个目标正文；正常恢复后组织匹配目标。冲突/目标变化时可拒绝，不能显示成功却写入错误组织。记录保护、读取、提交/回滚日志；不要把必要保护捕获算作列表读取 |
| worker 重启 | 保存几个恢复点并记下 id；关闭后台 DevTools、停止 worker，再打开 Gemini 设置（Firefox 重载扩展后刷新页面） | 既有摘要、预算与恢复功能仍可用；没有旧快照回填/启动补校验。若存在未释放 lease，等待 15 分钟到期后下一次正常清理才可淘汰；重新安装监测后再采样 |
| 跨账号与近预算 | A/B 测试账号分别积累不同组织恢复点，记录每次逻辑 bytes、两表主键；若数据未接近 20 MiB，标记本项样本不足，不声称通过 | 历史只显示当前账号；预算合计跨账号。接近/超过逻辑上限时只淘汰符合策略且无有效 lease 的历史；无法容纳时明确失败，现有组织和受保护点不受损 |
| 生产回归 | 分别加载 `.output/chrome-mv3`、`.output/firefox-mv2`，重复列表、创建、分组、恢复 | 功能一致，无详细诊断事件。生产包不依赖上述 Console 脚本；运行完成后移除脚本 |

prepare/release 的无原生删除验证（Chrome）：在 **Gemini 页 DevTools 的 Console 上下文选择本扩展 content script 的 isolated world**，确认 `chrome.runtime?.id` 为本扩展 ID。不要在默认 page world 或后台发送来绕过 sender 校验。替换 scope 后执行：

```js
globalThis.__gpkStageCRpc = async (method, params = {}) => {
  const response = await chrome.runtime.sendMessage({
    namespace: 'folders', protocolVersion: 1, requestId: crypto.randomUUID(),
    accountScopeId: 'YOUR_TEST_SCOPE', identitySource: 'observed', method, params
  })
  if (!response?.ok) throw new Error(response?.error?.code ?? 'RPC failed')
  return response.data
}
globalThis.__gpkStageCProtection = await __gpkStageCRpc('prepareChatDeletion')
Object.keys(__gpkStageCProtection) // Only id and protectionToken.
```

在后台重置正文监测，再回页面执行：

```js
await __gpkStageCRpc('releaseSnapshot', {
  snapshotId: __gpkStageCProtection.id, protectionToken: __gpkStageCProtection.protectionToken
})
delete globalThis.__gpkStageCProtection
delete globalThis.__gpkStageCRpc
```

本操作只创建/释放本地保护点，不删除 Gemini 聊天。无法选择正确上下文时回传“上下文不可用”，不放宽 sender 检查；Firefox 若无法选择 addon content script 上下文，先完成其他 UI 项，保护 RPC 的真机项记待验证。

自动化已覆盖损坏正文、quota 抛错与多 lease 等故障注入，暂不要求在真实数据上修改正文或制造磁盘耗尽。真实浏览器的 quota 边界、跨账号近预算样本、worker 生命周期仍需上表的运行证据；自动化通过不替代它们。

日志可保存为 `/tmp/gpk-stage-c-page.log`、`/tmp/gpk-stage-c-worker.log`（双页另存 B），然后运行：

```bash
node scripts/summarize-folder-performance-logs.mjs /tmp/gpk-stage-c-page.log /tmp/gpk-stage-c-worker.log
```

回传：浏览器/版本/OS、构建与数据规模、场景/次数、功能结果、正文监测结果、RPC bytes/p50/p95、清理前后两表 id 集合、逻辑预算、失败/回退原因及原始日志。fake IndexedDB 耗时不代表 Chrome/Firefox 延迟；没有同环境修复前基线时不计算性能提升百分比。取得真机证据前保持“待验证”。
