# 测试套件有效性审计（2026-10-18）

> 目标：找出测试套件中「为了测试而测试」的无效检查与无效测试——删掉后不会漏掉任何真实回归的断言/用例，或只锁死实现细节、与其它用例重复、名为覆盖实为假覆盖的测试。
>
> 范围：`src/` 与 `scripts/` 下全部 **120 个测试文件 / 946 个运行用例 / 20 488 行测试代码**（审计时工作区为 dirty tree，内容以当前文件为准）。
>
> 方式：6 个切片并行逐文件通读（120/120），每个切片对照生产实现确认断言语义；Lead 侧另做静态分析（断言密度、纯 mock 断言、重复标题/断言序列/helper）并逐条复核全部 13 条高优先级发现；中低优先级为审计员结论 + Lead 抽查。
>
> 基线：审计前全量运行 `pnpm test:run` 两次，946 用例全绿（24.1s / 23.6s）；耗时结构见文末。

## 0. 结论摘要

| 指标 | 数量 |
| --- | --- |
| 发现总数 | **110** |
| 高（建议删除/重写） | **13** |
| 中（建议合并/加强） | **40** |
| 低（可选清理） | **57** |
| 涉及文件 | **73 / 120**（47 个文件无发现） |
| 0 断言测试块 | 0（946 用例无一空转） |
| 疑似「全部为 mock 调用断言」的用例块 | 76（多数是有效协议断言，见 §9） |
| 纯负向 mock 断言 | 17（其中 3 个文件只有负向用例） |

**最值得优先处理的 8 件事：**

1. `stuffMediaParser.test.ts` 在模块顶层 `readFileSync` 读取被 `.gitignore` 忽略的 `.original/library/request.md`——干净 clone/CI 上整文件加载失败，当前全绿是「本机假绿」。
2. `chat-title-cache.test.ts` 整个文件在测一个空 `start/stop`、生产零引用的死壳类（2 个用例），删除即可（建议连死代码一起删）。
3. `responseCompleteNotification/index.test.ts:1040` 的 fake timers 在通知创建**之后**才安装，"不自动清除"用例结构上无法失败。
4. `common/storage.test.ts` 只断言常量字面量 + mock `defineItem` 参数，而模块的 10 个 getter/setter（5 对）、`getAllSettings` 全部零覆盖。
5. `responseCompleteNotificationContent.test.ts:162` 用例名 "one listener" 却从不统计监听器数量，删掉生产 `hasStarted` 幂等守卫仍通过。
6. `folders/index.test.tsx:314` 用 `key` 换实例模拟"账号切换竞态"，旧实例已卸载，竞态守卫删掉测试仍通过。
7. `folderRepository.test.ts:451` 用例名声称 "preserves unchanged appearance"，但 `renamed` 变量声明后从未断言。
8. CSS/源码文本快照反模式（`styleController.test.ts` 两处、`top-bar-customization`、`deleteQueue` selector 常量等）：断言的是源码字符串而不是样式/行为，行为失效测不到，等价重构必误报。

**总体判断：** 套件整体质量不差（scheduler/coordinator、主题过渡、library、通知核心路径等大量用例断言扎实），问题高度集中在五类——**假覆盖（名实不符）**、**死代码测试**、**源码文本快照**、**同源 oracle / mock 自测**、**跨文件重复覆盖**。这些问题主要损害可维护性与回归检测力，对运行时长影响很小（约 24s 中 23.4s 由一个性能测试文件占据）。

---

## 1. 审计口径

### 1.1 判定原则

对每条断言问一个反事实问题：**删掉它（或把对应生产逻辑改坏）之后，有什么真实用户/协议回归会漏掉？**

- 能明确说出一个合理回归 → 不判无效（最多"低价值但有效"，见 §9）。
- 说不出、或只能说出"改文案/改结构就失败" → 判为无效/弱效。
- 特别注意反例：调度去重、写入预算、RPC 路由、状态机、拦截器转发等场景里，"调用次数/参数"本身就是被测协议，不能按 mock 编排批量误杀。

### 1.2 类别

| 类别 | 含义 |
| --- | --- |
| A | 恒真/空断言：断言必然成立，或用测试内复制的生产算法/常量算期望（同源 oracle） |
| B | Mock 编排：只断言内部协作者被调用，不验证行为结果 |
| C | 实现细节耦合：私有状态、CSS 类名/DOM 顺序、内部常量/日志/错误文案 |
| D | 重复/冗余：同一行为在多文件/多用例/参数化分支重复 |
| E | 假覆盖/测试缺陷：名实不符、断言在可能不执行的分支、未 await、真实计时器空转、依赖本机环境 |
| F | 覆盖填充/死代码：为无调用方导出、debug 全局、纯常量/类型写测试 |

### 1.3 严重度

- **高**：明确建议删除或重写；当前形态不能保护其声称的行为（假绿/假覆盖）。
- **中**：建议合并、加强或迁移位置；有覆盖价值但形式不可靠/重复。
- **低**：可选清理；维护成本高于回归价值。

---

## 2. 总体画像（静态分析）

| 指标 | 数值 |
| --- | --- |
| 测试文件 / 声明块 / 运行用例 | 120 / 869 / 946 |
| `expect(...)` 总数 | 2 876 |
| 每块平均断言数 | 3.3 |
| 零断言块（含 helper 断言） | **0** |
| 全部断言均为 mock 调用断言 | 76 块 |
| 全部断言均为负向 mock 断言 | 17 块 |
| 全部断言仅为 `toBeDefined/Truthy` | 0 块 |
| `toMatchSnapshot` / `toMatchInlineSnapshot` | 0 |
| 测试内重复 helper（同名同体跨文件） | 1 组（`makeVisible` × 3 文件） |
| 跨文件完全同名用例 | 2 组（均经核查为不同被测面，非重复） |
| `vi.mock(...)` / `vi.fn()` | 154 / 577 |
| 依赖真实计时器 `setTimeout` 的等待 | 33 处（重点见 scheduler/runtime/notification） |

切片分布：

| 切片 | 文件 | 声明用例 | 高 | 中 | 低 | 干净文件 |
| --- | --- | --- | --- | --- | --- | --- |
| S1 数据层与同步 | 16 | ~213 | 3 | 10 | 11 | 2 |
| S2 后台与 Folders 前端 | 25 | ~172 | 2 | 8 | 12 | 11 |
| S3 内容脚本功能 A | 18 | ~130 | 3 | 4 | 12 | 6 |
| S4 主题与主世界 | 17 | ~123 | 1 | 7 | 4 | 8 |
| S5 UI 组件与服务设置 | 21 | ~138 | 3 | 6 | 10 | 7 |
| S6 工具/快捷方式/集成 | 23 | ~168 | 1 | 5 | 8 | 13 |
| **合计** | **120** | **946** | **13** | **40** | **57** | **47** |

---

## 3. 高优先级发现（13 条，Lead 已逐条复核证据）

### H1. `chat-title-cache.test.ts` 在测一个零引用的空壳类（死代码测试）
- **位置**：`src/entrypoints/content/folders/chat-title-cache.test.ts:50-68`（2 个用例）
- **证据**：
  ```ts
  // 生产 chat-title-cache.ts:6-9 —— start/stop 为空，且仅被自身测试 import
  export class FolderChatTitleCacheController {
    start(): void {}
    stop(): void {}
  }
  ```
  测试还 mock 了 `./runtime` 的 `updateChatTitle`，但生产的空壳类根本不 import 它。
- **漏掉的回归**：无。删掉文件不会漏任何用户可见行为。
- **建议**：删除整个测试文件；同时评估删除 `chat-title-cache.ts` 死代码（若保留兼容壳，用注释说明即可，不需要 69 行测试）。
- **复核**：✅ 已确认 `grep` 生产零引用、方法为空。

### H2. 测试依赖被 gitignore 的本机抓包文件（干净环境整文件加载失败）
- **位置**：`src/utils/stuffMediaParser.test.ts:37-41`（模块顶层）；`.gitignore:31` 忽略 `.original`
- **证据**：
  ```ts
  const LIBRARY_REQUEST_PATH = path.resolve(__dirname, '../../.original/library/request.md');
  const libraryRequestMarkdown = fs.readFileSync(LIBRARY_REQUEST_PATH, 'utf-8');
  ```
- **漏掉的回归**：无；反向危害是干净 clone/CI 上 import 阶段直接抛错，导致整个文件（24 个用例）不可运行；当前"946 全绿"依赖本机存在未跟踪文件。
- **建议**：把该抓包提交到已跟踪的 `test/samples/`（同目录已有 `media-response.txt`），或改为 `fs.existsSync` + `it.skipIf`，避免顶层抛错。
- **复核**：✅ 已确认文件存在于本机、`git ls-files .original` 为空。

### H3. "不自动清除回复完成通知"用例的 fake timers 安装顺序错误
- **位置**：`src/entrypoints/background/responseCompleteNotification/index.test.ts:1040-1051`
- **证据**：
  ```ts
  completeStream()                    // 通知在此创建，此时仍是真实计时器
  await flushPromises()
  clearNotificationMock.mockClear()
  vi.useFakeTimers()                  // 之后才切 fake timers
  await vi.advanceTimersByTimeAsync(5_000)
  expect(clearNotificationMock).not.toHaveBeenCalled()
  ```
- **漏掉的回归**：若回归为"回复完成通知也被排入自动清除"，`setTimeout` 会用真实计时器注册，推进 fake 时钟永远不会触发它，断言必然通过。
- **建议**：先 `vi.useFakeTimers()`，再启用/创建通知，用 `advanceTimersByTimeAsync(0)` 冲刷微任务后推进 5 000ms；或直接 mock `scheduleNotificationClear` 断言未调用。
- **复核**：✅ 已确认 timer 安装顺序。

### H4. `storage.test.ts` 只验证常量字面量与 mock 配置，模块其余导出零覆盖
- **位置**：`src/common/storage.test.ts:17-23`
- **证据**：
  ```ts
  expect(DEFAULT_THEME_BLOOM_ENABLED).toBe(true)
  expect(defineItem).toHaveBeenCalledWith('sync:enableThemeBloom', { fallback: true })
  ```
- **漏掉的回归**：`storage.ts` 共 5 个 `defineItem`、10 个 getter/setter（如 `getThemeBloomEnabled`、`setChatOutlineEnabled`）与 `getAllSettings` 汇总逻辑；getter 忘记委托、`getAllSettings` 漏项都测不到。第一条断言只是"常量等于自己返回的字面量"。
- **建议**：保留键名/fallback 契约（参数化覆盖 5 个 item），补 `getX()` 返回 `item.getValue()`、`setX` 转发、`getAllSettings` 汇总断言；删除常量字面量断言。
- **复核**：✅ 已读生产实现核对导出清单。

### H5. "只注册一个监听器"用例从不统计监听器数量
- **位置**：`src/services/responseCompleteNotificationContent.test.ts:162-167`
- **证据**：
  ```ts
  startResponseCompleteNotificationContentProvider()
  startResponseCompleteNotificationContentProvider()
  expect(runtimeMessageListener).not.toBeNull()
  ```
  生产 `responseCompleteNotificationContent.ts:48-55` 正是靠 `hasStarted` 守卫保证幂等，但测试没有断言 `addListener` 次数；删掉守卫后 mock 的回调只是被覆盖，断言仍通过。
- **漏掉的回归**：后台消息重复注册导致 Deep Research 状态消息重复返回。
- **建议**：把 `browser.runtime.onMessage.addListener` 提为 hoisted mock，断言 `toHaveBeenCalledTimes(1)`；再补一条"非目标消息返回 undefined、目标消息返回 Promise"的分派断言。
- **复核**：✅ 已读生产守卫与测试。

### H6. "账号切换后丢弃测量结果"用例用 keyed remount，竞态守卫删掉也通过
- **位置**：`src/components/setting-panel/views/folders/index.test.tsx:314-323`
- **证据**：
  ```ts
  await act(async () => root.render(<FolderStorageDebug key="old" accountScopeId="account-scope-0001" />))
  runtime.snapshot.identity.identity.accountScopeId = 'account-scope-0002'
  await act(async () => root.render(<FolderStorageDebug key="new" accountScopeId="account-scope-0002" />))
  await act(async () => resolve({ snapshotCount: 99, snapshotBytes: 9999, ... }))
  expect(host.textContent).not.toContain('9,999 B')
  ```
- **漏掉的回归**：`key` 变化会让旧实例真正卸载，React 会忽略已卸载组件的 `setState`；即使删掉 `FolderStorageDebug` 的 `active/pending` 守卫，旧请求 resolve 也不会影响 DOM。真正的竞态（同实例 prop 变化后旧请求返回）没有被测。
- **建议**：改为同一实例上切换 `accountScopeId` prop（不换 key），旧请求保持 pending，再 resolve，断言新账号视图不显示旧数据且 loading 能结束。
- **复核**：✅ 已读测试与 `FolderStorageDebug.tsx` 的守卫实现。

### H7. "保留未改动外观"用例声明了 `renamed` 却从未断言
- **位置**：`src/data/repositories/folderRepository.test.ts:451-468`
- **证据**：
  ```ts
  const renamed = await repository.updateFolder(scopeA, created.id, { name: 'Renamed only' }).then((result) => result.data)
  // renamed 之后没有任何 expect
  await expect(repository.updateFolder(scopeA, created.id, { colorValue: 'url(https://example.com)' }))
    .rejects.toThrow('color is invalid')
  ```
- **漏掉的回归**：只改 name 时把 `iconKey`/`colorValue` 覆盖为默认值/undefined 的部分更新 bug。
- **建议**：补 `expect(renamed).toMatchObject({ name: 'Renamed only', iconKey: 'education', colorValue: '#a1b2c3' })`。
- **复核**：✅ 已读片段。

### H8. 恢复失败回退场景三处重复（且使用 `rejects.toBeDefined()` 弱断言）
- **位置**：`src/data/repositories/folderRepository.test.ts:158-168`、`:499-509`、`:529-552`（it.each 的 quota 行）
- **证据**：三处都构造"snapshot put 失败 + recovery status put 失败"，断言同一可观测结果：
  ```ts
  await expect(repo.createSnapshot(scopeA, 'automatic')).rejects.toBeDefined()
  expect(await getLocalStorageStatus(scopeA)).toMatchObject({ warning: 'quota-exceeded', automaticSnapshotFailed: true })
  ```
- **漏掉的回归**：无新增；三者命中同一段回退代码，`:499` 与 it.each quota 行在断言层面不可区分。
- **建议**：删除 `:158-168` 与 `:499-509`，保留并扩充 `it.each`（budget/quota/unknown/snapshot-too-large 四类）；`rejects.toBeDefined()` 改为 `rejects.toMatchObject({ code: ... })`。
- **复核**：✅ 已读三处代码。

### H9. `setTimeout(20)` + "未调用"断言：慢机上假通过、快机上假阴性
- **位置**：`src/services/folder-sync/scheduler.test.ts:181-188`
- **证据**：
  ```ts
  scheduler.requestStorageChanges({ [`folders:${scope}:manifest`]: { newValue: ownManifest } })
  scheduler.requestStorageChanges({ [`folders:${scope}:chunk:0`]: { newValue: ownChunk } })
  await new Promise((resolve) => setTimeout(resolve, 20))
  expect(coordinator.sync).not.toHaveBeenCalled()
  ```
- **漏掉的回归**：带 `did` 的通知会先异步 `getDeviceId()` 再决定 run；睡 20ms 既不能证明"不会发生"，也没有确定性完成信号，CI 抖动时会给出错误结论。
- **建议**：注入可控 device-id deferred，await 其被调用后 `await Promise.resolve()` 排空微任务再断言；或让 scheduler 暴露可注入的 flush 点。
- **复核**：✅ 已读调度器构造与测试。

### H10. `chat-settings/styleController.test.ts` 用整段 CSS 模板字符串快照当断言
- **位置**：`src/entrypoints/content/chat-settings/styleController.test.ts:34-51`、`:113-132`
- **证据**：
  ```ts
  expect(css).toContain(
    `:root[data-gpk-chat-width] ${CHAT_SETTINGS_SCOPE} infinite-scroller > div.conversation-container user-query {\n  max-width: 100% !important;\n}`,
  )
  ```
- **漏掉的回归**：断言对象是生产 `STYLE` 模板字符串的 `textContent`；CSS 语义错误（规则层级/被覆盖）、选择器漂移测不到，格式化/等价选择器重写必误报。同文件 94-99 的 "selector 事实" 用例甚至不执行任何生产逻辑（见 L-S3-10）。
- **建议**：删除文本 `.toContain` 断言，保留 root `data-*` 与 `--gpk-*` 状态断言；需要守 CSS 时改为注入真实 `<style>` 后 `getComputedStyle` 断言关键结果。
- **复核**：✅ 已读测试与生产 `STYLE` 常量。

### H11. `top-bar-customization` 直接读仓库 CSS 源文件做字符串断言
- **位置**：`src/entrypoints/content/top-bar-customization/index.test.ts:238-250`
- **证据**：
  ```ts
  const css = readFileSync(join(process.cwd(), 'src/entrypoints/content/top-bar-customization/style.css'), 'utf8')
  expect(css).toContain(':root[data-gpk-hide-upgrade-reminder] top-bar-actions div.right-section div.adv-upsell')
  ```
- **漏掉的回归**：不经过构建链、依赖 cwd、格式/等价选择器变化即误报；真正的属性切换行为已由同文件 21-75 覆盖。
- **建议**：删除；若要守升级提醒隐藏规则，改为 fixture DOM + 注入 CSS + `getComputedStyle(display === 'none')`。
- **复核**：✅ 已读测试。

### H12. `deleteQueue` 用例手抄生产 selector 数组，生产 overlay 优先级零覆盖
- **位置**：`src/entrypoints/content/bulk-delete/deleteQueue.test.ts:30-47`
- **证据**：
  ```ts
  const overlay = __deleteQueueTestApi.findFirst([
    'div.cdk-overlay-container', '[role="dialog"]', '.modal-container', '.overlay-container',
  ])
  expect(overlay?.classList.contains('cdk-overlay-container')).toBe(true)
  ```
  这 4 个 selector 是测试手抄的 `deleteQueue.ts` 的 `OVERLAY_SELECTORS`；用例名中的 "fixed" 与 "visible" 也没有被断言。
- **漏掉的回归**：生产把 `.overlay-container` 提前导致在图片预览 overlay 里找删除菜单（真实故障），本用例仍全绿。
- **建议**：把 overlay 解析抽成生产可观测函数（内部持有 `OVERLAY_SELECTORS`）后断言优先级；或走完整"点击删除菜单→确认"链路。
- **复核**：✅ 已读测试与 `__deleteQueueTestApi` 用法。

### H13. `expect(css).toContain('!important')` 对 388 行 CSS 任意位置成立
- **位置**：`src/entrypoints/content/gemini-theme/background/styleController.test.ts:294`
- **证据**：
  ```ts
  expect(css).toContain('transparent var(--gpk-input-area-transparency, 40%)')
  expect(css).toContain('!important')
  ```
- **漏掉的回归**：几乎无；任意其它规则保留 `!important` 即可通过，与"input-area 规则必须 important"的意图无关。
- **建议**：删除，或改为对该规则块锚定正则；更推荐对渲染结果做 computed-style 断言（同文件 317-343 已有可用模式）。
- **复核**：✅ 已读测试与 style.css。

---

## 4. 中优先级发现（40 条）

> 编号前缀表示切片；"建议"为可直接执行的下一步。

| # | 位置 | 类 | 问题 | 建议 |
| --- | --- | --- | --- | --- |
| S1-M1 | `folderRepository.test.ts:135-142` | D | NFKC 重名/顶部排序/账号隔离与 `:437-449` 大面积重复 | 删本用例，color 归一化断言并入 `:451-468` |
| S1-M2 | `folderRepository.test.ts:44-61` vs `:248-274` | D | pin 幂等/普通序保持重复（后者是超集） | 删 `:49-52`、`:59-60`，只留分页 |
| S1-M3 | `folder-performance.test.ts:226-245` vs `folderRepository.test.ts:329-340` | D | "耗尽 pinned key 再平衡"跨文件重复 | 性能侧收窄为 foreign/nonadjacent + 未受影响 group |
| S1-M4 | `folder-performance.test.ts:278-280` | C | 断言内部派生索引 `displayOrderKey` 的 `0/1` 前缀编码 | 改为断言存在性 + 分页顺序 |
| S1-M5 | `folderRepository.test.ts:170-180` | D | 容量提示阈值/dismiss 与 `:379-435` 重复 | 删除本用例 |
| S1-M6 | `gemini-identity/index.test.ts:38-80` | C | 身份状态（selection/fallbackReason）只经 `console.info` 私有文案断言 | 改用 `getCurrent()` 公共 API；日志只留一条最小用例 |
| S1-M7 | `scheduler.test.ts:44,47,124,136,236` | E | 多处 `setTimeout(0/10)` 证明"没有更多调用" | 换成 run 完成的可观测同步点 |
| S1-M8 | `gemAvatarRepository.test.ts:66-85` | B | 只断言 `put` mock 收到字段，不验返回值/createdAt/旧 URL revoke | 断言保存结果、createdAt 保留、active 切换 revoke |
| S1-M9 | `folderRepository.test.ts:71,138,444,447` 等 | C | 用错误消息子串区分错误类型，`'unavailable'` 承载多种语义 | 引入 error `code` 后断言 `toMatchObject({ code })` |
| S1-M10 | `folder-recovery/snapshots.test.ts:50-52` | A | 用生产 `snapshotBytes` 复算期望字节数 | 改为硬编码数值；保留"全局统计 vs 按账号"语义说明 |
| S2-M1 | `command-service.test.ts:49-54,56-65` | E | 名为 "background RPC boundary" 只测 zod schema，handler 校验删掉也全绿 | 移到 `rpc-handler.test.ts` 断言 `INVALID_REQUEST` 且未执行命令 |
| S2-M2 | `native-chat-delete.test.ts:55-71` | B | fallback 只断言 `deleteConversationRows` 调用 1 次，不验行元素/失败恢复 | 断言传入行 + `failed` 时恢复 display |
| S2-M3 | `new-chat.test.ts:52-75` | E | placeholder 断言在 `if (!generatedTitleObserved)` 分支内，fixture 顺序变化即静默跳过 | 移到确定性位置或断言调用顺序 |
| S2-M4 | `new-chat.test.ts:24`（全文件） | E | `openNewChat` 被 mock 但从未断言，删掉 `new-chat.ts:105` 调用 10 例仍绿 | 断言 `openNewChat` 调用与 reset 参数 |
| S2-M5 | `startup.integration.test.ts:47` | C | 断言 `onMessage.addListener` 注册 2 次，不验证消息处理 | 删除数量断言，改为发消息断言响应 |
| S2-M6 | `runtime.test.ts:342-348` | C | 强转调用私有 `handleBackgroundMessage` | 走已捕获的公开 `messageListener` |
| S2-M7 | `FolderPicker.test.tsx:155-157` | C | 手写 Box mock 映射 `data-border-radius` 后断言 20px | 删除该用例 |
| S2-M8 | `command-service.test.ts:15,25,38` | D | 3 个 `it.each(['observed','manual-confirmed'])`；服务不读 `identitySource`，两参数同分支 | 每个行为保留 1 例 |
| S3-M1 | `deleteProgressOverlay.test.ts:22-41,62-85` | A/C | 200/160/1040/180 时长与状态类名逐一对应生产常量 | 保留结果断言，改大跨度推进 |
| S3-M2 | `dom.load.test.ts:108,117,128,137` | A/E | 断言 `MutationObserver.disconnect` 未被调用，但该分支根本不创建 observer | 删 spy，保留 `resolves` 断言 |
| S3-M3 | `deleteQueue.dom.test.ts:44-52` | A/D | 把 selector 常量与测试手抄字符串比较（常量快照） | 删除；行为测试已覆盖 |
| S3-M4 | `top-bar-action/index.test.ts:133-146` | C | light-mode 只断言注入 CSS 文本片段 | 改 `getComputedStyle(button).color` |
| S4-F2 | `types.test.ts:118-127` | A | 用生产同一常量表做期望，`table[k] === table[k]` | 删循环，保留/补独立字面量 |
| S4-F3 | `styleController.test.ts:91,151,164,442,454,510` | A | 3 个遗留 key 生产只 remove 从不 set，"为空"断言永不可失败 | 删除，或先写入再 apply/clear 验证移除 |
| S4-F4 | `styleController.test.ts:264-315,396-422` | C | 5 个用例读 `style.css` 源码做子串/巨型正则 | 改 computed style；至少锚定完整选择器 |
| S4-F5 | `messageGlassVisibility.test.ts:9-18,73-82,84-163` | A/C | 私有 surface/token 表逐字复制回读 | 保留边界/单调性/插值点，删整表回读 |
| S4-F6 | `transition.test.ts:141-155,182-193` | C | keyframes 长度 8、duration 34、easing/fill 等内部实现 | 断言首末帧/半径/调用次数等行为 |
| S4-F7 | `welcome-greeting/rect.test.ts:79-80` | A | 期望值复制生产公式（760/48/24/80 常量） | 改独立字面量（当前输入下 380/290） |
| S4-F8 | `notification-audio-offscreen/main.test.ts:131-140` | E | listener 只断言返回 Promise，不 await、不验播放 | `await listener(...)` 后断言 `play`/`src` |
| S5-M1 | `folders/index.test.tsx:696-705` | E | 4 种 retry outcome 只断言"不含 accepted/Retry requested" | 断言 4 种文案精确映射 |
| S5-M2 | `folders/index.test.tsx:334-340` vs `:556-569` | D | 容量颜色阈值两处重复；循环内重复断言账号摘要 | 阈值只留 `:556-569`，摘要提出循环 |
| S5-M3 | `chat-settings-panel/index.test.tsx:104-125,200-223` | E | 两条 close 用例未先断言"已打开"，打开链路坏掉也通过 | 关闭前补 `not.toBeNull()` |
| S5-M4 | `ThemeBloomControl.test.tsx:120,157,187-202` | A/E | `getValue` 返回与默认值相同的 true，初始读取未验证；失败用例"保持原状态"恒真 | `getValue=false` 验证加载；删除恒真断言 |
| S5-M5 | `FolderAppearancePicker.test.tsx:5-70,110-122` | C/F | 全量 mock Chakra 后断言 mock 自造属性与 `conic-gradient` 字面量 | 用真实 Chakra；只断言 onChange/可访问名 |
| S5-M6 | `toaster.test.tsx:33-47` | C | 耦合 Chakra `data-scope/data-part` 与 66/600/288 像素魔数 | 断相对关系/可访问名，删冗余非空断言 |
| S6-F2 | `stuffMediaParser.test.ts:45-121,124-168,215-224,236-317` | F/A | 约 20/24 用例测无生产调用方导出；类型数组用同源常量自证 | 删死导出+测试；若保留改字面量 `[1,1,1,0,0,0,1]` |
| S6-F3 | `shortcuts/definitions.test.ts:36-44,73-81,156-164,166-174` | D | 4 用例 + 3 断言与同文件循环不变量、完整默认表 100% 重复 | 删除；保留 `ignoreEventWhen` 断言 |
| S6-F4 | `toolboxActions.test.ts:146-156,216-221` | C | 断言内部 dev 日志事件名/`drawerCount` 等负载 | 删日志断言，保留 `resolves false` |
| S6-F5 | `currentChatDelete.test.ts:83-91` | D | `/gem` 完整流程与 `/app` 用例逐字重复，路由差异已由 dom 单测覆盖 | 合并为 it.each 或删除 |
| S6-F6 | `library/mediaParser.test.ts:35-39` | E | 名称声称 route/query order，实际未覆盖 `/u/N` 账号路由 | 补 `/u/2` 用例并改名 |

---

## 5. 低优先级发现（57 条）

| # | 位置 | 类 | 问题 | 建议 |
| --- | --- | --- | --- | --- |
| S1-L1 | `browser-sync.test.ts:121-126` | A | 用生产 `storageItemBytes` 复算 total 的分支断言 | 删 `:124`，保留 `:125` 并补硬编码值 |
| S1-L2 | `folder-domain.test.ts:43` | C | 断言两个 schema 别名是同一对象引用 | 改行为断言（两者接受/拒绝同一 payload） |
| S1-L3 | `gemini-identity/account-history.test.ts:27` | C/D | 断言存储 key 名，与 background 侧重复 | 保留 background 侧一条即可 |
| S1-L4 | `domain/folder/appearance.test.ts:12-25` | C | 目录精确 30/8 与预设色数组字面量 | 保留 key 唯一性；数量交给产品契约 |
| S1-L5 | `folder-sync/debug.test.ts:12-42` | F | 仅覆盖 dev-only 调试全局安装/恢复 | 保留 1 条安装+卸载，删"恢复已存在"分支 |
| S1-L6 | `folder-performance.test.ts:369`、`folderRepository.test.ts:203-204` | F | 断言 Dexie `verno`/表名存在，而非可用性 | 删 verno；表改为 put/get 可用性断言 |
| S1-L7 | `folder-performance.test.ts:235` | C | 断言诊断报告内部字段 `'rows' in row` | 删除 |
| S1-L8 | `gemini-api/conversations.test.ts:12-34` | D | conversationId 前缀归一化在 delete/rename 测 3 次 | delete 侧合并 it.each，补返回值透传 |
| S1-L9 | `scheduler.test.ts:204-209` | D | `it.each([5,3])` 两行命中同一未知版本分支 | 改为单例 |
| S1-L10 | `folder-recovery/runner.test.ts:17`、`storage-events.integration.test.ts:10-14` | C | 测试辅助直接强转读私有 `running`/`runs` | 改用可观测副作用等待 |
| S1-L11 | `folderRepository.test.ts:238-245` | A/E | `expect(warning).toHaveBeenCalled()` 不校验内容 | 删除或断言参数 |
| S2-L1 | `background/folders/account-history.test.ts:42` | A | `set.mock.calls.every(...)` 在从未调用时真空真 | `toHaveBeenCalledOnce` + 断言写入内容 |
| S2-L2 | `background/folderDeviceId.test.ts:39-45` | A | 只断言两次响应相等且 deviceId 是 string，未绑定已持久化 ID | 断言等于 `ids[0]` 与 storage 值 |
| S2-L3 | `background/folders/post-commit.integration.test.ts:44` | C | 强转读私有 `running`，与后续断言重复 | 删除该行 |
| S2-L4 | `content/folders/native-chat-delete.test.ts:86-111` | C | 断言完整诊断日志文案/字段 | 删除日志断言；保留 rejection |
| S2-L5 | `content/folders/new-chat.test.ts:137-146` | E | 用例名 "before or after submission"，实际只测 before | 改名或补 after cancel 用例 |
| S2-L6 | `content/folders/recents-visibility.test.ts:38-56` | D | `it.each(['observed','manual-confirmed'])`，reconcile 不读 source | 去 each 保留 1 例 |
| S2-L7 | `content/folders/runtime.test.ts:110,197,404-405` | C | 用 `toBe` 断言投影/数组对象身份 | 改 `toEqual` |
| S2-L8 | `content/folders/runtime.test.ts:177-188` | B | "刷新"只用 `getProjection` 调用次数表达 | 断言新投影内容已被采用 |
| S2-L9 | `responseCompleteNotification/index.test.ts:1166-1180` | E | "only after" 只断言都发生，无顺序断言 | 用 `invocationCallOrder` 断言顺序 |
| S2-L10 | `rpc-handler.test.ts:118-127,129-137` | D | title/pin 广播两用例断言完全相同 | 合并 it.each |
| S2-L11 | `startup.integration.test.ts:77-88` | C | 用 `storage.sync.get(null)` 调用形态观察扫描合并 | 改为 spy 可观测扫描次数 |
| S2-L12 | `overlay/folders/pointer-boundary.test.ts:24` | A | 断言的是手工 fixture 的前提（retargeting） | 删除该行，保留注释 |
| S3-L1 | `bulk-delete/index.test.tsx:269-272` | A | 断言测试自己写入的 `checkbox.checked` | 改断言 `Delete (1)`/选择状态 |
| S3-L2 | `bulk-delete/index.test.tsx:323,327,351,353` | D | 面板展开断言在两条用例重复 | 用例 1 删除展开断言 |
| S3-L3 | `bulk-delete/deleteQueue.test.ts:49-63` | F/A | DEV 强制失败开关 + 对"不存在的行为"做 Escape 负向断言 | 用真实失败注入替换 |
| S3-L4 | `bulk-delete/deleteQueue.dom.test.ts:82-95` | D/E | "hidden target row action" 名实不符；可见性未参与逻辑 | 合并到相邻用例并改名 |
| S3-L5 | `bulk-delete/dom.load.test.ts:66-79` | A | 对生产从不点击的按钮做 click spy 负向断言 | 删除 spy/断言 |
| S3-L6 | `gem-avatar/index.test.ts:190-191,221,467-468` | C | 断言 clickable 类名、`textContent===''`、svg 细节 | 删除；role/aria/open 已覆盖 |
| S3-L7 | `power-kit-entry/index.test.ts:140-146,198,273` | C | 内部标记：`className===''`、`aria-haspopup`、`style.cssText`、`data-gpk-icon-size` | 保留位置/点击断言，删内部标记 |
| S3-L8 | `stuff-page/libraryIsland.test.ts:68,81,83,91,95,111` | C | 内部诊断 `reason` 字符串与插入节点 tag | 保留 `kind`/按钮数量/`dataset.openUrl` |
| S3-L9 | `bulk-delete/BulkDeleteEntryHint.test.tsx:58` | C | 断言 hint 的父节点结构 | 删除，保留文案/存储/关闭断言 |
| S3-L10 | `chat-settings/styleController.test.ts:76-100` | F/C | "selector 事实"用例不执行生产逻辑，且手抄 scope | 删除；改 computed style |
| S3-L11 | `bulk-delete/deleteProgressOverlay.test.ts:49-58` | C | mock 文案、`UL` tag、兄弟顺序、`scaleX` 断言 | 保留 role/aria-valuenow/行内容 |
| S3-L12 | `top-bar-action/index.test.ts:87,91` | C | `className==='buttons-container'`、svg `viewBox` | 删除 viewBox；类名交给视觉验证 |
| S4-F9 | `theme-bloom/controller.test.ts:375-377,402-403` | D/A | 断言由测试自身回调移除的 class，前一条断言通过则恒真 | 删除两行 class 断言 |
| S4-F10 | `gemini-theme/background/service.test.ts:38-45` | F | `#imports` mock 从未被命中（死 mock） | 删除 |
| S4-F11 | `theme-bloom/transition.test.ts:88-100` | E | reduced-motion 用例名与断言不符；`reducedMotion` 原样回传 | 改名并断言清理/立即应用 |
| S4-F12 | `main-world/library-preload.test.ts:36-39,47-52` | C | 精确 trace stage/reason 文案，非空断言失败时退化为 TypeError | 用结构化计数断言/常量引用 |
| S5-L1 | `enhancements/index.test.tsx:91-114,217` | A/F | mock 内重抄生产 normalize；无关的 Theme Bloom 负向断言 | 用 `importOriginal`，删无关断言 |
| S5-L2 | `ThemeSettingsControls.test.tsx:58-100` | C/E | 5 个子组件全 mock，只验证 JSX 顺序与 2/5 个 variant | 合并为一条并断言全部 variant |
| S5-L3 | `folderAppearance.test.ts:11-28` | A/D | 常量表快照，与 domain 测试部分重复；CSS 变量子串断言 | 合并到 domain；回退改为与默认色相等 |
| S5-L4 | `useNotificationAudioAsset.test.tsx:13-18,38-42,119-131` | F/D | 空操作 mock、未引用 `#i18n` mock、doMock 与顶层 mock 重复 | 删除空 mock，统一 mock 策略 |
| S5-L5 | `useResponseCompleteNotificationSettings.test.tsx:147-176` | E | 177 行脚手架只验证 `isPending` 不变；未验证发送结果/readiness | 补消息 payload、readiness 更新/失败刷新 |
| S5-L6 | `FolderSideNav.test.tsx:106,114-117,143` | C/E | svg `width=14`、CSS token 子串、纯负向用例无正向前置 | 删尺寸/token；负向用例加正向前置 |
| S5-L7 | `theme-floating-panel/index.test.tsx:99-111` | D/E | 只断言按钮数量（2），上一条已断言相同数量+aria-label | 合并或断言 aria-label |
| S5-L8 | `folders/index.test.tsx:163-172,174-192` | E | 用例名声称 "reveal new email input"/"without deleting data" 未被断言 | 补断言或改名 |
| S5-L9 | `ThemeBloomControl.test.tsx`、`enhancements`、`folders` 视图 | C/F | i18n mock 复制英文文案，key 拼错会被 fallback 吞掉 | 断言 key 契约而非文案 |
| S5-L10 | `folders/index.test.tsx:283` | C | `unlimitedStorage grantedtrue` 锁定相邻文本节点拼接 | 改按行/分隔断言 |
| S6-F7 | `chatActions.test.ts:24,29,228,233,251,258,347,363` | E | `{ once: true }` 使 `toHaveBeenCalledTimes(1)` 退化为布尔 | 去掉 once 并手动移除监听 |
| S6-F8 | `chatActions.test.ts:188-210` | A | pathname 由测试自己的 click spy 写入 | 删除；改断言未走 SPA fallback |
| S6-F9 | `integrations/gemini-rpc/operations.test.ts:24` | A/F | 断言无人消费的 `risk` 常量 | 删除断言/字段 |
| S6-F10 | `operations.test.ts:72-74`、`main-world-runtime.test.ts:152-161` | C | 精确内部错误文案 | 用可判别 `code` 或至少成对断言分支 |
| S6-F11 | `main-world-runtime.test.ts:46-53` | E | `/u/2` 用例只断言 `source`，未验证 fSid/bl/at | 与上一条合并，断言完整参数 |
| S6-F12 | `stuffMediaParser.test.ts:221-224,154-167,172-195` | E/A | 用例 1 构造走不到目标分支；next page 只断言 token；`toBeDefined` 弱断言 | 换合法两行响应；断言完整结构/精确值 |
| S6-F13 | `cycleModel.test.ts:20-22` | C/E | fixture 同时给 `data-active` 与 `class=selected` 两个矛盾选中信号 | 删除矛盾属性或明确优先级 |
| S6-F14 | `editorUtils.test.ts:37-42` | F | 断言无调用方的 debug 导出 `getDetailedButtonStatus` | 删除这三行 |

---

## 6. 横向反模式统计

| 反模式 | 典型条目 | 处理策略 |
| --- | --- | --- |
| 源码/CSS 文本快照 | H10、H11、H13、S4-F4、S3-M3、S3-L10、S3-L12、S1-L4/S5-L3 的部分 | 能删则删；需要守样式时用 `getComputedStyle` 测结果；selector 常量交给行为 fixture |
| 同源 oracle / 恒真断言 | H4、S1-M10、S4-F2、S4-F3、S4-F7、S6-F2、S6-F12、S1-L1 | 期望值写独立字面量；先写状态再断言清理；公式类用手工核算值 |
| mock 自测 / 只断言 mock 通道 | S5-M5、S5-M6、S2-M7、S6-F4、S1-M8、S2-M2 | 用真实 Chakra/真实 DOM fixture；断言结果而非 mock 产物 |
| 名实不符 / 假覆盖 | H3、H5、H6、H7、S2-M1、S2-M3、S2-M4、S5-M3、S5-M4、S5-M8、S6-F6、S2-L9、S5-L5 | 要么补上名字承诺的断言，要么改名；关闭类用例先断言"已打开" |
| 重复覆盖 | H8、S1-M1/M2/M3/M5、S3-L2、S5-M2、S6-F3/F5、S2-M8、S2-L10、S1-L8/S1-L9 | 合并为 it.each 或删除子集；保留语义最强的一份 |
| 真实计时器等待 | H9、S1-M7 | 用 deferred/flush/`vi.waitFor` 的可观测完成信号；禁止睡固定毫秒证明"未发生" |
| 实现细节耦合 | S1-M4、S1-M6、S3-M1、S3-L6/L7/L8/L11/L12、S4-F6、S4-F12、S5-M6、S5-L10、S6-F10/F13 | 只断言用户/协议可观察量；内部常量需要引用生产导出而非复制 |
| 死代码测试 | H1、S6-F2、S6-F14、S1-L5、S5-L4、S4-F10 | 先确认无生产调用方，再连同测试与死导出一起删 |
| 跨文件重复段落 | `makeVisible` ×3、`MockAudio` ×2、`createDeferred` ×2、ThemeBackgroundSettings fixture ×4、Library fixture ×5、StreamGenerate 信封 ×5 | 抽共享 fixture/helper；每类测试只保留一个 owner |
| i18n mock 文案复制 | S5-L9（3+ 文件） | 统一为"key 契约"或真实 locale 断言，避免复制整段英文文案 |
| 可移植性 | H2（`.original` 未跟踪） | 提交 fixture 到 `test/samples/` 或 `skipIf(!exists)` |

---

## 7. 跨文件重复与合并建议

| # | 重复内容 | 位置 | 建议 |
| --- | --- | --- | --- |
| 1 | 恢复失败回退分类 | `folderRepository.test.ts:158-168` / `:499-509` / `:529-552` | 保留 it.each，删前两条（H8） |
| 2 | NFKC 重名/顶部排序/账号隔离 | `folderRepository.test.ts:135-142` / `:437-449` | 删前者（S1-M1） |
| 3 | pin 幂等/普通序 | `folderRepository.test.ts:44-61` / `:248-274` | 保留后者（S1-M2） |
| 4 | 容量提示阈值 | `folderRepository.test.ts:170-180` / `:379-435` | 删前者（S1-M5） |
| 5 | 耗尽 pinned key 再平衡 | `folder-performance.test.ts:226-245` / `folderRepository.test.ts:329-340` | 性能侧收窄（S1-M3） |
| 6 | 存储 key 断言 | `gemini-identity/account-history.test.ts:27` / `background/folders/account-history.test.ts:42` | 保留 background 侧（S1-L3） |
| 7 | 外观目录（icon 数量/颜色/hex） | `domain/folder/appearance.test.ts` / `components/folders/folderAppearance.test.ts` / `FolderAppearancePicker.test.tsx` | 契约留 domain；组件只测渲染/回调（S5-L3） |
| 8 | settings controller 测试模板 | `bulk-delete/settings.test.ts` / `gem-avatar/settings.test.ts` | 两控制器行为不同（失败回退相反），可抽 harness，不建议直接合并用例 |
| 9 | `makeVisible`/DOM fixture | `currentChatDelete.test.ts`、`currentChatDelete.dom.test.ts`、`geminiDom.test.ts` | 抽 `domVisibility` test util；/gem 流程合并（S6-F5） |
| 10 | shortcuts 默认表 | `definitions.test.ts:12-22,92-131` / `validation.test.ts:5-23` | validation 改用 definitions 默认表导出；definitions 删重复用例（S6-F3） |
| 11 | 通知音频权限/offscreen 单飞 | `responseCompleteNotification/index.test.ts` / `audio.test.ts` | audio 留单元协议；index 只留"创建成功才播放"集成断言 |
| 12 | Deep Research 状态机 | `responseCompleteNotification/index.test.ts` / `deepResearchState.test.ts` | 状态语义集中在 state 测试；index 留端到端代表 |
| 13 | runtime ↔ client 投影不变量 | `content/folders/runtime.test.ts` / `client.test.ts` | client 只测分页构造；runtime 用 mock 测合并/保留 |
| 14 | notification 私有 surface/token 数值 | `messageGlassVisibility.test.ts` / `gemini-theme/styleController.test.ts` | 共享 fixture/常量，避免"同名不同数" |
| 15 | ThemeBackgroundSettings fixture ×4 | 见 S4 §4.1 | 抽 `createThemeBackgroundSettings(overrides)` |
| 16 | Library fixture ×5 文件 | mediaParser / libraryIsland / library-preload / library-monitor / styleController | 指定唯一 owner（解析单测），其余只测管线 |
| 17 | StreamGenerate 信封构造 ×5 | main-world / utils / gemini-rpc 测试 | 抽 `test/fixtures/streamGenerate` |
| 18 | i18n mock 翻译表 | ThemeBloomControl/enhancements/folders/chat-layout-settings/FolderSideNav/theme-floating-panel | 统一 key 契约策略（S5-L9） |
| 19 | MockAudio / createDeferred | audioAsset 测试 / useNotificationAudioAsset / NotificationTestButton / hooks 测试 | 抽共享 test util |
| 20 | RPC 边界 schema 断言 | `command-service.test.ts` / 未来 `rpc-handler.test.ts` | 移到 handler 层（S2-M1） |

---

## 8. 建议执行顺序

### 批次 A：修复"假绿/假覆盖"（优先，改动小）

1. `stuffMediaParser.test.ts` fixture 改为已跟踪文件或 `skipIf`（H2）——否则 CI 不可移植。
2. 删除 `chat-title-cache.test.ts` 与死代码（H1）。
3. 修 `responseCompleteNotification/index.test.ts:1040` 的 fake timers 顺序（H3）。
4. `folderRepository.test.ts:451` 补 `renamed` 断言（H7）。
5. 删 `folderRepository.test.ts` 两条重复回退用例（H8）。
6. `storage.test.ts` 重写为 getter/setter + `getAllSettings` 覆盖（H4）。
7. `responseCompleteNotificationContent.test.ts:162` 补监听器计数（H5）。
8. `folders/index.test.tsx:314` 改为同实例 prop 变化（H6）。
9. `scheduler.test.ts:181` 改确定性等待（H9）。

### 批次 B：删除高置信无效/重复用例（约 15–25 个）

- 死壳文件 2 例（H1）。
- `shortcuts/definitions.test.ts` 4 例 + 3 断言（S6-F3）。
- `folderRepository.test.ts` 重复 2 例（H8）+ 1 例（S1-M1）+ 1 例（S1-M5）。
- `currentChatDelete.test.ts` /gem 流程 1 例（S6-F5）。
- `FolderPicker.test.tsx` 圆角 1 例（S2-M7）。
- `chat-settings/styleController.test.ts` selector 事实 1 例（S3-L10）。
- `top-bar-customization` CSS 文件断言 1 例（H11）。
- 若确认 `stuffMediaParser` 导出为死代码：连测试约 20 例一并删除（S6-F2，需产品/架构确认）。

### 批次 C：合并/加强（约 15–20 个用例）

- `deleteProgressOverlay` 时序断言改结果断言（S3-M1）。
- `folders/index.test.tsx` 重试文案精确映射、容量阈值去重（S5-M1/M2）。
- `new-chat.test.ts` 补 `openNewChat` 断言（S2-M4）。
- `command-service.test.ts` schema 用例迁移到 handler（S2-M1）。
- `ThemeBloomControl` 初始读取与失败回退断言（S5-M4）。
- `native-chat-delete` fallback 行断言（S2-M2）。
- `notification` 成功路径顺序断言（S2-L9）。
- `folderDeviceId` 持久化 ID 绑定（S2-L2）。

### 批次 D：系统性治理（建议排期）

1. **样式测试**：CSS 文本快照统一替换为 `getComputedStyle` 行为断言（happy-dom 已验证可应用静态 CSS）。
2. **错误契约**：repository/query 引入 error `code`，逐步替换消息子串断言（S1-M9）。
3. **测试基础设施**：抽 `src/test` 下的共享 fixture/helper（ThemeBackgroundSettings、Library、StreamGenerate、MockAudio、domVisibility、i18n mock 策略）。
4. **可移植性**：禁止测试在模块顶层读取未跟踪文件；`pnpm test:run` 在干净 clone 上加 CI 校验。

### 量化预估

- 可删除/合并用例约 **25–40 个**（约占 946 的 3%–4%；不含 `stuffMediaParser` 死导出全删的约 20 个）。
- 建议重写约 **18–22 个**、补/改断言约 **60–80 条**。
- 对运行时长影响很小（全量约 24s，其中 23.4s 由 `folder-performance.test.ts` 占；本次问题主要是维护性与回归检测力，不是速度）。若目标是提速，应单独治理性能测试（见「耗时基线」）。

---

## 9. 防误报清单：看似无效、实际有效（不要删）

1. `scheduler.test.ts` 大量 `toHaveBeenCalledTimes/With`：调度器的职责就是合并唤醒、限流、保留 trailing run；调用次数/参数即被测协议。
2. `folders/index.test.tsx:520-530` "measure on each visible entry"：测量只在可见入口触发的性能/配额协议。
3. `FolderSideNav.pin.test.tsx` 的 computed `visibility`：pin 行图标与菜单图标切换是用户可见行为。
4. `chat-layout-settings` 失败后 `applyChatSettingsStyles(DEFAULT_CHAT_SETTINGS)`：保存失败回滚是用户可见行为。
5. `snapshots.test.ts:161` `estimate` 未被调用：保护"不基于估算配额预检拒绝写入"的历史决策。
6. `folder-performance.test.ts` 的 `expectSummary()` 用生产聚合函数：两侧数据源不同（增量 summary vs 全量重算），是差分测试。
7. notification 集成测试中的完整通知对象断言：通知 id/icon/silent/路由是用户可见契约。
8. `native-menu.test.ts` 的克隆菜单类名/图标断言：生产刻意克隆 Gemini 原生项以复用样式，能捕获"改手工 createElement"的真实回归。
9. `client.test.ts` 的 `limit: 100/10/5` 与 `deepResearchState` 的 30 分钟 TTL：分页/预览/过期语义，改动即真实行为变化。
10. `definitions.test.ts` 的分类顺序断言：action 漏分类会从设置面板消失，是产品契约。
11. `fetchInterceptor.test.ts:110-124` 的纯负向断言：in-flight 响应不应投递给取消/新订阅者，是订阅快照协议。
12. `xhrInterceptor.test.ts:22-41` 的转发参数断言：XHR 拦截器的唯一职责就是转发 send 生命周期。
13. `styleController.test.ts:424-527` clear 后约 30 条变量/属性为空断言：每条对应一个真实的样式残留泄漏（虽冗长但有效）。
14. `appearance/service.test.ts` 的 matchMedia add/remove 调用次数：平台监听器生命周期协议，modern/legacy 两分支均有行为断言。
15. `styleController.test.ts:317-343` 对 `[data-gpk-msg-glass]` false/true 两值都断言 padding=12px：守护"玻璃关闭时也不丢 padding"的真实样式回归。
16. `useResponseCompleteNotificationSettings` 的 `isPending` 断言：虽薄，但能捕获"把 pending 塞进测试通知"的开关误禁用回归。
17. `scripts/folder-performance-tools.test.ts`：验证 fixture 生成器与日志汇总脚本的确定性/可导入性，属于工具链保护。
18. `folder-sync/debug.test.ts`、`gemini-rpc/debug.test.ts` 等 dev 全局测试：低价值但确有安装/卸载行为，可降优先级但不必判无效。

---

## 10. 限制与说明

- 行号基于审计时的 dirty working tree（审计期间另有进程改动 `background/folders/command-service.ts`、`rpc-handler.ts`、`runtime.ts` 等生产文件）；**测试文件 mtime 未变**，测试行号可靠；生产文件行号可能漂移。
- 未运行覆盖率工具；"死代码/无调用方"结论基于 `grep` 与（slice-6）`.output/` 构建产物交叉验证。
- `it.each` 的"声明数"与"运行用例数"不一致（如 120 个文件 946 用例），文中同时标注。
- 未修改任何 `src/`、`test/`、`scripts/` 文件；本报告为新增文件。
- 全部 6 份原始切片报告（含逐条证据与更详细建议）已随本报告保存在 [`docs/quality/raw/`](./raw/)：`slice-1-data-sync.md`、`slice-2-background-folders.md`、`slice-3-content-a.md`、`slice-4-theme-mainworld.md`、`slice-5-ui-services.md`、`slice-6-utils-integrations.md`。

---

## 附录 A：120 个测试文件覆盖总表

> "结论"来自逐文件通读；"备注"为审计员的简短说明。按文件路径排序。

| 1 | `bulk-delete/BulkDeleteEntryHint.test.tsx` | 4 | 发现 1 处（低 L9） | 通读；存储协议断言（id/version）有效，n 未计入 |
| 2 | `bulk-delete/deleteProgressOverlay.test.ts` | 5 | 发现 2 处（中 M1、低 L11） | 通读；结果类断言（行移除/overlay 消失/进度文本）有效 |
| 3 | `bulk-delete/deleteQueue.dom.test.ts` | 12 | 发现 2 处（中 M3、低 L4） | 通读；10 个 DOM fixture 用例质量高 |
| 4 | `bulk-delete/deleteQueue.test.ts` | 3 | 发现 2 处（高 H3、低 L3） | 通读；含 1 个私有 helper 用例（有效，见 §5） |
| 5 | `bulk-delete/dom.load.test.ts` | 6 | 发现 2 处（中 M2、低 L5） | 通读；abort/timeout 清理用例有效 |
| 6 | `bulk-delete/index.test.tsx` | 21 | 发现 2 处（低 L1、L2） | 通读；大文件整体质量好，mutation/tooltip/失败 toast 用例有效 |
| 7 | `bulk-delete/settings.test.ts` | 4 | 干净 | 通读；fail-open 语义与幂等/退订断言有效 |
| 8 | `bulk-delete/stickyActionBar.test.ts` | 1 | 干净 | 通读；单用例覆盖显隐/定位/文案/点击/销毁，紧凑有效 |
| 9 | `chat-settings/styleController.test.ts` | 4 | 发现 2 处（高 H1、低 L10） | 通读 |
| 10 | `gem-avatar/index.test.ts` | 13 | 发现 1 处（低 L6） | 通读；集成度高的注入/路由/仓库 mock 用例质量好 |
| 11 | `gem-avatar/route.test.ts` | 4 | 干净 | 通读 |
| 12 | `gem-avatar/settings.test.ts` | 4 | 干净 | 通读；与 bulk-delete/settings.test.ts 结构重复（见 §4） |
| 13 | `power-kit-entry/index.test.ts` | 8 | 发现 1 处（低 L7） | 通读 |
| 14 | `scripts/folder-performance-tools.test.ts` | 1 | 干净 | 单个 it 覆盖两个脚本的确定性输出，断言有效；仅注意子进程使用相对路径，依赖 CWD=仓库根 |
| 15 | `src/common/storage.test.ts` | 1 | 发现 1 处（H1） | 通读；恒真断言 + mock 调用，模块其余导出零覆盖 |
| 16 | `src/components/chat-layout-settings/index.test.tsx` | 5 | 干净 | 通读；真实 Chakra + 部分 mock，watch/setValue/回滚均为行为断言 |
| 17 | `src/components/chat-settings-panel/index.test.tsx` | 5 | 发现 1 处（M3，涉 2 用例） | 通读；开/关生命周期覆盖，缺“先打开”前置 |
| 18 | `src/components/folders/folderAppearance.test.ts` | 2 | 发现 1 处（L3） | 通读；常量快照，与 domain 测试部分重复 |
| 19 | `src/components/folders/FolderAppearancePicker.test.tsx` | 1 | 发现 1 处（M5） | 通读；全量 Chakra mock，断言 mock 自造属性 |
| 20 | `src/components/folders/FolderSideNav.pin.test.tsx` | 3 | 干净 | 通读；真实 Chakra，pin 排序/菜单按钮复用/拖拽分组均为行为断言（见第 5 节） |
| 21 | `src/components/folders/FolderSideNav.test.tsx` | 9 | 发现 1 处（L6，涉 3 处断言） | 通读；折叠/双击/延迟保存为主，少量像素/token 耦合 |
| 22 | `src/components/folders/folderTitleClick.test.ts` | 2 | 干净 | 通读；fake timer 边界与双击取消均为有效行为（第 5 节） |
| 23 | `src/components/notification/NotificationTestButton.test.tsx` | 1 | 干净 | 通读；pending→disabled→恢复是有效行为；名称“local”略夸张但不构成无效断言 |
| 24 | `src/components/setting-panel/toaster.test.tsx` | 1 | 发现 1 处（M6） | 通读；portal/定位/清理有效，但 Chakra 内部 part + 精确像素/魔数 |
| 25 | `src/components/setting-panel/views/enhancements/index.test.tsx` | 4 | 发现 2 处（L1、L9） | 通读；加载/写入/失败行为扎实，mock 内重抄 normalize |
| 26 | `src/components/setting-panel/views/folders/index.test.tsx` | 45 声明 / 56 运行 | 发现 5 处（H3、M1、M2、L8、L10） | 通读（分两段）；整体质量高，问题集中在调试面板与负向断言 |
| 27 | `src/components/setting-panel/views/notification/useNotificationAudioAsset.test.tsx` | 5 | 发现 1 处（L4，文件级） | 通读；行为断言有效，mock 脚手架冗余 |
| 28 | `src/components/setting-panel/views/theme/ThemeBloomControl.test.tsx` | 4 | 发现 2 处（M4、L9） | 通读；watch/setValue/toast 有效，初始读取未被验证 |
| 29 | `src/components/setting-panel/views/theme/ThemeSettingsControls.test.tsx` | 2 | 发现 1 处（L2） | 通读；仅组合快照 |
| 30 | `src/components/theme-floating-panel/index.test.tsx` | 3 | 发现 1 处（L7） | 通读；source 分支行为有效，第三条仅数量断言 |
| 31 | `src/data/repositories/folder-performance.test.ts` | 14 | 发现 4 处（M3/M4/L6/L7）+ 参与 M9 | 通读；预算/诊断/游标断言大量有效 |
| 32 | `src/data/repositories/folderRepository.test.ts` | 36 | 发现 6 处（H1/H2/M1/M2/M5/L11）+ M9 | 通读；主体行为覆盖扎实，重复集中在 retained 组 |
| 33 | `src/data/repositories/gemAvatarRepository.test.ts` | 4 | 发现 1 处（M8） | 通读；validateObjectUrl 两例有效 |
| 34 | `src/domain/folder/appearance.test.ts` | 3 | 发现 1 处（L4） | 通读 |
| 35 | `src/domain/folder/folder-domain.test.ts` | 6 | 发现 1 处（L2） | 通读；tree/schema 校验有效 |
| 36 | `src/entrypoints/background/folderDeviceId.test.ts` | 2 | 发现 1（低 L2） | 单飞+持久化路径整体有效；handler 响应未绑定持久化 ID |
| 37 | `src/entrypoints/background/folders/account-history.test.ts` | 6 | 发现 1（低 L1） | 序列化/损坏恢复/失败继续等用例扎实；.every 真空真 |
| 38 | `src/entrypoints/background/folders/command-service.test.ts` | 9 | 发现 2（中 M1、M8） | after-commit 用例（含 SYNC 失败唤醒 Recovery）有效；schema 用例错位 |
| 39 | `src/entrypoints/background/folders/post-commit.integration.test.ts` | 1 | 发现 1（低 L3） | 真实 fake-indexeddb 集成，核心“两路阻塞时仍持久返回”有效 |
| 40 | `src/entrypoints/background/folders/rpc-handler.test.ts` | 10 | 发现 1（低 L10） | 错误映射/invalidation/读写分流均有效；两个广播用例可合并 |
| 41 | `src/entrypoints/background/folders/startup.integration.test.ts` | 4 | 发现 2（中 M5、低 L11） | 多账号恢复、chunk-only、扫描失败的集成断言有效 |
| 42 | `src/entrypoints/background/responseCompleteNotification/audio.test.ts` | 6 | 干净 | offscreen 单飞/permission/Firefox 分支均有效 |
| 43 | `src/entrypoints/background/responseCompleteNotification/deepResearchState.test.ts` | 7 | 干净 | 会话状态机、过期、损坏字段迁移均有效 |
| 44 | `src/entrypoints/background/responseCompleteNotification/geminiResponseRequest.test.ts` | 5 | 干净 | 纯函数分类，查询顺序/非法 URL 覆盖到位 |
| 45 | `src/entrypoints/background/responseCompleteNotification/index.test.ts` | 43 | 发现 2（高 H2、低 L9） | 权限/深研/通知路由整体扎实；fake timer 顺序与“only after”顺序两处缺陷 |
| 46 | `src/entrypoints/content/folders/chat-title-cache.test.ts` | 2 | 发现 1（高 H1） | 整个文件测无引用空壳类，建议删除 |
| 47 | `src/entrypoints/content/folders/client.test.ts` | 6 | 干净 | 分页/STALE 重试/诊断隐私断言有效（limit 常量属协议，可接受） |
| 48 | `src/entrypoints/content/folders/conversation-metadata.test.ts` | 2 | 干净 | chatId/标题回退有效 |
| 49 | `src/entrypoints/content/folders/native-chat-delete.test.ts` | 4 | 发现 2（中 M2、低 L4） | “未发送才 fallback/未知结果不重试”有效；fallback 结果与日志断言偏弱 |
| 50 | `src/entrypoints/content/folders/native-menu.test.ts` | 4 | 干净 | 唯一行注入/克隆结构/歧义不注入/菜单关闭均有效（克隆断言见 §5） |
| 51 | `src/entrypoints/content/folders/new-chat.dom.test.ts` | 4 | 干净 | 当前+历史 fieldset 契约、歧义/临时会话判断有效；历史选择器属保留兼容路径（低价值但有效） |
| 52 | `src/entrypoints/content/folders/new-chat.test.ts` | 10 | 发现 3（中 M3、M4，低 L5） | 关联流程覆盖广，但核心 openNewChat 无断言、条件断言与名称超范围 |
| 53 | `src/entrypoints/content/folders/recents-visibility.test.ts` | 3 | 发现 1（低 L6） | 仅隐藏“已组织/非当前/未置顶”与失败恢复；source 参数化冗余 |
| 54 | `src/entrypoints/content/folders/runtime.test.ts` | 25 | 发现 3（中 M6，低 L7、L8） | 并发/竞态/账号切换/删除保护等强力用例多；私有调用与 toBe 身份断言需清理 |
| 55 | `src/entrypoints/content/gemini-theme/appearance/service.test.ts` | 9 | 干净 | 通读；matchMedia modern/legacy 两条分支均有行为断言，详见 §5 |
| 56 | `src/entrypoints/content/gemini-theme/background/messageGlassVisibility.test.ts` | 5 | 发现 1 处（中） | 通读；对照 messageGlassVisibility.ts 常量表核对 |
| 57 | `src/entrypoints/content/gemini-theme/background/service.test.ts` | 8 | 发现 1 处（低，死 mock） | 通读；对照 service.ts 依赖图确认 #imports mock 未命中 |
| 58 | `src/entrypoints/content/gemini-theme/background/styleController.test.ts` | 11 | 发现 3 处（高 1 / 中 2） | 通读；对照 styleController.ts + style.css（含 388 行 CSS）核对 |
| 59 | `src/entrypoints/content/gemini-theme/background/types.test.ts` | 13 | 发现 1 处（中） | 通读；对照 types.ts 的 getter/常量定义 |
| 60 | `src/entrypoints/content/gemini-theme/background/welcome-greeting/estimator.test.ts` | 3 | 干净 | 通读；期望值为独立手算几何值，覆盖 cover 缩放与阈值分支 |
| 61 | `src/entrypoints/content/gemini-theme/background/welcome-greeting/rect.test.ts` | 2 | 发现 1 处（中） | 通读；对照 rect.ts 公式 |
| 62 | `src/entrypoints/content/gemini-theme/background/welcome-greeting/service.test.ts` | 5 | 干净 | 通读；对照 service.ts 的缓存/URL/暗色/URL 变化路径 |
| 63 | `src/entrypoints/content/overlay/folders/AnchoredGeminiMenu.test.ts` | 4 | 干净 | 定位/flip/clamp 纯函数断言有效 |
| 64 | `src/entrypoints/content/overlay/folders/ChatRenameDialog.test.tsx` | 4 | 干净 | Shadow DOM、空保存、失败重试、重复提交均有效 |
| 65 | `src/entrypoints/content/overlay/folders/FolderActionMenu.test.tsx` | 3 | 干净 | 菜单顺序/分隔符/置顶切换有效 |
| 66 | `src/entrypoints/content/overlay/folders/FolderDialogs.test.tsx` | 2 | 干净 | 远程 changed/deleted 时保留草稿与原始 revision 有效 |
| 67 | `src/entrypoints/content/overlay/folders/FolderPicker.test.tsx` | 4 | 发现 1（中 M7） | 指针不关闭/toast/失败保留/新建入口有效；圆角字面量断言无效 |
| 68 | `src/entrypoints/content/overlay/folders/pointer-boundary.test.ts` | 2 | 发现 1（低 L12） | composedPath 判定有效；fixture 前提断言无回归价值 |
| 69 | `src/entrypoints/content/theme-bloom/controller.test.ts` | 26（含 it.each 展开） | 发现 1 处（低） | 通读；对照 controller.ts/dropArbiter.ts 的事件与坐标分支 |
| 70 | `src/entrypoints/content/theme-bloom/palette.test.ts` | 6 | 干净 | 通读；合成像素→preset/hex 的期望可独立核算 |
| 71 | `src/entrypoints/content/theme-bloom/service.test.ts` | 4 | 干净 | 通读；依赖 mock 属编排协议（预加载先于 transition、失败回滚） |
| 72 | `src/entrypoints/content/theme-bloom/settings.test.ts` | 4 | 干净 | 通读；对照 settings.ts 的 revision/abort 逻辑 |
| 73 | `src/entrypoints/content/theme-bloom/transition.test.ts` | 7 | 发现 2 处（中 1 / 低 1） | 通读；对照 transition.ts 关键帧/时长/reduced-motion 分支 |
| 74 | `src/entrypoints/main-world/library-monitor.test.ts` | 4 | 干净 | 通读；fetch 透传/bodyUsed/清理后停止派发均有行为断言 |
| 75 | `src/entrypoints/main-world/library-preload.test.ts` | 7 | 发现 1 处（低） | 通读；对照 library-preload.ts 的扫描/去重/字节上限 |
| 76 | `src/entrypoints/main-world/stream-generate-monitor.test.ts` | 4 | 干净 | 通读；observation 相位序列本身即跨世界协议 |
| 77 | `src/entrypoints/notification-audio-offscreen/main.test.ts` | 5 | 发现 1 处（中） | 通读；对照 main.ts 的 listener/播放实现 |
| 78 | `src/hooks/useResponseCompleteNotificationSettings.test.tsx` | 1 | 发现 1 处（L5） | 通读；仅 pending 断言，其余 hook 行为未覆盖 |
| 79 | `src/integrations/gemini-rpc/client.test.ts` | 2 | 干净 | ready 解锁、abort not-sent 均为行为断言；总体覆盖偏薄但无无效断言 |
| 80 | `src/integrations/gemini-rpc/debug.test.ts` | 2 | 干净 | install/uninstall/restore 均为可观察行为 |
| 81 | `src/integrations/gemini-rpc/main-world-runtime.test.ts` | 9 | 发现 2 处（低） | F11（L46-53）、F10（L152-161）；其余 URL/f.req/解析断言有效 |
| 82 | `src/integrations/gemini-rpc/operations.test.ts` | 5/18 | 发现 3 处（低） | F9（L24）、F10（L72-74）；L34-36 与 main-world 测试重复（§4） |
| 83 | `src/services/chatSettings.test.ts` | 7 | 干净 | 通读；normalize/夹取/同步 patch 均为纯函数行为 |
| 84 | `src/services/folder-recovery/runner.test.ts` | 10 | 发现 1 处（L10 一半） | 通读；并发/轮转/事务用例有效 |
| 85 | `src/services/folder-recovery/snapshots.test.ts` | 13 | 发现 1 处（M10） | 通读；保留策略/预算/租约用例有效 |
| 86 | `src/services/folder-sync/codec.test.ts` | 3 | 干净 | 通读 |
| 87 | `src/services/folder-sync/coordinator.test.ts` | 30 | 干净 | 通读；负向 storage.sync.set 断言属协议 |
| 88 | `src/services/folder-sync/debug.test.ts` | 2 | 发现 1 处（L5） | 通读 |
| 89 | `src/services/folder-sync/providers/browser-sync.test.ts` | 26 | 发现 1 处（L1） | 通读；传输/校验/配额用例有效 |
| 90 | `src/services/folder-sync/scheduler.test.ts` | 25 | 发现 3 处（H3/M7/L9） | 通读；调度协议 spy 断言多数有效（见 §5） |
| 91 | `src/services/folder-sync/storage-events.integration.test.ts` | 5 | 发现 1 处（L10 一半） | 通读 |
| 92 | `src/services/gemini-api/conversations.test.ts` | 5 | 发现 1 处（L8） | 通读；RPC 参数属被测协议 |
| 93 | `src/services/gemini-identity/account-history.test.ts` | 4 | 发现 1 处（L3） | 通读 |
| 94 | `src/services/gemini-identity/index.test.ts` | 27 | 发现 1 处（M6） | 通读；DOM/竞态/失败路径用例有效 |
| 95 | `src/services/responseCompleteNotificationAudioAsset.test.ts` | 6 | 干净 | 通读；2MB 边界、类型/解码拒绝、元数据剥离、删除协议均有效 |
| 96 | `src/services/responseCompleteNotificationContent.test.ts` | 17 | 发现 1 处（H2） | 通读；DOM 提取/重试/前台判定均有效，仅监听器计数用例假覆盖 |
| 97 | `src/services/shortcuts/definitions.test.ts` | 10 | 发现 1 处（中，含 4 用例+3 断言） | F3；L46-71 的排序断言见 §5（有效） |
| 98 | `src/services/shortcuts/format.test.ts` | 7 | 干净 | 纯函数格式化，逐分支断言合理 |
| 99 | `src/services/shortcuts/settings.test.ts` | 6 | 干净 | normalize 的缺失补全/保留用户值/显式清空均为行为断言 |
| 100 | `src/services/shortcuts/validation.test.ts` | 8 | 干净 | 无无效断言；硬编码 bindings fixture 与 definitions 表重复见 §4 |
| 101 | `src/services/topBarCustomizationSettings.test.ts` | 3 | 干净 | 通读；归一化/读取/patch 合并 + setValue 协议均有效 |
| 102 | `src/utils/chatActions.test.ts` | 21 | 发现 2 处（低） | F7（4 个用例的 once 计数）、F8（L209） |
| 103 | `src/utils/currentChatDelete.dom.test.ts` | 5/7 | 干净 | Gemini DOM 技术属性/歧义/路由谓词断言有效；fixture 与集成测试重复见 §4 |
| 104 | `src/utils/currentChatDelete.test.ts` | 4 | 发现 1 处（中） | F5（L83-91）；其余路由/已存在 dialog 守卫有效 |
| 105 | `src/utils/cycleModel.test.ts` | 4 | 发现 1 处（低） | F13（L20-22 fixture） |
| 106 | `src/utils/dictationActions.test.ts` | 4 | 干净 | 开/停/可见性优先/无控件四种行为断言有效 |
| 107 | `src/utils/editorUtils.test.ts` | 5 | 发现 1 处（低） | F14（L37-42） |
| 108 | `src/utils/fetchInterceptor.test.ts` | 7 | 干净 | 生命周期/透明性/隔离性断言强；L110-124 的 mock-only 形式见 §5（有效） |
| 109 | `src/utils/geminiDom.test.ts` | 2 | 干净 | 受控 menu 与“新增 dialog”两断言有效（覆盖较薄但不无效） |
| 110 | `src/utils/library/mediaCache.test.ts` | 5 | 干净 | 前缀边界/歧义/合并/上限/TTL 均为行为断言 |
| 111 | `src/utils/library/mediaParser.test.ts` | 4 | 发现 1 处（中） | F6（L35-39） |
| 112 | `src/utils/streamGenerate.test.ts` | 7 | 干净 | 分片解码/端点/请求/帧/超限恢复均有效，期望来自抓包 |
| 113 | `src/utils/stuffMediaParser.test.ts` | 24 | 发现 3 处（高 1 / 中 1 / 低 1） | F1（L37-41）、F2、F12；另 request 类用例与 source-path 单测重复（§4） |
| 114 | `src/utils/toolboxActions.test.ts` | 9 | 发现 2 处（中 1 / 低 1） | F4（L146-156、L216-221）；其余图标/可见性/portal 等待断言有效 |
| 115 | `src/utils/xhrInterceptor.test.ts` | 2 | 干净 | 转发与分段进度是协议本身，断言有效（见 §5） |
| 116 | `stuff-page/buttonInjector.test.ts` | 4 | 干净 | 通读 |
| 117 | `stuff-page/libraryIsland.test.ts` | 11 | 发现 1 处（低 L8） | 通读；真实 fixture 驱动，主力断言有效 |
| 118 | `stuff-page/navigation.test.ts` | 5 | 干净 | 通读 |
| 119 | `top-bar-action/index.test.ts` | 12 | 发现 2 处（中 M4、低 L12） | 通读；observer/重建/清理用例有效 |
| 120 | `top-bar-customization/index.test.ts` | 9（5 it + 4 it.each） | 发现 1 处（高 H2） | 通读；竞态/默认值用例有效 |

## 附录 B：耗时基线（审计前实测）

| 场景 | Vitest Duration | 墙钟 |
| --- | --- | --- |
| 全量第 1 次 | 24.10s（transform 3.87s / import 18.36s / tests 36.64s 并行累加） | 24.43s |
| 全量第 2 次 | 23.60s | 23.93s |
| 排除 `folder-performance.test.ts` | 8.83s（932 用例） | 9.14s |
| 仅跑 `folder-performance.test.ts` | 18.97s（14 用例） | 19.28s |

- 全量 120 文件 / 946 用例，两次均全绿。
- `folder-performance.test.ts` 的 `5 folders × 10000 chats` 单用例约 12.2s，是绝对关键路径；其余 931 个用例并行下不到 9s。
- 本报告建议的删除/合并主要减少维护成本与假绿风险，对 24s 总时长影响很小；若要提速应单独治理该性能测试（拆 `test:perf` 或缩小规模）。
- 环境：macOS 15.7.7 / Apple M4 Pro 12 核 / Node v22.14.0 / Vitest 4.0.18 + happy-dom。
