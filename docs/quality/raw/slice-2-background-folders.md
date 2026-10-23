# Slice-2 测试质量审计：background + content/folders + overlay/folders

审计性质：只读。未运行 vitest（沿用 Lead 的全量结果），未修改清单内任何文件。唯一写入：本报告。
审计范围：`.tmp/audit/slice-2.txt` 中 25 个文件，共 3737 行，163 个测试声明，展开 `it.each` 后约 **172 个用例**。25 个文件全部逐行通读；对关键断言读取了生产实现（runtime.ts、rpc-handler.ts、command-service.ts、chat-title-cache.ts、native-menu.ts、native-chat-delete.ts、new-chat.dom.ts、new-chat.ts、AnchoredGeminiMenu.tsx、FolderPicker.tsx、notification presenter/index 等）。

判定基线：删掉该断言/用例后，若能明确说出一个合理回归会漏掉，则不判为无效（最多“低价值但有效”）。

## 1. 概要

| 统计项 | 数量 |
| --- | --- |
| 发现总数 | **22** |
| 高（建议删除/重写） | **2** |
| 中（建议合并/加强） | **8** |
| 低（可选清理） | **12** |
| 涉及文件 | **14 / 25** |
| 无发现文件 | 11 |

类别分布：A 恒真/弱断言 2；B Mock 编排 2；C 实现细节耦合 7；D 重复/冗余 4；E 假覆盖/测试缺陷 6；F 死代码/测 mock 2（部分条目跨类，主类计一次）。

最高优先级三条：H1（chat-title-cache 测试整个文件在测一个无行为死类）、H2（index.test.ts 的 fake timer 顺序让 “不自动清除” 用例永远无法失败）、M1（名为 “background RPC boundary” 的用例只测 zod schema，handler 去掉校验也不会失败）。

---

## 2. 发现列表

### H1

- **严重度/类别**：高 / F（死代码 + 测 mock 的空壳）
- **位置**：`src/entrypoints/content/folders/chat-title-cache.test.ts:50-68`（`FolderChatTitleCacheController > does not observe Gemini title changes for an already organized chat`；`... > does not cache titles for chats that are not organized by Folders`，共 2 例）
- **证据**：
```ts
// chat-title-cache.test.ts:16-24  mock 了 './runtime'，但生产实现根本不 import 它
vi.mock('./runtime', () => ({ folderRuntime: { getSnapshot: () => state.snapshot, subscribe: ..., updateChatTitle: state.updateChatTitle } }))
// chat-title-cache.ts:6-9  被测“行为”是空方法
export class FolderChatTitleCacheController {
  start(): void {}
  stop(): void {}
}
```
- **判定理由**：生产类 `FolderChatTitleCacheController` 在 `src/` 内**没有任何引用**（`grep -rn "FolderChatTitleCacheController|chat-title-cache" src` 只命中自身与测试），start/stop 为空；测试却搭了完整 DOM 与 runtime mock（该 mock 完全没被使用），断言“没有调用 updateChatTitle/没有写入”。这是对“已删除功能”的空壳守卫，不是行为测试。
- **能捕获的真实回归**：无。删掉两条用例（乃至删掉生产空壳类）不会漏掉任何用户可见回归。
- **建议**：删除整个测试文件；同时评估删除 `chat-title-cache.ts` 死代码（若坚持保留兼容壳，用注释/架构说明代替 69 行测试）。
- **置信度**：高

### H2

- **严重度/类别**：高 / E（假覆盖：timer 安装顺序使报告的行为无法被检测）
- **位置**：`src/entrypoints/background/responseCompleteNotification/index.test.ts:1040-1051`（`responseCompleteNotification background V2 > does not auto-clear response-complete notifications`）
- **证据**：
```ts
completeStream()               // 通知在此创建，此时仍是真实计时器
await flushPromises()
clearNotificationMock.mockClear()
vi.useFakeTimers()             // 之后才切换到 fake timers
await vi.advanceTimersByTimeAsync(5_000)
expect(clearNotificationMock).not.toHaveBeenCalled()
```
- **判定理由**：若实现回归为“response-complete 通知也调用 `scheduleNotificationClear`”，该 `setTimeout` 会在 `vi.useFakeTimers()` 之前以**真实计时器**注册；`advanceTimersByTimeAsync(5000)` 只推进 fake 时钟，永远不会触发它，断言必然通过。该用例名声称的安全网实际不存在。
- **能捕获的真实回归**：无。自动清除错误地应用到回复完成通知（通知会消失）不会被本用例发现。
- **建议**：重写——先 `vi.useFakeTimers()`，再启用通知并 `completeStream()`，用 `await vi.advanceTimersByTimeAsync(0)` 代替 `flushPromises()` 冲刷微任务，然后推进 5000ms；或直接 mock `./routing` 的 `scheduleNotificationClear` 并断言创建完成后未被调用。
- **置信度**：高

### M1

- **严重度/类别**：中 / E（测试名声称的边界行为未被断言）
- **位置**：`src/entrypoints/background/folders/command-service.test.ts:49-54`（`Folder title command > rejects empty and oversized titles at the background RPC boundary`）、同文件 `:56-65`（`... > validates and forwards explicit missing-replica recreation guards without changing ordinary retry`），以及 `:22` 的同类 schema 断言
- **证据**：
```ts
it('rejects empty and oversized titles at the background RPC boundary', () => {
  expect(folderRpcParams.updateChatTitle.safeParse({ chatId, title: ' \n ' }).success).toBe(false)
  expect(folderRpcParams.updateChatTitle.safeParse({ chatId, title: 'x'.repeat(501) }).success).toBe(false)
  expect(folderRpcParams.updateChatTitle.safeParse({ chatId, title: '../bad', title: 'Title' }).success).toBe(false)
})
```
- **判定理由**：用例没有经过 background RPC handler，只调用了 `@/domain/folder/rpc` 的 zod schema。真正的边界在 `rpc-handler.ts:69`（`folderRpcParams[request.method].safeParse`），但没有任何用例覆盖“handler 对非法 params 返回 INVALID_REQUEST / 不执行命令”。把 `rpc-handler.ts` 里那次 `safeParse` 删除，本文件所有断言仍全绿。同文件其它两个 schema 断言（`:60-61`）也是同一问题。
- **能捕获的真实回归**：只捕获 schema 本身的收紧/放宽；边界接线（handler 是否真的校验）无覆盖。
- **建议**：把这些断言移到 `rpc-handler.test.ts` 的 `it.each`（如 `createFolderAndAddChat`／`updateChatTitle` 传非法 params），断言 `{ ok:false, error:{code:'INVALID_REQUEST'} }` 且 `FolderCommandService.execute` 未被调用；command-service 文件只保留命令行为。
- **置信度**：高

### M2

- **严重度/类别**：中 / B（只断言 mock 被调用次数，不验证行为结果/参数）
- **位置**：`src/entrypoints/content/folders/native-chat-delete.test.ts:55-71`（`deleteGeminiChat > uses the native menu only when the RPC request was not sent`）
- **证据**：
```ts
await deleteGeminiChat('c_c09e5b4c22792c37')
expect(deleteConversationRows).toHaveBeenCalledTimes(1)
// 没有断言 deleteConversationRows 收到了哪一行，也没有断言失败结果/隐藏行恢复
```
- **判定理由**：被测函数的核心行为是“定位到唯一正确的 SideNav 行并删除它”，测试却只数了 fallback 被调一次。传错行、删除返回 `{status:'failed'}`（应抛错并恢复 display）、或未临时恢复被隐藏行（生产 `native-chat-delete.ts:79-84`）都不会失败。
- **能捕获的真实回归**：只捕获“不再走 native fallback”这一种。
- **建议**：断言 `expect(deleteConversationRows).toHaveBeenCalledWith([expect.objectContaining({ ... })])`（或 `[row]` 的 DOM 身份，`data-test-id="conversation"`）；补一例 `mockResolvedValue({status:'failed'})` 断言 rejects 且行 `style.display` 被恢复为 `none`。
- **置信度**：高

### M3

- **严重度/类别**：中 / E（断言位于受 fixture 顺序保护的条件分支里）
- **位置**：`src/entrypoints/content/folders/new-chat.test.ts:52-75`（`Folder new chat association > shows the first request prompt as a placeholder and replaces it with the captured stream title`）
- **证据**：
```ts
for (const line of titleStream.split('\n')) {
  for (const metadata of decoder.push(`${line}\n`)) {
    emit({ token, phase: 'metadata', requestId: 'request-1', ...metadata })
    generatedTitleObserved ||= Boolean(metadata.title)
    await flush()
    if (!generatedTitleObserved) {
      expect(state.addMembership).toHaveBeenCalledExactlyOnceWith('folder-a', '88474e0fe3b9a20d')
      expect(state.completeNewChatTitle).toHaveBeenCalledExactlyOnceWith('88474e0fe3b9a20d', 'TME 护城河分析', '')
    }
  }
}
```
- **判定理由**：placeholder 相位的断言被 `if (!generatedTitleObserved)` 包住，只有 fixture 恰好“标题出现在后续 metadata”时才执行。如果解码器/流格式变化让第一条 metadata 就带 title，这些断言会被整体跳过，用例仍然通过——“先写 prompt 占位、再被生成标题替换”的关键顺序失去保护。
- **能捕获的真实回归**：仅在当前 fixture 顺序下有效；顺序变化即静默失效。
- **建议**：把 placeholder 断言移到“首个 metadata（started/会话 ID）之后、标题 metadata 之前”的确定性位置；或用 `completeNewChatTitle.mock.invocationCallOrder` 与 `addMembership` 断言“标题写入发生在占位写入之后”。
- **置信度**：高

### M4

- **严重度/类别**：中 / E（mock 掉关键依赖且从不断言，主要行为无覆盖）
- **位置**：`src/entrypoints/content/folders/new-chat.test.ts:24`（整个 `Folder new chat association` 文件；如 `:52`、`:77`、`:91` 等 10 例）
- **证据**：
```ts
vi.mock('@/utils/chatActions', () => ({ openNewChat: vi.fn(async () => undefined) }))
// 全文件没有任何 openNewChat 的 import / 断言
// new-chat.ts:105  await openNewChat({ reset: !isOrdinaryNewChat() && location.pathname.endsWith('/app') })
```
- **判定理由**：`open()` 的首要动作是调用 `openNewChat` 真正打开新会话；测试把它 mock 掉后从未断言。由于 beforeEach 里的 composer 已经“ready”，把 `new-chat.ts:105` 的调用删掉，10 条用例依然全绿。这是“mock 掉被测行为本身”的典型假覆盖。
- **能捕获的真实回归**：无。“点 New Chat 没有真正打开新会话、但关联逻辑照常执行”不会被发现。
- **建议**：`const { openNewChat } = await import('@/utils/chatActions')` 并 `expect(vi.mocked(openNewChat)).toHaveBeenCalledOnceWith({ reset: false })`（临时会话/ reset 场景再补一例）；顺手删除未使用的 `state.setFolderCollapsed` mock 字段。
- **置信度**：高

### M5

- **严重度/类别**：中 / C（耦合监听器注册数量）
- **位置**：`src/entrypoints/background/folders/startup.integration.test.ts:47`（`discovers and restores multiple accounts on background initialization without a content script or sync writes`）
- **证据**：
```ts
expect(browser.runtime.onMessage.addListener).toHaveBeenCalledTimes(2)
```
- **判定理由**：断言的是 `startFoldersBackground()` 内 `onMessage.addListener` 的调用次数（`index.ts:45-46` 恰好两个），而不是 handler 是否工作。未来新增任意一个无关的 runtime message listener（正常演进）都会让此用例失败；反之 handler 注册了但路由写错，此断言仍通过。
- **能捕获的真实回归**：只捕获“少注册/多注册一个 listener”，不验证消息处理。
- **建议**：删除该断言；改为通过已捕获的 listener 发一条 `folders:getSidebarState` 或 `folder-accounts:*` 消息并断言响应（该测试已有 repo 与 test-storage 基础设施）。
- **置信度**：高

### M6

- **严重度/类别**：中 / C（调用私有方法，重构即误报）
- **位置**：`src/entrypoints/content/folders/runtime.test.ts:342-348`（`FolderRuntime background boundary > refreshes only sync status for a syncStatus-only invalidation`）
- **证据**：
```ts
;(runtime as unknown as { handleBackgroundMessage: (message: unknown) => void }).handleBackgroundMessage({
  type: 'folders:data-changed', accountScopeId: 'account-scope-0001', affected: { syncStatus: true },
})
```
- **判定理由**：`handleBackgroundMessage` 是 private 实现细节；重命名/内联它会让测试失败而行为不变。同文件其它用例已通过 mock 捕获的 `state.messageListener`（如 `:52-54`、`:69-70`）走公开的 browser 消息入口，本用例没必要走私有通道。
- **能捕获的真实回归**：能捕获“syncStatus-only 失效触发全量刷新”，但走公开 listener 同样可捕获。
- **建议**：改为 `state.messageListener?.({...})`，避免私有 API 强转。
- **置信度**：高

### M7

- **严重度/类别**：中 / F+C（断言的是测试自己手写 mock 对字面量的搬运）
- **位置**：`src/entrypoints/content/overlay/folders/FolderPicker.test.tsx:155-157`（`FolderPicker membership selection > uses the required 20px corner radius`）
- **证据**：
```ts
it('uses the required 20px corner radius', () => {
  expect(shadowRoot.querySelector('[data-gpk-folder-picker]')?.getAttribute('data-border-radius')).toBe('20px')
})
// 该属性来自本文件 :51-69 自写的 Box mock：data-border-radius={props.borderRadius}
```
- **判定理由**：`AnchoredGeminiMenu.tsx:195` 里 `borderRadius="20px"` 是常量；测试用手写 Chakra mock 把 prop 映射成 `data-border-radius` 再断言字面量。真实 Chakra 渲染/样式被 mock 绕过：把该设计常量改到别处（仍 20px）会误报，真实视觉回归（borderRadius 未生效）反而测不到。
- **能捕获的真实回归**：只有“把常量从 20px 改成别的值”。
- **建议**：删除该用例；若 20px 是硬性设计规范，改为在真实 Chakra 渲染下断言计算样式（happy-dom 能力有限时用 story/manual 验证），不要通过自写 mock 的私有映射断言。
- **置信度**：高

### M8

- **严重度/类别**：中 / D（参数化重复同一分支）
- **位置**：`src/entrypoints/background/folders/command-service.test.ts:15`、`:25`、`:38`（`persists a folder pin and schedules sync for either identity source (%s)` 等 3 个 `it.each(['observed','manual-confirmed'])`，共 6 例）
- **证据**：
```ts
it.each(['observed', 'manual-confirmed'] as const)('persists a folder pin and schedules sync for either identity source (%s)', async (identitySource) => {
  ...
  await service.execute({ ..., identitySource, method: 'setMembershipPinned', ... })
```
- **判定理由**：`FolderCommandService` 完全不读取 `request.identitySource`（`grep -n identitySource command-service.ts` 无结果），两条参数化路径执行同一段代码，仅 envelope 字段不同。用例数翻倍但没有增加分支覆盖；identitySource 的真正契约（envelope schema / rpc-handler）另有测试位。
- **能捕获的真实回归**：两个参数捕获完全相同；删掉一参数不减少覆盖。
- **建议**：去掉 `.each`，每个行为保留 1 例；若想覆盖 identitySource，在 `folderRpcEnvelopeSchema` 或 `rpc-handler.test.ts` 中做一次参数化。
- **置信度**：高

### L1

- **严重度/类别**：低 / A（空数组上恒真的断言）
- **位置**：`src/entrypoints/background/folders/account-history.test.ts:42`（`Folder account history > removes only the history entry and clears the recent pointer without picking another account`）
- **证据**：
```ts
expect(storage.set.mock.calls.every(([values]) => Object.keys(values).join() === FOLDER_ACCOUNT_HISTORY_KEY)).toBe(true)
```
- **判定理由**：这是该用例里唯一与“持久化”相关的断言；但 `.every` 在 `set` 从未被调用时返回 `true`（真空真）。若回归导致 forget 只更新内存、不写 storage，用例仍通过（返回值由 `apply()` 计算，不依赖持久化）。
- **能捕获的真实回归**：无法捕获“forget 不持久化”。
- **建议**：`expect(storage.set).toHaveBeenCalledOnce()` + 断言写入内容 `{ accounts: [{email:'first@...',...}], recentAccountScopeId: undefined }`（或用新 store 重新读取，如第一个用例的写法）。
- **置信度**：高

### L2

- **严重度/类别**：低 / A（弱断言，未把 handler 响应与已持久化 ID 绑定）
- **位置**：`src/entrypoints/background/folderDeviceId.test.ts:39-45`（`FolderDeviceIdProvider > single-flights concurrent requests and exposes the same persisted ID through the background message handler`）
- **证据**：
```ts
const [first, second] = await Promise.all([state.listener?.({...}), state.listener?.({...})])
expect(first).toEqual(second)
expect(first).toMatchObject({ deviceId: expect.any(String) })
```
- **判定理由**：用例名声称“exposes the same **persisted** ID”，但从未把响应与 `ids[0]` / storage 中的值比较。若 handler 返回任意稳定字符串（例如重新 mint 的常量），两条都相等且都是 string，测试通过。
- **能捕获的真实回归**：能捕获“两次消息返回不同 ID”，不能捕获“返回的不是已持久化的安装 ID”。
- **建议**：`expect(first).toEqual({ deviceId: ids[0] })` 并断言 `state.values.get(FOLDER_DEVICE_ID_STORAGE_KEY) === ids[0]`。
- **置信度**：高

### L3

- **严重度/类别**：低 / C+D（访问私有字段，且与后续断言重复）
- **位置**：`src/entrypoints/background/folders/post-commit.integration.test.ts:44`（`returns durable mutations while SYNC and automatic Recovery are both waiting`）
- **证据**：
```ts
await vi.waitFor(() => expect((recovery as unknown as { running: boolean }).running).toBe(false))
await vi.waitFor(() => expect(coordinator.sync).toHaveBeenCalledTimes(2))
expect(await db.folder_snapshots.count()).toBe(1)
```
- **判定理由**：`running` 是 `FolderRecoveryRunner` 的 private 字段；紧接着的“sync 第二次被唤醒 + 快照落库”已经证明 recovery 完成。该强转断言重复且会在重命名私有字段时误报。
- **能捕获的真实回归**：无（后两条断言已覆盖）。
- **建议**：删除该行。
- **置信度**：高

### L4

- **严重度/类别**：低 / C（日志字符串与诊断字段字面量耦合）
- **位置**：`src/entrypoints/content/folders/native-chat-delete.test.ts:86-111`（`deleteGeminiChat > logs native-list diagnostics when an unsent RPC fallback cannot find the chat`；同类：`:80-81` 精确错误文案）
- **证据**：
```ts
expect(errorSpy).toHaveBeenCalledWith(
  '[Folders][delete-chat] Native fallback could not uniquely identify the Gemini chat row',
  expect.objectContaining({ chatId: 'c_c09e5b4c22792c37', renderedConversationLinkCount: 0, ... }),
)
```
- **判定理由**：拒绝行为已由 `rejects.toThrow(...)` 断言；日志文案/字段是诊断实现，重写文案（行为不变）会误报，而真正该保证的“唯一匹配失败时不删除”已覆盖。行 `:80-81` 的 `(timeout)` 文案同理（可接受保留，但属消息耦合）。
- **能捕获的真实回归**：诊断信息丢失（可观测性回归），非用户行为。
- **建议**：删除日志断言（保留 rejection）；若需保留诊断契约，改为断言 `console.error` 被调用一次 + 第二参数包含关键计数字段，不绑定完整文案。
- **置信度**：高

### L5

- **严重度/类别**：低 / E（用例名超出实际覆盖）
- **位置**：`src/entrypoints/content/folders/new-chat.test.ts:137-146`（`Folder new chat association > closing the label before or after submission prevents late response writes`）
- **证据**：
```ts
await controller.open('folder-a')
const token = controller.getSnapshot()!.token
emit({ token, phase: 'started', requestId: 'request-1' })
controller.cancel()                     // 只测了 “提交前关闭”
emit({ token, phase: 'metadata', requestId: 'request-1', conversationId: 'c_abc' })
```
- **判定理由**：名称声称覆盖“before **or after** submission”，实际只覆盖在 `started` 之前 cancel；“占位写入已提交后再 cancel”的分支（`intent.phase` 为 saving/armed 等）没有用例。
- **能捕获的真实回归**：仅“提交前 cancel”的迟到写入。
- **建议**：改名去除 “or after”，或补一例：先 `emit started → metadata(conversationId)` 产生占位写入，再 `cancel()`，断言后续 title metadata 不追加写入。
- **置信度**：高

### L6

- **严重度/类别**：低 / D（参数化重复同一分支）
- **位置**：`src/entrypoints/content/folders/recents-visibility.test.ts:38-56`（`FolderRecentsVisibilityController > only hides organized, non-current, non-pinned rows and restores them on stop (%s)`）
- **证据**：
```ts
it.each(['observed', 'manual-confirmed'])('only hides organized, non-current, non-pinned rows and restores them on stop (%s)', (source) => {
  ...
  identity: { status: 'available', identity: { source, accountScopeId: 'account-scope-0001' } },
```
- **判定理由**：`recents-visibility.ts` 的 `reconcile()` 只读 `identity.status` / `projection`，不读 `source`；两参数执行完全相同的分支。
- **能捕获的真实回归**：无差异。
- **建议**：去掉 `.each`，保留 1 例。
- **置信度**：高

### L7

- **严重度/类别**：低 / C（断对象引用而非值）
- **位置**：`src/entrypoints/content/folders/runtime.test.ts:110`（`clears the previous account while loading a saved account and waits for its configuration`）、`:197`（`retains the list on a failed pin and ignores late failures after stop`）、`:404-405`（`Folder chat rename > persists first, updates the shared title without reloading pages, then renames Gemini`）
- **证据**：
```ts
expect(runtime.getSnapshot().projection).toBe(projection)
...
expect(runtime.getSnapshot().projection?.memberships).toBe(projection.memberships)
expect(runtime.getSnapshot().projection?.chatCursors).toBe(projection.chatCursors)
```
- **判定理由**：`toBe` 断言投影/数组的对象身份；若实现改为行为等价地重建投影（浅拷贝、`toEqual` 相等），测试误报。`chatCursors` 的保留语义用 `toEqual` 同样能表达。
- **能捕获的真实回归**：内容相等但身份不同（非回归）会误报。
- **建议**：改为 `toEqual`；若确实想固化“复用同一引用”的性能优化，请在用例名/注释中写明理由。
- **置信度**：高

### L8

- **严重度/类别**：低 / B（断言协作者调用次数，未验证结果状态）
- **位置**：`src/entrypoints/content/folders/runtime.test.ts:177-188`（`FolderRuntime background boundary > closes the menu and refreshes the folder after the pin is committed`）
- **证据**：
```ts
expect(runtime.getSnapshot().menu).toBeUndefined()
await pending
expect(state.request).toHaveBeenCalledWith(..., 'setMembershipPinned', ...)
expect(state.getProjection).toHaveBeenCalledTimes(2)
```
- **判定理由**：“刷新”只以 `getProjection` 调用次数表达；如果刷新返回的新投影未被采用/被旧投影覆盖，测试仍通过。相对于同一文件其它用例（如 `:255-279` 断言投影内容保留），这里只数调用。
- **能捕获的真实回归**：不刷新（少一次调用）会被发现；刷新结果丢失不会被发现。
- **建议**：把 `getProjection` mock 设为返回带 `pinnedOrderKey` 的投影，断言 `getSnapshot().projection.memberships[0].pinnedOrderKey` 已更新；调用次数可作为附加断言。
- **置信度**：高

### L9

- **严重度/类别**：低 / E（用例名声称顺序，断言未验证顺序）
- **位置**：`src/entrypoints/background/responseCompleteNotification/index.test.ts:1166-1180`（`responseCompleteNotification background V2 > plays custom audio only after a notification is created`）
- **证据**：
```ts
expect(createNotificationMock).toHaveBeenCalled()
expect(offscreenCreateDocumentMock).toHaveBeenCalledTimes(1)
expect(runtimeSendMessageMock).toHaveBeenCalledWith({ type: 'response-complete-notification-audio:play', target: 'offscreen' })
```
- **判定理由**：只有“都发生”的断言，没有顺序断言；`createResponseCompleteNotification` 之后才 `playResponseCompleteNotificationAudio` 的顺序被调换（先播声音后创建通知）也能通过。失败路径另有用例覆盖，但成功路径的顺序契约无保护。
- **能捕获的真实回归**：成功路径下“先播音后创建”的顺序回归。
- **建议**：断言 `createNotificationMock.mock.invocationCallOrder[0] < offscreenCreateDocumentMock.mock.invocationCallOrder[0]`。
- **置信度**：高

### L10

- **严重度/类别**：低 / D（同一行为的近重复用例）
- **位置**：`src/entrypoints/background/folders/rpc-handler.test.ts:118-127` 与 `:129-137`（`broadcasts a title write to other Folder views` / `broadcasts committed pin changes to other Folder views`）
- **证据**：
```ts
await expect(handler(request('updateChatTitle', {...}), sender)).resolves.toMatchObject({ ok: true })
expect(state.execute).toHaveBeenCalledTimes(1)
expect(state.invalidation).toHaveBeenCalledWith({ ... affected: {} }, { excludeTabId: 1 })
// 下一个用例除 method 换成 setMembershipPinned 外完全一致
```
- **判定理由**：两个方法都走同一段 invalidation 分支，断言完全相同；可合并为 `it.each([[method, params], ...])`，减少维护面。
- **能捕获的真实回归**：两者等价，合并不损失覆盖。
- **建议**：合并为一个参数化用例（保留两种 mutation 代表）。
- **置信度**：高

### L11

- **严重度/类别**：低 / C（通过 browser API 调用形态识别“扫描”）
- **位置**：`src/entrypoints/background/folders/startup.integration.test.ts:77-88`（`coalesces overlapping lifecycle scans and releases the scan after completion`）
- **证据**：
```ts
expect(get.mock.calls.filter(([keys]) => keys === null)).toHaveLength(1)
...
await vi.waitFor(() => expect(get.mock.calls.filter(([keys]) => keys === null)).toHaveLength(2))
```
- **判定理由**：用“`storage.sync.get(null)` 的调用次数”观察扫描合并；若实现无行为变化地改成 `storage.sync.get()`（无参）或使用 key 数组，过滤计数变 0，用例误报。核心契约（并发 startup 只触发一次扫描）本身有效。
- **能捕获的真实回归**：扫描去重回归（当前写法下）。
- **建议**：改为统计可观测的扫描开始次数（如包装 `createFolderSyncResume` 的 scheduler.requestRun 或 spy provider 读取），不要依赖 `get` 的参数形态。
- **置信度**：中

### L12

- **严重度/类别**：低 / A（断言测试装置自身前提，不测函数）
- **位置**：`src/entrypoints/content/overlay/folders/pointer-boundary.test.ts:24`（`isEventInsideElement > keeps a Shadow DOM picker open when document sees the retargeted host`）
- **证据**：
```ts
const event = eventWithPath(host, [folderButton, picker, shadowRoot, host, document, window])
expect(picker.contains(event.target as Node)).toBe(false)   // 断言 fixture 前提
expect(isEventInsideElement(event, picker)).toBe(true)
```
- **判定理由**：第一行断言的是手工构造的 fixture 前提（Shadow DOM 重定向），不是被测函数；删除后唯一行为断言仍然完整。它可作为“为什么需要 composedPath”的文档，但不是回归保护。
- **能捕获的真实回归**：无。
- **建议**：删除该断言（保留 fixture 与注释），或把它改为用例注释说明 retargeting 前提。
- **置信度**：高

---

## 3. 文件覆盖表

| 文件 | 用例数 | 状态 | 备注（全部通读） |
| --- | --- | --- | --- |
| `src/entrypoints/background/folderDeviceId.test.ts` | 2 | 发现 1（低 L2） | 单飞+持久化路径整体有效；handler 响应未绑定持久化 ID |
| `src/entrypoints/background/folders/account-history.test.ts` | 6 | 发现 1（低 L1） | 序列化/损坏恢复/失败继续等用例扎实；`.every` 真空真 |
| `src/entrypoints/background/folders/command-service.test.ts` | 9 | 发现 2（中 M1、M8） | after-commit 用例（含 SYNC 失败唤醒 Recovery）有效；schema 用例错位 |
| `src/entrypoints/background/folders/post-commit.integration.test.ts` | 1 | 发现 1（低 L3） | 真实 fake-indexeddb 集成，核心“两路阻塞时仍持久返回”有效 |
| `src/entrypoints/background/folders/rpc-handler.test.ts` | 10 | 发现 1（低 L10） | 错误映射/invalidation/读写分流均有效；两个广播用例可合并 |
| `src/entrypoints/background/folders/startup.integration.test.ts` | 4 | 发现 2（中 M5、低 L11） | 多账号恢复、chunk-only、扫描失败的集成断言有效 |
| `src/entrypoints/background/responseCompleteNotification/audio.test.ts` | 6 | 干净 | offscreen 单飞/permission/Firefox 分支均有效 |
| `src/entrypoints/background/responseCompleteNotification/deepResearchState.test.ts` | 7 | 干净 | 会话状态机、过期、损坏字段迁移均有效 |
| `src/entrypoints/background/responseCompleteNotification/geminiResponseRequest.test.ts` | 5 | 干净 | 纯函数分类，查询顺序/非法 URL 覆盖到位 |
| `src/entrypoints/background/responseCompleteNotification/index.test.ts` | 43 | 发现 2（高 H2、低 L9） | 权限/深研/通知路由整体扎实；fake timer 顺序与“only after”顺序两处缺陷 |
| `src/entrypoints/content/folders/chat-title-cache.test.ts` | 2 | 发现 1（高 H1） | 整个文件测无引用空壳类，建议删除 |
| `src/entrypoints/content/folders/client.test.ts` | 6 | 干净 | 分页/STALE 重试/诊断隐私断言有效（limit 常量属协议，可接受） |
| `src/entrypoints/content/folders/conversation-metadata.test.ts` | 2 | 干净 | chatId/标题回退有效 |
| `src/entrypoints/content/folders/native-chat-delete.test.ts` | 4 | 发现 2（中 M2、低 L4） | “未发送才 fallback/未知结果不重试”有效；fallback 结果与日志断言偏弱 |
| `src/entrypoints/content/folders/native-menu.test.ts` | 4 | 干净 | 唯一行注入/克隆结构/歧义不注入/菜单关闭均有效（克隆断言见 §5） |
| `src/entrypoints/content/folders/new-chat.dom.test.ts` | 4 | 干净 | 当前+历史 fieldset 契约、歧义/临时会话判断有效；历史选择器属保留兼容路径（低价值但有效） |
| `src/entrypoints/content/folders/new-chat.test.ts` | 10 | 发现 3（中 M3、M4，低 L5） | 关联流程覆盖广，但核心 `openNewChat` 无断言、条件断言与名称超范围 |
| `src/entrypoints/content/folders/recents-visibility.test.ts` | 3 | 发现 1（低 L6） | 仅隐藏“已组织/非当前/未置顶”与失败恢复；source 参数化冗余 |
| `src/entrypoints/content/folders/runtime.test.ts` | 25 | 发现 3（中 M6，低 L7、L8） | 并发/竞态/账号切换/删除保护等强力用例多；私有调用与 toBe 身份断言需清理 |
| `src/entrypoints/content/overlay/folders/AnchoredGeminiMenu.test.ts` | 4 | 干净 | 定位/flip/clamp 纯函数断言有效 |
| `src/entrypoints/content/overlay/folders/ChatRenameDialog.test.tsx` | 4 | 干净 | Shadow DOM、空保存、失败重试、重复提交均有效 |
| `src/entrypoints/content/overlay/folders/FolderActionMenu.test.tsx` | 3 | 干净 | 菜单顺序/分隔符/置顶切换有效 |
| `src/entrypoints/content/overlay/folders/FolderDialogs.test.tsx` | 2 | 干净 | 远程 changed/deleted 时保留草稿与原始 revision 有效 |
| `src/entrypoints/content/overlay/folders/FolderPicker.test.tsx` | 4 | 发现 1（中 M7） | 指针不关闭/toast/失败保留/新建入口有效；圆角字面量断言无效 |
| `src/entrypoints/content/overlay/folders/pointer-boundary.test.ts` | 2 | 发现 1（低 L12） | composedPath 判定有效；fixture 前提断言无回归价值 |

合计：25 文件 / 172 用例；2 高 + 8 中 + 12 低。

---

## 4. 潜在跨文件重复清单（供 Lead 统一合并）

1. **`index.test.ts` ↔ `audio.test.ts`**：通知音频权限、offscreen 单飞、播放消息都在两层各测一遍。建议 `audio.test.ts` 保留单元协议；`index.test.ts` 只保留“通知创建成功才触发播放”的集成断言（并补 H2/L9 的顺序断言），删除重复的 offscreen/permission 细节。
2. **`index.test.ts` ↔ `deepResearchState.test.ts`**：consume-once（“ignores untracked and duplicate report” vs “consumes only the exact report task once”）、过期清理、tab 关闭清理在两层重复。建议状态语义集中在 `deepResearchState.test.ts`，`index.test.ts` 只保留“webRequest 事件→状态机→通知”的端到端代表用例。
3. **`runtime.test.ts` ↔ `client.test.ts`**：`chatCursors` 保留、pin 字段保留、折叠后仍保留已加载行，在两个层级各有断言（client 负责投影构造，runtime 负责合并策略）。建议 client 只测分页构造，runtime 用 client mock 测保留/合并，避免同一不变量两处维护。
4. **`command-service.test.ts` ↔ `post-commit.integration.test.ts`**：after-commit 的 scheduler/recovery 唤醒在 unit（mock 调用）与 integration（真实 IndexedDB）各测一次。可保留 integration 为主、unit 只保留“SYNC 抛错仍唤醒 Recovery”这类 integration 难以构造的分支。
5. **`rpc-handler.test.ts` ↔ `startup.integration.test.ts`**：handler 注册/消息入口只在后者用“listener 数量”间接验证（见 M5），前者测真实路由。建议把 M5 改成 rpc-handler 的启动注册用例，删除数量断言。
6. **`native-menu.test.ts` ↔ `native-chat-delete.test.ts`**：都构造型如 SideNav/`data-test-id="conversation"`/`/app/chat-x` 的 DOM fixture 并依赖 `geminiDomSelectors.sideNav.*`。建议抽公共 fixture（放在测试 helper 或 `src/services/gemini-dom/__fixtures__`），避免两套选择器契约漂移。
7. **`FolderPicker.test.tsx` ↔ `pointer-boundary.test.ts` / `AnchoredGeminiMenu.tsx`**：picker 外部点击关闭在组件级（FolderPicker 断言 `closePicker` 未调用）与单测级（composedPath）重复。保留 pointer-boundary 单测（纯逻辑），FolderPicker 只保留“Shadow DOM 内 pointerdown 不关闭”的一个集成代表。
8. **`ChatRenameDialog.test.tsx` ↔ `runtime.test.ts`**：Gemini 重命名失败文案（`could not be renamed` / `could not be confirmed`）在 UI 与 runtime 各断言一次；建议 runtime 断言错误类型/状态，UI 断言可展示文案，避免同一个字符串两处维护。
9. **`folderDeviceId.test.ts` ↔ `account-history.test.ts`**：两个 background 持久化 store 的并发/单飞/写入序列化模式重复（不同数据）。可抽公共 storage fake 与“单飞/串行”测试模板，但优先级低。
10. **overlay 四个 tsx 测试**：`ChakraProvider`/`createRoot`/`act`/Shadow DOM harness 在 `ChatRenameDialog/FolderDialogs/FolderPicker` 中重复（各 ~20 行）。建议抽 `renderInShadow()` 测试 helper（Lead 侧跨 slice 检查是否已有同类 helper）。
11. **`command-service.test.ts` schema 断言 ↔ 未来 `rpc-handler` 边界用例**：见 M1，合并后避免 schema 只在一个不相关的文件里被覆盖。

---

## 5. 看起来可疑但判定有效（防误报）

1. **`index.test.ts` 中大量整对象通知断言**（`createNotificationMock).toHaveBeenCalledWith('response-complete:7:123', { type:'basic', iconUrl:'extension:///icon/gemini-sparkle-aurora.png', ..., silent:true })`）：包含 icon 资源路径、`silent`、notification id 格式等字面量，看似实现耦合；但这些正是用户可见的通知契约（Firefox 不带 silent、图片模板失败降级 basic、id 用于点击路由），删掉会漏掉真实通知回归，保留合理。
2. **`native-menu.test.ts:92-104` 克隆菜单项断言**（`entry.className === 'mat-mdc-menu-item'`、图标 `fonticonname="folder"`、`'.gem-menu-item-label'` 文案）：看起来是 CSS 类名/DOM 细节；但生产实现刻意 `cloneNode` Gemini 原生项以复用其运行时样式（`native-menu.ts:113-131`），这些断言恰好能捕获“改成手工 createElement 导致样式/图标丢失”的真实回归，判定有效。
3. **`client.test.ts` 的 `limit: 100` / `limit: 10` / `folderLimit: 5` 与 `deepResearchState.test.ts` 的 `30 * 60 * 1000` TTL**：数字看似复制生产常量；但它们定义分页批量、预览数量与任务过期语义，改动即真实行为/性能契约变化（且 client 用例同时断言了遍历所有页与超过 5 个 Folder 预览的结果），判定有效。
