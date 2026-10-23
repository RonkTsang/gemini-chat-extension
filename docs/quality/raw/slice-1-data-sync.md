# slice-1 测试有效性审计报告

范围：`.tmp/audit/slice-1.txt` 的 16 个测试文件（3164 行，约 **213 个用例**）。
性质：只读审计；未运行 vitest；结论基于逐文件通读 + 关键生产实现核对（`folderRepository.ts`、`folder-performance` 相关 `query-service.ts`、`folder-recovery/storage.ts|snapshots.ts|runner.ts`、`folder-sync/browser-sync.ts|scheduler.ts|coordinator.ts|debug.ts`、`gemAvatarRepository.ts`、`gemini-identity/index.ts|account-history.ts`、`domain/folder/*`）。

---

## 1. 概要

| 维度 | 数量 |
| --- | --- |
| 发现总数 | **24** |
| 高（建议删除/重写） | **3** |
| 中（建议合并/加强） | **10** |
| 低（可选清理） | **11** |
| 涉及文件数 | **14 / 16**（仅 `coordinator.test.ts`、`codec.test.ts` 干净） |

高置信结论：
1. `folderRepository.test.ts` 的恢复失败回退用例存在 **3 组重复**（同一可观测断言），其中 2 条应删除。
2. `folderRepository.test.ts` 的自定义外观用例标题声称“preserves unchanged appearance”，但 **rename 结果变量被声明后从未断言**，属假覆盖。
3. `scheduler.test.ts` 用 `setTimeout(20)` 断言“不会发生”，存在真实回归下的假阴性 + CI 抖动风险。

> 说明：Lead 的静态扫描把 `scheduler.test.ts` 的大量 spy 计数标为 mockOnly。按本次判定标准，**调度去重/合并/限流本身即被测协议**，这些用例多数有效（见 §5），不建议按 mockOnly 批量删除。

---

## 2. 发现列表

### 高

#### H1 — 标题声称“保留外观”，但从未断言外观；`renamed` 变量未使用
- **严重度/类别**：高 / E（测试名与断言不符、假覆盖）
- **位置**：`src/data/repositories/folderRepository.test.ts:451-468`
- **用例**：`retained local organization regressions > stores a validated custom color and preserves unchanged appearance`
- **证据**：

```ts
const renamed = await repository.updateFolder(scopeA, created.id, { name: 'Renamed only' }).then((result) => result.data)

await expect(repository.updateFolder(scopeA, created.id, {
  colorValue: 'url(https://example.com)' as '#badbad',
}).then((result) => result.data)).rejects.toThrow('color is invalid')
```

`renamed` 之后没有任何 `expect`。
- **判定理由**：用例名中的 “preserves unchanged appearance” 是唯一未被验证的承诺。当前只验证了创建时的 color 归一化 + 非法色/非法 icon 被拒。
- **能捕获的真实回归**：不能捕获 `updateFolder` 在“只改 name”时把 `iconKey`/`colorValue` 覆盖为默认值或 undefined（部分更新 bug）。
- **建议**：重写为
  `expect(renamed).toMatchObject({ name: 'Renamed only', iconKey: 'education', colorValue: '#a1b2c3' })`。
- **置信度**：高

#### H2 — 恢复失败回退（failure-status 写失败）用例三处重复
- **严重度/类别**：高 / D（重复，且含 `rejects.toBeDefined()` 弱断言）
- **位置**：
  - `src/data/repositories/folderRepository.test.ts:158-168`（`Folder local organization > preserves recovery failure classification if the failure status record cannot be persisted`）
  - `src/data/repositories/folderRepository.test.ts:499-509`（`retained local organization regressions > keeps the original recovery failure visible when its status record cannot be written`）
  - `src/data/repositories/folderRepository.test.ts:529-552`（`it.each` 三行，第三行 `new Error('Snapshot write failed') → 'snapshot-failed'`；第二行 `DOMException QuotaExceededError → 'quota-exceeded'`）
- **证据**：

```ts
// :160-163
const snapshotPut = vi.spyOn(db.folder_snapshots, 'put').mockRejectedValue(new DOMException('Full', 'QuotaExceededError'))
const statusPut = vi.spyOn(db.folder_recovery_states, 'put').mockRejectedValue(new Error('Status unavailable'))
await expect(repo.createSnapshot(scopeA, 'automatic')).rejects.toBeDefined()
expect(await getLocalStorageStatus(scopeA)).toMatchObject({ warning: 'quota-exceeded', automaticSnapshotFailed: true })
// :502-505
const put = vi.spyOn(db.folder_recovery_states, 'put').mockRejectedValue(new DOMException('Quota reached', 'QuotaExceededError'))
await expect(repository.createSnapshot(scopeA, 'automatic')).rejects.toBeDefined()
expect(await getLocalStorageStatus(scopeA)).toMatchObject({ warning: 'quota-exceeded', automaticSnapshotFailed: true })
```

`it.each` 第二行（`:530-531`）与上两者是同一路径同一可观测结果：`{ warning: 'quota-exceeded', automaticSnapshotFailed: true }`。
- **判定理由**：三者命中的是同一段回退代码（`rememberRecoveryFailure` + `recordRecoveryFailure` 再吞掉二次写失败）。`:499` 的“原始错误来自 status put 自身”与 `:531` 的“原始错误来自 snapshot put”在断言层面不可区分；`:158` 与 `it.each` 第二行几乎逐字重复。唯一不可替代的是 `:511-527`（`SNAPSHOT_TOO_LARGE → snapshot-too-large`，错误来自预算校验而非 put mock）。
- **能捕获的真实回归**：三者合计能捕获“回退分类丢失/被二次写失败覆盖”；重复用例不增加覆盖。
- **建议**：删除 `:499-509` 与 `:158-168`，保留 `it.each`（覆盖 budget/quota/unknown 三类），并把 `:511` 的 `snapshot-too-large` 作为第四行并入 `it.each`（需要保留其 budgetBytes=50 的构造）。`rejects.toBeDefined()` 建议换成 `rejects.toMatchObject({ code: ... })` 或至少 `rejects.toThrow()` + 状态断言。
- **置信度**：高

#### H3 — 用真实计时器 sleep 断言“未发生”，回归时会假阴性
- **严重度/类别**：高 / E（依赖真实计时器空转、断言在可能不执行的分支外）
- **位置**：`src/services/folder-sync/scheduler.test.ts:181-188`
- **用例**：`skips split own envelopes without reading Sync or consulting the coordinator`（顶层 it）
- **证据**：

```ts
scheduler.requestStorageChanges({ [`folders:${scope}:manifest`]: { newValue: ownManifest } })
scheduler.requestStorageChanges({ [`folders:${scope}:chunk:0`]: { newValue: ownChunk } })
await new Promise((resolve) => setTimeout(resolve, 20))
expect(coordinator.sync).not.toHaveBeenCalled()
```

- **判定理由**：`requestStorageChanges` 对带 `did` 的通知会先异步 `void Promise.resolve().then(() => this.deviceIdProvider.getDeviceId()).then(...)` 再决定是否 `requestRun`。断言前只睡 20ms：既没有等待该 promise 链完成，也没有可观测完成信号；而且“identity 解析失败/一直 pending”同样会让 `sync` 不被调用，从而**假通过**。机器慢时“本应发生的 run”可能落在断言之后（假阴性）；`not.toHaveBeenCalled()` 无法区分“正确地忽略 own echo”和“通知处理链路坏了”。
- **能捕获的真实回归**：仅在异步链路恰好于 20ms 内完成时，才能捕获“own echo 被误判为远端变更”；对“identity 解析未执行/未恢复”这类真实回归完全失明。
- **建议**：注入可控的 device-id provider（如一个可 `resolve` 的 deferred），在 `await` 该 provider 被调用后 `await Promise.resolve()` 排空微任务；或改为对 `FolderSyncScheduler` 暴露/使用可注入的 flush 点。至少改成先断言 `deviceIdProvider.getDeviceId` 已被调用，再 `await vi.waitFor(() => expect(scheduler-as-interface settled))`。
- **置信度**：高

---

### 中

#### M1 — NFKC 重名/账号隔离/顶部排序与另外两条用例大面积重复
- **严重度/类别**：中 / D（重复覆盖同一分支）
- **位置**：`src/data/repositories/folderRepository.test.ts:135-142`
- **用例**：`Folder local organization > enforces normalized names and top placement while allowing validated custom appearance`
- **证据**：

```ts
const first = await repo.createFolder(scopeA, { name: ' Ｔｅｓｔ ', colorValue: '#4285F4' })
expect(first.data).toMatchObject({ name: 'Test', colorValue: '#4285f4' })
await expect(repo.createFolder(scopeA, { name: 'test' })).rejects.toThrow('already exists')
await repo.createFolder(scopeA, { name: 'Second' })
expect((await repo.listFolders(scopeA)).map((row) => row.name)).toEqual(['Second', 'Test'])
```

- **判定理由**：NFKC 重名拒绝 → `:437-449`（`'Ｎｅｗｅｓｔ'`）；顶部/新→旧排序 → `:437-449`；color 归一化 → `:451-468`；账号 scope → `:437-449`（`updateFolder(scopeB)`）+ `:141`。本用例剩余唯一独有点只有“createFolder 对 `bad-scope` 的拒绝”，且 `:446` 已用 updateFolder 覆盖同类边界。
- **能捕获的真实回归**：仅 color 大小写归一化在 `:137` 有一份；其余无新增覆盖。
- **建议**：删除本用例，把 `first.data` 的 color 归一化断言并入 `:451-468`；NFKC 重名保留 `:437-449` 一处即可。
- **置信度**：中高

#### M2 — pin 幂等/普通序保持与 retained 用例重复
- **严重度/类别**：中 / D
- **位置**：`src/data/repositories/folderRepository.test.ts:44-61` 与 `:248-274`
- **用例**：
  - `Folder local organization > moves relationships physically, preserves normal position while pinning, and pages across pin groups`
  - `retained local organization regressions > pins only the current membership, preserves ordinary order, and treats repeated pin requests as idempotent`
- **证据**：

```ts
// :49-52
const pinned = await repo.setMembershipPinned(scopeA, first.data.id, 'one', true)
expect(pinned.data.orderKey).toBe(one.data.orderKey)
const repeated = await repo.setMembershipPinned(scopeA, first.data.id, 'one', true)
expect(repeated.commit.effect).toBeUndefined()
// :257-264（retained，更强的同一语义）
const pinned = await repository.setMembershipPinned(scopeA, folder.id, 'b', true).then((result) => result.data)
expect(pinned.orderKey).toBe(prior.orderKey)
expect(await repository.setMembershipPinned(scopeA, folder.id, 'b', true).then((result) => result.data)).toEqual(pinned)
expect((await repository.getSyncState(scopeA))!.localDataRevision).toBe(revision)
```

- **判定理由**：`orderKey` 不变、重复 pin 幂等、重新添加后清除 `pinnedOrderKey` 两处都测；retained 版本还多了 revision 不变与跨 folder 隔离，是超集。`:44-61` 的独有价值仅是分页（`rest.items` 顺序）。
- **能捕获的真实回归**：pin 不改变普通序、重复 pin 不产生 revision；两处重复。
- **建议**：删除 `:49-52` 的幂等断言与 `:59-60` 的 move 后清 pin 断言（保留分页），或把 `:44` 整条改名为“pages across pin groups”并只保留分页断言。
- **置信度**：中

#### M3 — “耗尽 pinned key 再平衡”在性能文件与仓库文件各测一遍
- **严重度/类别**：中 / D（跨文件重复）
- **位置**：`src/data/repositories/folder-performance.test.ts:226-245` 与 `src/data/repositories/folderRepository.test.ts:329-340`
- **用例**：
  - `Folder indexed access budgets (native IDB observation) > rejects foreign or nonadjacent anchors and only rebalances the exhausted target group`
  - `retained local organization regressions > rebalances exhausted pinned keys without changing ordinary positions`
- **证据**：

```ts
// performance:230-237
const pinned = await db.folder_memberships.get(data.memberships[0].id)
await db.folder_memberships.update(pinned!.id, { pinnedOrderKey: '1'.padStart(32, '0') })
await repo.setMembershipPinned(scopeA, target.id, 'chat-1', true)
const all = await repo.listMemberships(scopeA)
for (const prior of data.memberships) expect(all.find((row) => row.id === prior.id)?.orderKey).toBe(prior.orderKey)
// repository:335-338
await db.folder_memberships.update(rows[0].id, { pinnedOrderKey: '1'.padStart(32, '0') })
await repository.setMembershipPinned(scopeA, folder.id, 'b', true).then((result) => result.data)
const updated = await repository.listMemberships(scopeA)
for (const row of rows) expect(updated.find((item) => item.id === row.id)?.orderKey).toBe(row.orderKey)
```

- **判定理由**：两处都通过“手工把 pinnedOrderKey 打到下界 → 再 pin 触发 rebalance → 断言普通 orderKey 不变”验证同一行为；断言几乎同构。
- **能捕获的真实回归**：再平衡时误改普通 order 或误改其它 group——任一处即可覆盖。
- **建议**：保留 `folderRepository.test.ts:329-340`（语义聚焦），把 performance 用例收窄为只保留“foreign/nonadjacent anchor 拒绝 + 未受影响 group 行不变（`:238`）”两条，删除再平衡断言；或反向删除 retained 版。
- **置信度**：高

#### M4 — 断言内部索引键 `displayOrderKey` 的字面编码
- **严重度/类别**：中 / C（实现细节耦合）
- **位置**：`src/data/repositories/folder-performance.test.ts:278-280`
- **用例**：`Folder indexed access budgets ... > maintains deduplicated counts through sharing, subtree deletion, import, restore, remote replacement and restart`
- **证据**：

```ts
expect(await db.folder_memberships.toArray()).toEqual(expect.arrayContaining(incoming.memberships.map((row) => expect.objectContaining({
  id: row.id, displayOrderKey: row.pinnedOrderKey ? `0${row.pinnedOrderKey}` : `1${row.orderKey}`,
}))))
```

- **判定理由**：`displayOrderKey` 是 `domain/folder/local-indexes.ts` 中的本地派生索引编码（`membershipDisplayOrderKey`），不参与同步/导出（`organization()` 会剥离）。这里把 `0/1` 前缀写死为期望，等价重构（例如前缀换成 `P/U` 或改用复合索引）行为不变但用例失败。
- **能捕获的真实回归**：仅 “apply 后没有派生 displayOrderKey”（`!!row.displayOrderKey` 已足够）。游标/排序行为的真实回归由本文件 `:100-133` 的分页断言覆盖。
- **建议**：改为 `expect.arrayContaining(incoming.memberships.map((row) => expect.objectContaining({ id: row.id })))`，另加一条“分页顺序与 incoming 的 pin/普通序一致”的行为断言；若确实想锁编码，应改为对 `membershipDisplayOrderKey` 的单元测试（该文件不在本切片）。
- **置信度**：高

#### M5 — 容量提示/硬错误与 retained 两条容量用例重复
- **严重度/类别**：中 / D
- **位置**：`src/data/repositories/folderRepository.test.ts:170-180`
- **用例**：`Folder local organization > keeps hard sync errors separate from usage measurement and respects capacity dismissal thresholds`
- **证据**：

```ts
await repo.recordBrowserSyncUsage(scopeA, { folderBytes: 850, folderBudgetBytes: 1000, totalBytes: 950, quotaBytes: 2000, usagePercent: 85 })
expect((await query.getSyncStatus(scopeA)).showCapacityNotice).toBe(true)
await repo.dismissBrowserSyncCapacityNotice(scopeA, 85)
expect((await query.getSyncStatus(scopeA)).showCapacityNotice).toBe(false)
```

- **判定理由**：`showCapacityNotice` 在 85% 为 true、dismiss 后 false 已被 `:379-410`（79/80/89/90 边界 + dismiss）和 `:412-435`（dismiss 重置、硬错误不清除）完整覆盖；本用例的“硬错误不被 usage 记录清除”同样在 `:412-435` 断言（`warning: 'quota-exceeded'` 保持）。
- **能捕获的真实回归**：无新增；阈值逻辑与硬错误分离均已有更强用例。
- **建议**：删除本用例，或仅保留 `recordBrowserSyncFailure` 后 `warning` 仍为 `'quota-exceeded'` 这一条（可并入 `:412-435`）。
- **置信度**：中高

#### M6 — 以 `console.info` 日志格式/去重作为唯一可观测对象
- **严重度/类别**：中 / C+E（日志字符串耦合；行为只能通过日志推断）
- **位置**：`src/services/gemini-identity/index.test.ts:38-65`、`:67-80`
- **用例**：
  - `GeminiIdentityService > logs unavailable, manual and recent account states without repeating unchanged scans`
  - `GeminiIdentityService > logs automatically identified and historical selections with their sources`
- **证据**：

```ts
expect(log).toHaveBeenCalledExactlyOnceWith('[Folders] Account state', { status: 'unavailable', reason: 'email-not-found' })
await service.confirmManualEmail('saved@example.com', true)
await service.refresh()
expect(log).toHaveBeenCalledTimes(2)
expect(log).toHaveBeenLastCalledWith('[Folders] Account state', {
  status: 'available', source: 'manual-confirmed', selection: 'manual',
  accountScopeId: expect.any(String), fallbackReason: 'email-not-found',
})
```

- **判定理由**：身份状态（`selection: 'manual' | 'recent' | 'history'`、`fallbackReason`）完全可以从 `service.getCurrent()` 读取，却选择断言内部 log 文案 `'[Folders] Account state'` 与去重机制（`lastLoggedAccountState`）。改一次日志措辞或用结构化 logger → 行为不变但用例失败；反之，去重只在日志层，真正的状态转换回归可能被日志去重掩盖。
- **能捕获的真实回归**：状态机（manual/recent/history/fallbackReason）本身；但应通过公共 API 断言。
- **建议**：用 `expect(service.getCurrent()).toMatchObject({...})` 替代日志断言；若要保留“日志不重复”的价值，单独留一条最小用例（只断言同一状态两次 refresh 后 `console.info` 调用次数），并把日志前缀断言降为 `expect.stringContaining`。
- **置信度**：中高

#### M7 — 其余真实计时器 sleep（非 H3）
- **严重度/类别**：中 / E
- **位置**：`src/services/folder-sync/scheduler.test.ts:44`、`:47`、`:124`、`:136`、`:236`
- **用例**：`rate-limits activity hints across tabs...`、`requests one run per account...`、`merges notifications before execution...`、`keeps retry, activity, and alarms on the full path after own echoes`
- **证据**：

```ts
// :42-48（限流）
scheduler.requestRun(scope, 'content-activity-hint')
await vi.waitFor(() => expect(coordinator.sync).toHaveBeenCalledTimes(1))
await new Promise((resolve) => setTimeout(resolve, 0))
scheduler.requestRun(scope, 'content-activity-hint')
await new Promise((resolve) => setTimeout(resolve, 0))
expect(coordinator.sync).toHaveBeenCalledTimes(1)
// :123-125（storage 回调后不再产生第 3 次 run）
await vi.waitFor(() => expect(coordinator.sync).toHaveBeenCalledTimes(2))
await new Promise((resolve) => setTimeout(resolve, 10))
expect(coordinator.sync).toHaveBeenCalledTimes(2)
```

- **判定理由**：这些 sleep 用于“证明没有更多调用”。`requestRun` 的限流是同步的，`:44/:47` 的 0ms sleep 可删；`:124/:136/:236` 的 10ms/0ms 只能证明“10ms 内没有”，无法证明“不会”，既脆弱又无解释力。
- **能捕获的真实回归**：多余/重复 run 的回归；但更可靠的做法是等待所有已知异步链路完成（例如等待 `scheduler` 的 run map 清空——见 L10）后断言计数，而不是睡固定时长。
- **建议**：删除 `:44/:47`；把 `:124/:136/:236` 换成“等待本次 run 完成后立即断言”的确定性同步点（可复用 storage-events 的 idle 思路但不要访问私有字段）。
- **置信度**：中高

#### M8 — 保存头像只断言协作者收到字段，不验证保存结果
- **严重度/类别**：中 / B（mock 编排）
- **位置**：`src/data/repositories/gemAvatarRepository.test.ts:66-85`
- **用例**：`gemAvatarRepository > saves a prepared avatar by Gem ID`
- **证据**：

```ts
mockGetGemAvatarByGemId.mockResolvedValue(undefined)
mockPutGemAvatarAsset.mockImplementation(async (row) => row)
await gemAvatarRepository.savePrepared('gem-1', { mimeType: 'image/webp', size: 10,
  blob: new Blob(['avatar'], { type: 'image/webp' }), width: 256, height: 256 })
expect(mockPutGemAvatarAsset).toHaveBeenCalledWith(expect.objectContaining({
  gemId: 'gem-1', mimeType: 'image/webp', size: 10, width: 256, height: 256,
}))
```

- **判定理由**：`savePrepared` 的返回值、`createdAt` 继承、以及“保存当前激活 gem 时先 revoke 旧 URL”这些真实行为一个都没断言；`mockPutGemAvatarAsset` 的实现（返回 row）也把契约模仿成真。等价重构（例如改用 `DataSource.upsert`）行为不变但用例失败。
- **能捕获的真实回归**：仅“字段映射写错”；漏掉 createdAt 丢失/覆盖、active URL 泄漏（真实 bug 类型）。
- **建议**：断言 `await savePrepared(...)` 的返回值（`gemId/size/width/height/blob`）；新增一个 existing row 用例断言 `createdAt` 保留、`updatedAt` 更新；再补“active gem 相同时保存会 revoke 旧 URL”。
- **置信度**：高

#### M9 — 用错误消息子串区分错误类型（系统性问题）
- **严重度/类别**：中 / C
- **位置/代表用例**（受影响的断言很多，列举最高频的几处）：
  - `src/data/repositories/folderRepository.test.ts:71-74`（`'STALE_REVISION'`）
  - `src/data/repositories/folderRepository.test.ts:138,444,447`（`'already exists'`）
  - `src/data/repositories/folderRepository.test.ts:267-268`（`'unavailable'`）
  - `src/data/repositories/folder-performance.test.ts:131-132`（`'Cursor'` / `'limit'`）
  - `src/data/repositories/folder-performance.test.ts:240-244`（`'unavailable'` / `'adjacent'` / `'already exists'`）
- **证据**：

```ts
await expect(queries.listFolders(scopeA, 'invalid', 10)).rejects.toThrow('Cursor')
await expect(queries.listFolderChats(scopeA, folderId, undefined, 0)).rejects.toThrow('limit')
await expect(repo.moveFolder(scopeA, target.id, ROOT_FOLDER_ID, { beforeId: foreign.folders[0].id })).rejects.toThrow('unavailable')
```

- **判定理由**：这些消息是 `Error('...')` 的自由文本，不是类型化契约。仅改文案（例如 `unavailable` → `not found`）就会让多条用例失败；反过来，把两种不同错误都改成同一句 `unavailable` 也无法被区分。尤其 `'unavailable'` 同时代表“foreign scope / missing folder / missing membership / invalid anchor”多种语义，用例之间无法交叉校验。
- **能捕获的真实回归**：输入校验/跨账号保护被移除会抛错——但用 class/code 断言同样能捕获且更稳。
- **建议**：为 repository/query 错误引入 `code`（项目里 `FolderRecoveryError`、`GemAvatarError` 已有先例），把这些断言改为 `rejects.toMatchObject({ code: 'FOREIGN_SCOPE' | 'STALE_REVISION' | 'INVALID_CURSOR' | ... })`；至少把 `'unavailable'` 按语义拆成不同 code。
- **置信度**：高（问题存在）/ 中（是否值得改，取决于是否愿意引入错误码）

#### M10 — 用生产 `snapshotBytes` 复算期望字节数（oracle 复用）
- **严重度/类别**：中 / A（oracle duplication）
- **位置**：`src/services/folder-recovery/snapshots.test.ts:50-52`
- **用例**：`Folder restore point policy > summarizes only the current account and uses the latest grouped update time`
- **证据**：

```ts
const allRows = await db.folder_snapshots.toArray()
expect(status.snapshotBytes).toBe(allRows.reduce((total, row) => total + snapshotBytes(row), 0))
```

- **判定理由**：`getLocalStorageStatus` 的实现就是 `rows.reduce((sum,row) => sum + snapshotBytes(row), 0)`，期望值用同一 helper 复算，公式层面双方同错不可能被发现。它仍锁定了一个有价值的事实：`snapshotBytes` 是**跨账号全局**统计（`allRows` 包含 scopeB），而 `snapshotCount` 只算当前账号。
- **能捕获的真实回归**：只有“字节统计从全局改为按账号过滤”这一类行集合回归；字节公式/编码错误无法捕获。
- **建议**：保留该用例（它保护全局/账号统计语义），但把公式期望换成硬编码数值或至少加断言注释说明只验证行集合；另补一条 `expect(status.snapshotBytes).toBeGreaterThan(status.snapshotCount * 0)` 之类无意义断言应删除，不要为了覆盖公式再复制实现。
- **置信度**：中高

---

### 低

#### L1 — `calculateBrowserSyncUsage` / `projectedFolderBytes` 的自证式断言
- **严重度/类别**：低 / A
- **位置**：`src/services/folder-sync/providers/browser-sync.test.ts:121-126`、`:65`、`:180`
- **用例**：`counts UTF8 keys, chunk envelopes, all scopes and unrelated extension bytes`；`round trips valid empty snapshots and full settings...`；`writes a coherent author on every item...`
- **证据**：

```ts
expect(result.totalBytes).toBe(Object.entries(values).reduce((sum, [key, value]) => sum + storageItemBytes(key, value), 0))
expect(result.totalBytes - result.folderBytes).toBe(storageItemBytes('unrelated', 'other'))
```

以及 `expect(result.projectedFolderBytes).toBe(calculateBrowserSyncUsage(Object.fromEntries(storage.values)).folderBytes)`。
- **判定理由**：`:124` 用生产 `storageItemBytes` + 同一求和复刻 `calculateBrowserSyncUsage` 的 total 分支；`:125` 才是有效语义断言（folderBytes 排除非 Folder key）。`:65/:180` 用同一 `calculateBrowserSyncUsage` 复算 publish 的 projection——能捕获“projection 与真实写入 map 不一致”，但不能捕获度量公式错误。
- **能捕获的真实回归**：`:125` 可捕获 “unrelated 字节被计入 folderBytes”；`:65/:180` 可捕获 projection 未包含实际写入的 key。
- **建议**：删 `:124`，保留 `:125` 并补硬编码 `folderBytes/totalBytes` 数值；`projectedFolderBytes` 断言保留但加注释说明是 projection-vs-storage 对照。
- **置信度**：中高

#### L2 — 断言 schema 的对象引用同一性
- **严重度/类别**：低 / C（实现细节耦合）
- **位置**：`src/domain/folder/folder-domain.test.ts:43`
- **用例**：`folder domain contracts > uses one core schema and rejects row-level account ownership or embedded settings`
- **证据**：

```ts
expect(folderSyncDataSchema).toBe(folderOrganizationDataSchema)
```

- **判定理由**：生产是 `export const folderSyncDataSchema = folderOrganizationDataSchema` 的别名。若将来定义两个行为等价的独立 schema（合理重构），用例失败但行为不变；若两者真正漂移，本文件其余校验用例（`:44-48`、`:52-58`、`:60-72`）未必会覆盖——也就是说它既过严又不够。
- **能捕获的真实回归**：仅“别名关系被破坏”这一实现事实。
- **建议**：改为行为断言：同一份合法 payload 被两者接受、带 `accountScopeId` 的行被两者拒绝、带 `settings` 的 envelope 被两者拒绝。
- **置信度**：中

#### L3 — 断言存储 key 名，且与 background 侧用例重复
- **严重度/类别**：低 / C + D
- **位置**：`src/services/gemini-identity/account-history.test.ts:27`
- **用例**：`Account history content/background contract > saves, reads and forgets accounts through the actual message handler`
- **证据**：

```ts
expect(Object.keys(values)).toEqual([FOLDER_ACCOUNT_HISTORY_KEY])
```

- **判定理由**：key 名是内部存储契约，读/写都由同一个 store 完成；改名行为不变（除非担心用户已存历史丢失）。同一断言在 `src/entrypoints/background/folders/account-history.test.ts:42` 已有（`Object.keys(values).join() === FOLDER_ACCOUNT_HISTORY_KEY`）。
- **能捕获的真实回归**：几乎只有“误写多个 key”。
- **建议**：删除本侧该断言（background 侧保留一条即可），或改为 `expect(Object.keys(values)).toHaveLength(1)`。
- **置信度**：中

#### L4 — 图标/预设色目录的精确数量与精确数组
- **严重度/类别**：低 / C（目录字面量锁定）
- **位置**：`src/domain/folder/appearance.test.ts:12-25`
- **用例**：`Folder appearance contract > keeps the reference catalogs fixed at 30 icons and 8 preset colors`
- **证据**：

```ts
expect(FOLDER_ICON_KEYS).toHaveLength(30)
expect(new Set(FOLDER_ICON_KEYS).size).toBe(30)
expect(FOLDER_PRESET_COLOR_KEYS).toEqual(['neutral','red','orange','yellow','green','blue','purple','pink'])
```

- **判定理由**：增删一个图标/颜色是合法的产品行为，却要求同步改测试；`Set.size === 30` 的唯一独立价值是检测重复 key（React key / picker 重复）。预设色顺序确实影响 UI，但属于设计契约，放在 domain 单测里过重。
- **能捕获的真实回归**：目录内重复 key（可用唯一性断言捕获）；图标目录漏映射由 `folderAppearance` 的测试/typecheck 覆盖。
- **建议**：删除精确 30/8；保留 `expect(new Set(FOLDER_ICON_KEYS).size).toBe(FOLDER_ICON_KEYS.length)` 与 `FOLDER_PRESET_COLOR_KEYS` 的集合相等断言（或干脆删掉本用例，依赖 `folderAppearance.test.ts`）。
- **置信度**：中

#### L5 — 仅覆盖 dev-only 调试全局
- **严重度/类别**：低 / F（为覆盖而覆盖）
- **位置**：`src/services/folder-sync/debug.test.ts:12-42`（2 个用例）
- **用例**：`Folder sync debug global > exposes the Folder decoder while running in development` / `restores an existing configurable global when uninstalled`
- **证据**：

```ts
const uninstall = installFolderSyncDebugGlobal()
const compressedPayload = encodeLzStringBase64({ folderId: 'folder-1' })
expect(globalThis.decompressFolderData?.(compressedPayload)).toEqual({ folderId: 'folder-1' })
uninstall()
expect('decompressFolderData' in globalThis).toBe(false)
```

- **判定理由**：`debug.ts` 只在 `import.meta.env.DEV` 下给 background DevTools 挂解码器，产品行为零影响。两个用例（安装/恢复）维护成本 > 收益；第二个“恢复已存在全局”是防御性分支，实际只在同一全局被页面占用时发生。
- **能捕获的真实回归**：DevTools 调试便利性失效；无产品回归。
- **建议**：可保留 1 条安装+卸载用例，删除“restores existing”分支；若愿意接受丢弃 dev 工具，可整文件删除（连同 `debug.ts`）。
- **置信度**：中

#### L6 — 迁移用例断言 schema 版本号/表名存在，而非可用性
- **严重度/类别**：低 / F（常量/存在性断言）
- **位置**：
  - `src/data/repositories/folder-performance.test.ts:369`（`expect(db.verno).toBe(14)`）
  - `src/data/repositories/folderRepository.test.ts:203-204`（`expect(upgraded.tables.map(...)).toContain('folder_sync_publications')` 等两条）
- **用例**：`upgrades populated v13 without clearing data...` / `upgrades structural stores monotonically while preserving unrelated product records`
- **证据**：

```ts
// folder-performance.test.ts:369
expect(db.verno).toBe(14)
// folderRepository.test.ts:203-204
expect(upgraded.tables.map((table) => table.name)).toContain('folder_sync_publications')
expect(upgraded.tables.map((table) => table.name)).toContain('folder_sync_conflicts')
```

- **判定理由**：`verno` 是迁移版本常量，下一次合法迁移（v15）就会失败；表名存在是 Dexie 内部形状，不能证明新表可读写。两条用例里真正有价值的是数据保留/派生索引断言（`chain_prompts` 保留、`nameKey`/`displayOrderKey`）。
- **能捕获的真实回归**：迁移未注册（数据断言已覆盖）；新表缺失到写入才暴露。
- **建议**：删除 `verno` 断言；把“表存在”改为对 `folder_sync_publications`/`folder_sync_conflicts` 做一次 put+get 的可用性断言（或直接依赖其他用例已使用这些表）。
- **置信度**：中高

#### L7 — 断言诊断报告的内部字段形状
- **严重度/类别**：低 / C
- **位置**：`src/data/repositories/folder-performance.test.ts:235`
- **用例**：`Folder indexed access budgets ... > rejects foreign or nonadjacent anchors and only rebalances the exhausted target group`
- **证据**：

```ts
await repo.setMembershipPinned(scopeA, target.id, 'chat-1', true)
expect(reports().some((row) => 'rows' in row)).toBe(true)
```

- **判定理由**：`'rows' in report` 是 access-report 诊断载荷的内部字段；用例真正要验证的“只再平衡目标 group”已由 `:237-238` 的 orderKey/行不变断言覆盖。
- **能捕获的真实回归**：诊断里是否附带 rows 明细；与目标行为无关。
- **建议**：删除该断言；若确实想保留诊断契约，应放到专门的 diagnostics 用例里断言更稳定的字段（operation/phase/requestId）。
- **置信度**：中高

#### L8 — conversationId 前缀归一化被三处重复测试
- **严重度/类别**：低 / D
- **位置**：`src/services/gemini-api/conversations.test.ts:12-34`（delete 两例）+ `:38-55`（rename it.each 两行）
- **用例**：`deleteChat > converts a route chat_id...` / `deleteChat > does not duplicate an existing conversation resource prefix` / `renameChat > normalizes chat_id %s...`
- **证据**：

```ts
// :15-21
await deleteChat({ chat_id: '238396412f2123a2' })
expect(execute).toHaveBeenCalledWith(
  'conversation.delete',
  { conversationId: 'c_238396412f2123a2' },
  undefined,
)
// :27-33
await deleteChat({ chat_id: 'c_c09e5b4c22792c37' })
expect(execute).toHaveBeenLastCalledWith(
  'conversation.delete',
  { conversationId: 'c_c09e5b4c22792c37' },
  undefined,
)
```

- **判定理由**：同一个 `toConversationResourceId` 的两个分支（加前缀/幂等）在 delete 与 rename 中被测了 3 次；RPC 参数形状本身是被测协议（有效），但 delete 侧没有断言返回值透传。
- **能捕获的真实回归**：前缀重复/缺失；rename 侧已覆盖 `c_` 前缀不变。
- **建议**：保留 rename 的 `it.each`（同时覆盖透传），把 delete 两例合并为一条 `it.each`，并补 `expect(await deleteChat(...)).toEqual(result)` 的透传断言；或删除 delete 的第二个用例。
- **置信度**：中

#### L9 — `it.each([5, 3])` 两行命中同一分支
- **严重度/类别**：低 / D
- **位置**：`src/services/folder-sync/scheduler.test.ts:204-209`
- **用例**：`does not suppress an unknown manifest version %s`
- **证据**：

```ts
it.each([5, 3])('does not suppress an unknown manifest version %s', async (schemaVersion) => {
  const scheduler = new FolderSyncScheduler(coordinator as never, ownIdentity)
  scheduler.requestStorageChanges({ [`folders:${scope}:manifest`]: { newValue: { ...ownManifest, schemaVersion } } })
  await vi.waitFor(() => expect(coordinator.sync).toHaveBeenCalledTimes(1))
})
```

- **判定理由**：过滤条件只判断 `schemaVersion !== 4`（未知版本），5 与 3 走完全相同的分支、相同断言。
- **能捕获的真实回归**：未知版本被错误静默；一条足够。
- **建议**：改为单个用例（如 `schemaVersion: 99`）或删除 `3` 这一行。
- **置信度**：高

#### L10 — 测试辅助函数直接读私有状态
- **严重度/类别**：低 / C
- **位置**：
  - `src/services/folder-recovery/runner.test.ts:17`（`(runner as unknown as { running: boolean }).running`）
  - `src/services/folder-sync/storage-events.integration.test.ts:10-14`（`(scheduler as unknown as { runs: Map<string, unknown> }).runs.size`）
- **用例**：`FolderRecoveryRunner` 全组 / `storage-events.integration` 全组（beforeEach/helper）
- **证据**：

```ts
// runner.test.ts:17
const idle = (runner: FolderRecoveryRunner) => vi.waitFor(() => expect((runner as unknown as { running: boolean }).running).toBe(false))
// storage-events.integration.test.ts:12-13
await new Promise((resolve) => setTimeout(resolve, 0))
await vi.waitFor(() => expect((scheduler as unknown as { runs: Map<string, unknown> }).runs.size).toBe(0))
```

- **判定理由**：`running` / `runs` 都是 private 实现字段；重命名或改变内部结构（例如用 Set 代替 Map）会让所有相关用例一起报错，而产品行为不变。它们只作为“等待点”，不是被测行为。
- **能捕获的真实回归**：无（真正的断言在后续的 snapshot/pendingRevision/dirty 上）。
- **建议**：用可观测完成信号替代：`await vi.waitFor(() => expect(<可观测副作用>).toBe(...))`；或在被测类上暴露仅测试用的 `whenIdle()`/返回 promise（但这些类不应仅为测试改 API，可用 `vi.waitFor` 观察 effects）。
- **置信度**：中高

#### L11 — “有 warn 即可” 的弱断言
- **严重度/类别**：低 / A+E
- **位置**：`src/data/repositories/folderRepository.test.ts:238-245`
- **用例**：`retained local organization regressions > reports full account counts and keeps restore point counts tied to their saved payload`
- **证据**：

```ts
const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
await db.folder_snapshots.update(point.id, { compressedPayload: 'corrupted' })
expect(corrupt?.folderCount).toBeUndefined()
expect(corrupt?.chatCount).toBeUndefined()
expect(warning).toHaveBeenCalled()
```

- **判定理由**：`toHaveBeenCalled()` 不校验内容/参数，任何无关 warn（甚至其他被测代码的告警）都会让它通过；真正锁定的行为已由前两条断言覆盖。
- **能捕获的真实回归**：`withSnapshotCounts` 静默失败不再记录告警——价值很低。
- **建议**：删除，或改为 `expect(warning).toHaveBeenCalledWith(expect.stringContaining('Could not read restore point counts'), expect.anything())`（但那就落入日志字符串耦合，二选一：删更干净）。
- **置信度**：中

---

## 3. 文件覆盖表

| 文件 | 用例数 | 结论 | 备注 |
| --- | --- | --- | --- |
| `src/data/repositories/folder-performance.test.ts` | 14 | 发现 4 处（M3/M4/L6/L7）+ 参与 M9 | 通读；预算/诊断/游标断言大量有效 |
| `src/data/repositories/folderRepository.test.ts` | 36 | 发现 6 处（H1/H2/M1/M2/M5/L11）+ M9 | 通读；主体行为覆盖扎实，重复集中在 retained 组 |
| `src/data/repositories/gemAvatarRepository.test.ts` | 4 | 发现 1 处（M8） | 通读；validateObjectUrl 两例有效 |
| `src/domain/folder/appearance.test.ts` | 3 | 发现 1 处（L4） | 通读 |
| `src/domain/folder/folder-domain.test.ts` | 6 | 发现 1 处（L2） | 通读；tree/schema 校验有效 |
| `src/services/folder-recovery/runner.test.ts` | 10 | 发现 1 处（L10 一半） | 通读；并发/轮转/事务用例有效 |
| `src/services/folder-recovery/snapshots.test.ts` | 13 | 发现 1 处（M10） | 通读；保留策略/预算/租约用例有效 |
| `src/services/folder-sync/codec.test.ts` | 3 | 干净 | 通读 |
| `src/services/folder-sync/coordinator.test.ts` | 30 | 干净 | 通读；负向 `storage.sync.set` 断言属协议 |
| `src/services/folder-sync/debug.test.ts` | 2 | 发现 1 处（L5） | 通读 |
| `src/services/folder-sync/providers/browser-sync.test.ts` | 26 | 发现 1 处（L1） | 通读；传输/校验/配额用例有效 |
| `src/services/folder-sync/scheduler.test.ts` | 25 | 发现 3 处（H3/M7/L9） | 通读；调度协议 spy 断言多数有效（见 §5） |
| `src/services/folder-sync/storage-events.integration.test.ts` | 5 | 发现 1 处（L10 一半） | 通读 |
| `src/services/gemini-api/conversations.test.ts` | 5 | 发现 1 处（L8） | 通读；RPC 参数属被测协议 |
| `src/services/gemini-identity/account-history.test.ts` | 4 | 发现 1 处（L3） | 通读 |
| `src/services/gemini-identity/index.test.ts` | 27 | 发现 1 处（M6） | 通读；DOM/竞态/失败路径用例有效 |
| **合计** | **213** | **24 发现 / 14 文件** | 全部通读 |

---

## 4. 潜在跨文件/跨组重复清单（供 Lead 统一合并）

| # | 重复行为 | 位置 A | 位置 B | 建议 |
| --- | --- | --- | --- | --- |
| 1 | 耗尽 pinned key 再平衡 | `folder-performance.test.ts:226-245` | `folderRepository.test.ts:329-340` | 保留仓库侧，性能侧收窄（M3） |
| 2 | 恢复失败回退分类 | `folderRepository.test.ts:158-168` | `:499-509`、`:529-552`（quota 行） | 删前两条，保留/扩充 it.each（H2） |
| 3 | NFKC 重名 + 顶部排序 + 账号隔离 | `folderRepository.test.ts:135-142` | `:437-449` | 删前者（M1） |
| 4 | pin 幂等 / 普通序保持 | `folderRepository.test.ts:44-61` | `:248-274` | 保留后者（M2） |
| 5 | 容量提示阈值与 dismiss | `folderRepository.test.ts:170-180` | `:379-410`、`:412-435` | 删前者（M5） |
| 6 | `removeChatAfterGeminiDelete` 行为 | `folderRepository.test.ts:594-605` | `folder-performance.test.ts:283-300`（仅 stateWrites 计数） | 保留仓库侧；性能侧只保留“一次 revision 写入”协议断言 |
| 7 | 快照/同步 payload 可移植性 | `folderRepository.test.ts:78-88` | `folder-performance.test.ts:247-281`、`codec.test.ts:6-19` | 交互不同，可保留；无需合并 |
| 8 | 存储 key 名断言 | `gemini-identity/account-history.test.ts:27` | `entrypoints/background/folders/account-history.test.ts:42` | 保留 background 侧（L3） |
| 9 | 安装身份 provider 持久/重试 | `browser-sync.test.ts:185-193`（`folder-data/device-id`） | `entrypoints/background/folderDeviceId.test.ts`（另一个 provider） | 模块不同，不算严格重复；但 `browser-sync.test.ts` 承载了不属于 transport 的用例，建议移到 `folder-data/device-id.test.ts` |
| 10 | 外观目录/颜色归一化 | `domain/folder/appearance.test.ts:12-33` | `folderRepository.test.ts:135-142`、`:451-468` | 目录契约留在 domain；repository 只测持久化 |
| 11 | 诊断日志/状态观测 | `gemini-identity/index.test.ts:38-80` | 同文件后续 `getCurrent()` 断言用例 | 合并为公共 API 断言（M6） |

---

## 5. 看起来可疑但判定有效（防误报）

1. **`scheduler.test.ts` 里大量 `expect(coordinator.sync).toHaveBeenCalledTimes/With(...)`**
   - 静态扫描会标成 mockOnly，但 `FolderSyncScheduler` 的职责 **就是** 合并唤醒、限流、保留 trailing run、选择 reason/traceId、按 account 拆分。调用次数/参数/最后一次调用本身就是被测协议（与用户判定标准中“调度去重/写入预算/幂等属于有效测试”一致）。
   - 只有“用真实计时器 sleep 证明未发生”的部分无效（H3/M7）；`vi.waitFor` 的正向计数断言应保留。
   - 注意：若后续把 `sync` 改成事件总线，这些用例确实需要重写，但目前它们是该模块唯一的行为观测点。

2. **`snapshots.test.ts:161-167` — `does not reject a write based on an estimated quota`（断言 `estimate` 未被调用）**
   - 只断言“某个协作者没有被调用”，看似 B；但这是有意的设计约束：历史 bug 是“根据 `navigator.storage.estimate()` 预检并拒绝写入”，导致本可写入的快照被误判。该用例是对“移除预检”这一决策的回归保护，且断言的是真实副作用缺失，**有效**。

3. **`folder-performance.test.ts:63-67` 的 `expectSummary()` — 用生产 `countFolderOrganization` 算期望**
   - 看似 oracle duplication，但两侧数据源不同：`getSyncStatus` 读的是**增量维护**的 `folder_organization_summaries`，期望是 `getAccountData()` 原始行 + 全量重算函数。它实际是差分测试，能捕获“summary 表漂移 / 增量维护漏算”这类真实回归（`:247-281`、`:283-300` 大量复用它）。应当保留；若要更严格，可对初始 fixture 额外断言硬编码计数。

---

### 附：建议 Lead 优先处理顺序

1. **H2**：删 2 条重复用例（净减少 ~2 用例、缩短单文件时长）。
2. **H1**：补 1 条断言即可恢复假覆盖（成本最低）。
3. **H3 + M7**：把 `setTimeout` 等待改成确定性等待点，消除 CI 抖动。
4. **M3/M1/M2/M5**：跨文件/跨组重复合并，预计可再减 5-8 条用例且不降覆盖。
5. **M9**：如需长期治理，引入错误 `code` 后再批量替换消息子串断言。
