# Follow-up 多选区与评论：技术方案

创建：2026-10-20；更新：2026-10-22。状态：代码实现与本地回归完成，原生交互待人工验收。
需求与界面结构说明：[multi_ask_comment.md](./multi_ask_comment.md)。以下保留设计约束；实际验证与实现边界见第 10 节。

## 1. 架构与约束

采用一个页面内控制器管理当前会话的有序选区，两个展示层消费同一份数据：Chakra Quick Comment、原生卡片及评论编辑浮层。协议解析/序列化为纯函数。

不新增数据库、后台逻辑、草稿同步、新 Zustand Store、通用状态机或消息发送框架。现有 `quickFollowStore` 继续只管理开关和自定义 Prompt。局部操作直接调用控制器方法；会话变化继续订阅现有 `eventBus` 的 `chatchange`。

必须保持：

1. 卡片及隐藏前缀由同一个草稿生成；主输入框正文始终由 Gemini 管理，不因添加或编辑卡片而重建。
2. 卡片 ID 稳定，序号由数组位置计算；无视觉截断进入发送文本。
3. 已发送消息卡片只读，不创建编辑、关闭按钮。
4. 发送按钮点击成功不等于提交成功；只根据对应的新用户消息确认结果。
5. 同一会话最多一个待确认发送记录、一份单独发送草稿快照、一个 Quick Comment；全文、评论编辑和快捷 Prompt 选择浮层互斥。

需求第 4 节交互已确认：Add 保存后关闭评论框、允许空评论、退出时保留 Quick Comment 暂存、删除关联评论并重新编号、横向卡片与限高滚动、平台快捷键、允许重复选区、最多 10 张卡片、仅当前会话内存草稿。自定义 Prompt 无卡片时保持一键发送，有卡片时提供“加入草稿 / 单独发送”；协议转义、编辑浮层点击外部等同 Cancel、单独发送异常保留与安全恢复规则均已确认，总字符数阈值尚未确定。

## 2. 文件结构

以下是目标结构；只迁出 Follow-up 相关代码，不重构旧文件中的 Chat Outline。

```text
src/entrypoints/content/
├── quick-follow-up/                 # 新增，页面运行逻辑
│   ├── controller.ts               # 草稿、选择、发送确认及单份临时草稿恢复
│   ├── protocol.ts                 # 类型、序列化、解析、新旧格式兼容
│   ├── dom.ts                      # Gemini DOM 解析、前缀更新、来源锚点
│   ├── cards.ts                    # 原生卡片、全文/编辑浮层、历史渲染
│   ├── style.css                   # gpk-follow-* 作用域、明暗主题
│   ├── protocol.test.ts
│   ├── controller.test.ts
│   ├── controller.lifecycle.test.ts # 实际卡片、输入框及生命周期回归
│   ├── cards.test.ts               # 卡片、编辑及历史消息回归
│   └── dom.test.ts                 # 已捕获输入框与消息 DOM 契约
├── overlay/quick-follow-up/
│   ├── index.tsx                   # 修改，持有控制器、胶囊/评论切换
│   ├── QuickComment.tsx            # 新增，Chakra 单行/多行评论输入
│   └── QuickComment.test.ts        # 快捷键与输入法边界
├── overlay/index.tsx               # 修改，返回 React root 卸载函数
├── overlay/index.test.tsx          # React 卸载及重复清理回归
├── index.tsx                       # 修改，失效/移除 UI 时调用卸载函数
└── lagecy/
    ├── content.ts                  # 删除旧 Follow-up 所有权，接入大纲摘要
    └── style.css                   # 删除已迁移且不再使用的引用样式

src/common/event.ts                 # 移除仅供旧 Follow-up 使用的三个局部事件
src/components/quick-follow/
├── capsule-bar.tsx                 # 修改，Chakra 就地选择浮层，两个操作回调
└── action-button.tsx               # 修改，转发浮层触发 props 和 ref 至真实 DOM
src/locales/*.json                  # 仅必要新增文案，由 i18n-writer 子代理处理
docs/feature/quick_follow_up/
├── multi_ask_comment_tech.md        # 本文
└── multi_ask_comment.validation.mjs # 可运行设计实验，不被扩展打包
```

复用 `CapsuleBar`、`Tooltip`、既有 tippy.js，沿用点击原生发送按钮的方式并验证当前输入框及按钮状态；不新增依赖。`cards.ts` 不依赖 React 或 Chakra。`dom.ts` 不依赖控制器；`protocol.ts` 不依赖 DOM。

## 3. 数据与生命周期（controller.ts）

```ts
// 数据类型放在 protocol.ts；DOM 来源类型放在 dom.ts。
type SelectionItem = {
  id: string
  revision: number
  selectedText: string
  comment: string
  commentDraft?: string // Quick Comment 暂存；空字符串也有意义
  anchor?: QuoteAnchor // 每条独立，沿用现有偏移/上下文定位算法
}
type UI =
  | { mode: 'closed' }
  | { mode: 'capsule'; candidate: Candidate; hasDraftCards: boolean }
  | { mode: 'comment'; selectionId: string; position: Position }
type Attempt = {
  kind: 'follow-up' | 'custom' // 快捷消息提交不能清理原 Follow-up 草稿
  scope: string
  raw: string
  versions: Array<{ id: string; revision: number }>
  baselineQueries: WeakSet<Element> // 发送前已存在的消息，不能用于确认
  phase: 'waiting' | 'unknown'
}
type DraftBackup = {
  scope: string
  items: SelectionItem[] // 独立副本，含 commentDraft 和来源锚点
  editorState: EditorDraft // dom.ts 验证过的原生正文/格式与光标快照
  submitted: boolean
  cleared: boolean
}

createFollowUpController(onUIChange) {
  // 闭包内：items、ui、pendingAttempt、当前 chatWindow 和清理函数。
  start() // 绑定现有开关、chatchange、发现 chat-window，初始历史扫描
  add(candidate) -> Result<selectionId>
  changeQuickComment(id, value) // 更新 draft、revision，并同步隐藏前缀
  addComment(id)               // 允许空评论；draft 提交为 comment，关闭且不发送
  saveComment(id, value)       // 原生编辑器 Save，更新该条并移除 draft
  remove(id)                  // 关闭关联浮层，删除该条，重新编号
  hasDraftCards() -> boolean   // items.length > 0，与评论是否为空无关
  appendPrompt(prompt, candidate) -> Result // 保留前缀，仅追加主正文
  sendPromptSeparately(prompt, candidate) -> Result // 单份快照、提交及恢复
  requestSend() -> Result
  stop()                      // 幂等清理订阅、观察器、计时器、前缀及自有 UI
}
```

Add 时先检查 `items.length < 10`，再解析唯一输入框并确认可写；已满时拒绝新增并提示，原条目、评论、正文和前缀保持不变。前缀同步失败则回滚本次变更，保留选区候选并提示失败。不要先展示成功卡片再无声丢失发送数据。

普通 hide、Esc、点击外部只改变浮层状态，保留 Quick Comment 暂存。原生编辑浮层使用独立临时值，已确认 Cancel / Esc / 点击外部均取消本轮编辑，保留原评论；Save 才写回控制器。

新划词出现时也保留上一条 Quick Comment 暂存，切回胶囊；重复文本仍创建独立条目，不按文本去重。删除条目连同其评论及暂存一起删除。刷新不恢复草稿。

`stop()`、关闭功能、真实切换会话会清理草稿；普通消息移除、折叠或历史懒加载不能触发草稿清空。编辑器在同一会话重建时保留草稿并重新解析输入框，无法唯一定位则暂停写入。首条消息导致新会话 URL 分配时，只有待发送消息匹配才能迁移 scope 并确认，不能无条件沿用 `isFromNewChat`。

**已确认：本期保留线上空哨兵机制；阻止删除隐藏节点留作后续探索。** 目标是正文到达引用边界后，连续退格逐张移除末尾卡片，而非一次清除全部。最后一张删除时只清理自有隐藏内容及 UI，保留原生正文。清空正文、撤销、编辑器替换与发送清空仍需区分，不能统一视为用户删除卡片。

**多哨兵候选方案，尚未真机验证：** 一个选区对应一个空哨兵，按稳定 ID 关联，不按显示编号或 MutationRecord 数量删卡片。协议标题不独立占用哨兵；两张卡片只需两个删除步骤。一个编辑器共用一个观察器，不新增模块或每卡片观察器。逻辑排列如下，具体节点布局以原生编辑器实验为准：

```text
Selected text 标题
Selection A + comment → 空哨兵 A
Selection B + comment → 空哨兵 B
My request 标题（当前固定；条件插入见下方候选方案）
用户正文
```

```ts
onEditorMutations(batch) {
  // 待整批变更完成后读最终状态；自有写入需记录预期节点变更。
  if (isOwnedMutationBatch(batch)) return
  if (isSendingOrReplacingEditor()) return handleLifecycleChange()
  const missingIds = findMissingSentinelsInCurrentEditor()
  // 仅已确认的用户删除路径；状态不明先保留草稿，不按节点数猜测。
  if (!isVerifiedUserDeletion(batch)) return reconcileWithoutDiscardingDraft()
  removeSelectionsByStableIds(missingIds)
  reconcileOwnedPrefixAndCards() // 重编号、共享标题随剩余选区更新
}
```

`isVerifiedUserDeletion` 是待验证契约，不能仅靠观察器实现归因。多个隐藏空节点不保证一次 Backspace 只删除一个；需验证从正文末端退格时先 B 后 A，且不会连带删除其他块。若原生编辑器一次移除多个哨兵，须记录该行为并重新讨论，不能声称逐张删除已实现。全选删除、撤销/重做的产品边界仍待确认。自有写入标记必须覆盖异步观察器回调，不能用写入前后瞬时布尔值规避。

**条件插入 My request（讨论中，未替代第 4 节协议基线）：**

```ts
syncRequestHeading() {
  const body = readNativeRequestExcludingOwnedNodes()
  const hasRequest = body.trim().length > 0 // 只判空，不裁剪正文
  setOwnedRequestHeading(selections.length > 0 && hasRequest)
}
```

通过原生 `input` 监听输入、粘贴与删除；输入法组合期间避免重写编辑器，组合结束再同步。“加入草稿”、草稿恢复等自有写入在完成后显式同步。标题更新属于自有变更，不触发删卡片。只读取可见正文，排除隐藏原文、评论、标题和哨兵；不把编辑器占位 `<br>` 当正文。

若采纳，序列化在无正文时省略请求标题；解析器需允许最后一个 Selection 在文件结尾结束，并返回空主请求，同时仍支持已有带空请求标题的消息。保留现有评论转义与结构间隔，不能把无标题尾部猜成主请求；其他结构不合法仍保留原文。补充空正文、有正文、清空、撤销、输入法和程序追加的协议往返及实际发送验证后再定案。

单独发送临时移除前缀属于控制器自有操作，不触发上述清空规则。暂存快照最多一份；恢复并读回验证成功后释放，或由用户明确放弃、页面卸载时清理。不建立跨会话草稿缓存；切换会话暂停恢复并保留这一份暂存，只有回到来源会话且确认安全才允许恢复，不能将其写入新会话。

草稿不按会话累计缓存。卡片容量已确认为最多 10 张；协议文本合计 100,000 个 UTF-16 code unit 仍仅是待确认的字符数建议，不作为已采纳限制。数量超限拒绝本次变更并提示，不截断原文。

## 4. 协议（protocol.ts）

沿用需求中的英文 Markdown 标题，以下精确语法及转义约定已确认采用：

- 换行统一为 LF；不对内容调用 `trim()`，保留空行和空格。
- 文本开头必须为 `# Selected text:\n\n`；Selection 编号连续，从 1 开始，至少一条。
- 原文每行编码成 `> ${line}`，空行编码成 `>`。首个普通空行终止引用块。
- 评论中独占一行的 `## Selection N`（正整数）及 `## My request:` 加一个前导反斜杠；原本以反斜杠开头的行同样加一个。解码只撤销这两类约定。
- 评论结尾统一追加 `\n\n` 作为结构间隔，解析仅移除该间隔，保留评论自身尾随换行。
- `## My request:\n` 之后全部是主请求，不再识别内部标题；主请求允许为空。
- 不符合完整语法则返回 null，保留原始展示。用户手写相同协议也会匹配，不额外添加来源标记。

```ts
effectiveComment(item) = item.commentDraft ?? item.comment

serializePrefix(items): string {
  if (items.length === 0) return ''
  return '# Selected text:\n\n' + items.map((item, i) =>
    `## Selection ${i + 1}\n` + quoteEveryLine(item.selectedText) +
    '\n\n' + escapeComment(effectiveComment(item)) + '\n\n'
  ).join('') + '## My request:\n'
}

parseMessage(raw): ParsedMessage | null {
  // 按行游标扫描，不用跨整条消息的宽泛正则。
  requireHeader()
  while (nextLineIsExpectedSelection()) {
    readNonemptyQuoteBlock() // 原文可有空行，但必须至少有一行引用
    requireBlankLine()
    readCommentUntilUnescapedReservedHeading()
    removeOnlyFramingSeparatorAndDecode()
  }
  requireAtLeastOneSelectionAndMyRequest()
  return { selections, request: allRemainingLines() }
}

parseDisplayMessage(raw, legacyPrefix) {
  return parseMessage(raw) ?? parseLegacyQuote(raw, legacyPrefix)
}
```

旧格式解析保留现有本地化前缀与分隔符规则，不追溯改写数据。示例协议的可执行原型在验证脚本中；正式实现应共用生产协议函数运行测试，避免维护两份长期实现。

## 5. 页面适配与前缀（dom.ts）

已有样本：`docs/dom/input.html` 与 `docs/dom/origianl-chat.html`。所有 Gemini 查询集中到本文件，候选契约分别验证；命中零个或多个返回失败，不回退到全页面随意取第一个。历史样本已包含旧插件转换结果，不能据此推断所有现代消息形态。

```ts
resolveInput(chatWindow) -> { editor, richTextarea, sendButton } | null
readRequest(editor) -> string // 排除自有前缀，保留换行，不用 getEditorContent().trim()
appendRequestText(input, text): Result // 保存原正文与前缀，仅追加换行和纯文本
captureEditorDraft(input) -> Result<EditorDraft> // 不能仅用 innerHTML 复制内部状态
restoreEditorDraft(input, snapshot): Result // 同步原生模型并读回核验
isSubmissionClearComplete(input) -> boolean // 真实页面验证的完成信号，不是瞬时空值
readRawQuery(userQuery) -> string // 排除自有展示节点，读取原始消息行
captureCandidate(range, messageContent, scope) -> Candidate | null
resolveSource(anchor) -> Range | null // 无法唯一定位就不跳转，不猜测来源

writePrefix(input, prefix): Result {
  // 维护一组自有前缀节点及空哨兵；无选区则移除整组。
  // 节点仍在 Gemini 编辑器内，不可编辑、视觉隐藏；卡片在编辑器外。
  if (ownedPrefixAndSentinelsMatch(prefix)) return ok()
  preserveNativeSelection()
  reconcileOwnedPrefixWithPlainTextAndSentinels(prefix)
  notifyEditorUsingVerifiedContract()
  restoreNativeSelection()
  return verifyPrefixAndRequestUnchanged()
}
```

**沿用当前项目隐藏引用承载机制。** 现有 `addQuoteUI` 已将隐藏 `<p>` 放入编辑器；根据用户对当前功能的说明，该机制已用于实际发送，本方案不再将其本身视为待确认可行性。本轮未新增真机验证，既有行为与新协议的回归证据分别记录。

`notifyEditorUsingVerifiedContract` 指复用现有实际生效的更新路径，不预先假设额外派发 `input` 就能解决所有同步问题。实现时回归多卡片、长文本、评论修改、空主请求及原生输入/撤销/粘贴，确认新协议完整且仅发送一次；不使用网络改包、私有编辑器对象或多套猜测回退。

Quick Comment 每次输入即更新 `commentDraft` 并同步有效评论，因此用户直接按 Gemini Enter 或点发送时也能带上内容，不依赖最后瞬间拦截并重建全文。原生编辑浮层未 Save 的临时值不进入前缀。

## 6. 卡片、浮层与历史（cards.ts / style.css）

```ts
mountDraftCards(input, callbacks) -> { render(items), destroy() }
buildCard(item, { readonly, index }) -> HTMLElement {
  // 原文最多 3 行，评论最多 2 行；全文只写 textContent。
  // readonly 时根本不创建编辑、关闭按钮。
  // onEdit / onRemove 回调以稳定 ID 为参数，不能使用当前序号。
}
openFullContent(card, item) // tippy interactive，原生内容，滚动最大高度
openCommentEditor(card, item) {
  closeFullContent()
  // tippy 原生表单：只读原文 + textarea + Cancel / Save
  // Save 调 callbacks.save(id, textarea.value)，失败保留编辑状态。
  // 同时最多一个，优先上方，空间不足翻转；销毁后焦点回到触发按钮。
}
renderHistory(userQuery) {
  raw = readRawQuery(userQuery)
  if (raw === previousRaw && ownedViewIsIntact()) return
  parsed = parseDisplayMessage(raw)
  if (!parsed) return restoreOriginalView()
  // 原始行保留，记录原 display 值；只隐藏被成功解析的行。
  // 添加独立 gpk-follow-history 容器：只读卡片 + 主请求。
  // 不给自有主请求添加 Gemini 的 query-text-line 类，避免重复读取。
  // 原始行变化时重读重建；不能只设一个永久 transformed 标记。
}
getOutlineSummary(userQuery) {
  // 与历史展示共用解析；主请求优先，其次首条非空评论、首段原文。
  // 返回 questionText / quoteText / selectionCount，供现有大纲使用。
}
```

卡片预览用 `line-clamp`，不实际截短字符串；无评论/有评论分别固定高度，横向溢出滚动。全文浮层使用 `white-space: pre-wrap`、`max-height: min(50vh, 360px)` 和 `overflow: auto`，支持移入、聚焦及 Esc。tippy 的触发节点是实际 DOM 按钮，避免锚点丢失。

输入框和历史同用一个卡片构建函数、作用域样式和主题变量。复用 Cancel 的 `common.cancel`、Save 的 `settings.quickFollow.editModal.save`。新增标签和错误提示在实现阶段交由项目 i18n-writer 处理。

控制器只批处理受影响的 `user-query`；观察 `childList` 与 `characterData`，过滤自有子树变更，比较后再写，队列在本轮处理后清空。每条消息的展示状态使用 WeakMap；当前浮层销毁时调用 tippy.destroy，不常驻缓存所有历史内容。

保留原文不等于复制和编辑已验证。必须测试 Gemini 原生复制/编辑；若读取可见 DOM 而非内部消息模型，需在已观察的原生操作入口恢复原文，再于操作结束重绘，不能凭猜测新增按钮选择器。用户手动编辑历史消息时不再套用旧解析缓存。

来源回跳按条目保存锚点；发送确认时把对应锚点附到该消息的展示状态，未确认消息不能消费锚点。刷新后的新协议消息没有来源信息，只提供卡片阅读，不伪造可跳转状态。

## 7. React 浮层（index.tsx / QuickComment.tsx）

```tsx
function QuickFollowUp() {
  const [ui, setUI] = useState<UI>({ mode: 'closed' })
  const controller = useRef<Controller | null>(null)
  useEffect(() => {
    const instance = createFollowUpController(setUI)
    controller.current = instance
    instance.start()
    return () => { instance.stop(); controller.current = null }
  }, []) // StrictMode 的 start/stop/start 必须不产生重复绑定

  return ui.mode === 'capsule' ? <CapsuleBar
    hasDraftCards={ui.hasDraftCards}
    onRunPrompt={prompt => runCustomPrompt(prompt, ui.candidate)}
    onAppendPrompt={prompt => controller.current.appendPrompt(prompt, ui.candidate)}
    onSendSeparately={prompt => controller.current.sendPromptSeparately(prompt, ui.candidate)}
    onAsk={() => controller.current.add(ui.candidate)} // 成功才切换 comment
  /> : ui.mode === 'comment' ? <QuickComment
    onChange={value => controller.current.changeQuickComment(ui.selectionId, value)}
    onAdd={() => controller.current.addComment(ui.selectionId)}
    onSend={() => controller.current.requestSend()}
  /> : null
}

onCommentKeyDown(event) {
  if (event.isComposing || event.nativeEvent.isComposing) return
  if (event.key !== 'Enter' || event.shiftKey) return
  event.preventDefault()
  if (isPlatformSendModifier(event)) onSend()
  else onAdd()
}
```

Quick Comment 使用 Chakra `Textarea` 与真实 DOM 操作按钮。输入后按 scrollHeight 调整高度，最大高度后内部滚动；布局预留按钮位置，单行居右，多行右下。使用实际浮层尺寸做视口内定位，不沿用固定 60px 估高。Tooltip 保持在现有 Shadow DOM portal 容器内。

`isPlatformSendModifier` 在 macOS 判断 Command，在 Windows / Linux 判断 Ctrl；快捷键提示使用相同平台判断。Send 提交所有选区的有效评论及主请求，允许评论和主请求为空。

关闭判断基于 composedPath 内的自有根节点，不能沿用“目标不在旧胶囊即关闭”的逻辑。评论框被聚焦时不要让划词检测把其内部文字识别为新选区；候选 Range 的两端都必须属于同一 Gemini message-content。

捕获原文使用 `range.toString()`，仅用 `text.trim().length` 判断是否为空，不将 trim 后的内容写回条目，避免选中文本与来源偏移不一致。

自定义 Prompt 规则已确认：无卡片时一键发送；有任意待发送卡片时点击对应按钮，在旁边打开 Chakra Popover，提供“加入草稿 / 单独发送”。关闭浮层不操作，不增加设置、不记录偏好。点击时用最新条目数判断；若选择期间草稿状态变化，关闭旧选择并重新校验，不能用过期候选执行操作。

浮层直接放在 `CapsuleBar` 内，不另建选择管理服务。`hasDraftCards` 默认 false，设置页预览不绑定页面草稿；按钮的 click / Enter / Space 行为一致。Popover 触发 props 和 ref 必须由 `ActionButton` 转发至实际 DOM，Portal 留在现有 Shadow DOM；Escape / 点击外部关闭，焦点返回触发按钮。新增操作文案由 i18n-writer 处理。

```ts
onPromptActivate(prompt, candidate, anchor) {
  if (controller.isBusy()) return
  if (controller.hasDraftCards()) return openChoice(prompt, candidate, anchor)
  return runExistingTemplateFlow(prompt, candidate)
}
appendPrompt(prompt, candidate) {
  requireSameScopeAndIdle()
  text = expandExistingTemplate(prompt, candidate.text)
  // 保留已输入内容和原生模型，只在末尾追加；不调用覆盖全文的 insertTextToEditor。
  return appendRequestText(resolveInput(), text)
}
```

“加入草稿”仅在原正文非空时插入分隔换行；模板变量照常替换为本次原文，不额外创建卡片，不转换为 Comment。追加失败不得破坏原正文。

## 8. 发送与确认（controller.ts）

```ts
prepareAttempt(): Result<Attempt> {
  requireUniqueInputAndReadySendButton()
  requirePrefixMatchesCurrentEffectiveComments()
  return ok({ kind: 'follow-up', scope, raw: serializePrefix(items) + readRequest(editor),
              versions: items.map(idAndRevision), baselineQueries: currentQueries(),
              phase: 'waiting' })
}
requestSend() {
  if (attempt?.phase === 'waiting') return busy()
  // 同步保存当前 Quick Comment；原生编辑浮层未保存的内容不提交。
  prepared = prepareAttempt()
  if (!prepared.ok) return notifyFailureKeepingDraft()
  attempt = prepared.value
  // sendMessage 只是触发原生按钮；捕获监听识别本次程序调用，不再重复准备。
  ownSendInProgress = true
  result = sendMessage(currentChatWindow)
  ownSendInProgress = false // 正式实现用 finally 保证复位
  if (!result.success) { attempt = null; return failureKeepingDraft() }
  startBoundedConfirmationTimer()
}
onNativeSendIntent(event) {
  // 仅监听已解析的发送按钮 click 和编辑器无组词、无 Shift 的 Enter。
  // 不再合成第二次 click，不吞原生正常发送，不把 Stop 当 Send。
  if (ownSendInProgress) return
  if (!items.length && !attempt) return // 无 Follow-up 草稿的普通发送沿用原行为
  if (attempt?.phase === 'waiting') return preventDuplicateIntent(event)
  prepared = prepareAttempt()
  if (!prepared.ok) {
    preventThisSend(event) // 前缀不同步时不能放行不完整消息
    return notifyFailureKeepingDraft()
  }
  attempt = prepared.value
  startBoundedConfirmationTimer()
}
onQueryChanged(query) {
  renderHistory(query)
  if (!attempt || attempt.baselineQueries.has(query)) return
  if (!sameScopeOrVerifiedNewChatTransition(query)) return
  if (normalizeLF(readRawQuery(query)) !== attempt.raw) return
  if (attempt.kind === 'custom') {
    if (!backup) return clearAttemptAndTimer()
    backup.submitted = true
    return tryRestoreCustomDraft() // 不消费原选区锚点、不清理原草稿条目
  }
  attachMatchingAnchors(query)
  // 只删除发送快照中 ID 和 revision 均未改变的条目，保留新条目和后续修改。
  removeAcknowledgedVersions()
  clearAttemptAndTimer()
  // 不覆盖主输入框；仍有较新草稿时，待原生提交清空完成后再挂载前缀。
}
onConfirmationTimeout() {
  attempt.phase = 'unknown' // 保留一个快照、保留草稿并提示；不自动重发
  // 允许晚到的同消息确认；用户明确重试时才替换此快照。
}
```

原生发送意图不能证明 Gemini 消息已提交，DOM 精确匹配也不能证明服务端生成成功。这里确认的是对应用户消息已经展示提交。消息文本若被 Gemini 规范化，必须用真实样本确定允许的变化；不得先用 `trim()` 或去空白比较放宽匹配。

等待确认时禁用卡片变更入口，降低竞态；版本检查仍作为防线。主输入框不锁定。旧前缀被清除但未确认时不立即自动重插，防止再次进入正在提交的编辑器；确认失败后恢复需要检查输入框状态并显式提示。限时检查只用于报告不确定状态，不把“超时”作为成功依据。

### 自定义 Prompt 单独发送与恢复

复用同一个控制器和发送观察器，只增加一次操作对应的一份暂存。不在消息历史中存草稿，不新增通用事务/恢复框架。

```ts
sendPromptSeparately(prompt, candidate) {
  requireSameScopeAndIdleAndSafeEditorContract()
  backup = captureCompleteDraft() // 先成功取得选区、评论/暂存、正文及原生状态
  lockDraftInteraction() // 本操作期间也保护主输入框，防止恢复覆盖用户新输入
  attempt = prepareCustomAttempt(expandExistingTemplate(prompt, candidate.text))
  // 原 items 留在内存，仅暂停前缀同步、临时隐藏卡片并替换编辑器内容。
  if (!replaceWithOnlyCustomMessage(attempt.raw)) return restoreAfterKnownFailure()
  ownSendInProgress = true
  result = sendMessage(currentChatWindow)
  ownSendInProgress = false // 正式实现用 finally 保证复位
  if (!result.success) return restoreAfterKnownFailure()
  startBoundedConfirmationTimer()
}
onEditorSubmissionClearChanged() {
  if (!backup) return
  backup.cleared = isSubmissionClearComplete(resolveInput())
  tryRestoreCustomDraft()
}
tryRestoreCustomDraft() {
  if (!backup?.submitted || !backup.cleared) return
  if (!sameOriginalScope() || !editorSafeToRestore()) return retainBackupAndNotify()
  if (!restoreEditorDraft(backup.editorState).ok) return retainBackupAndNotify()
  renderOriginalItemsAndPrefix(backup.items)
  if (!verifyRestoredDraft()) return retainBackupAndNotify()
  releaseBackupAndAttempt()
  unlockDraftInteraction()
}
```

对应用户消息出现和编辑器完成清空可能先后顺序不同，两个信号齐备后恢复，不等待模型回答结束。不能仅凭“按钮点击成功”、一次空 DOM 或固定延时回填；需要验证 Gemini 原生编辑器的提交/清空完成契约，避免迟到的清空再次删除草稿。

**异常恢复规则已确认：** 明确未发出的失败走安全回滚；若可能已经提交但未确认、清空超时或无法恢复，则保留单份暂存并提示，不自动重发、不覆盖新内容，也不继续占用全页面交互。停止操作时解除临时输入保护，显式恢复仍须重新检查安全条件。不要把原草稿恢复后的再次发送误认为对快捷消息的重复确认。

实施前还需验证原生富文本、附件/提及等状态能否安全隔离：原草稿的这些内容不能跟随快捷 Prompt 发出。仅复制纯文本或 DOM 不能证明保留了原生状态；不支持安全暂存/隔离时，该路径应返回失败并保留草稿，不猜测编辑器内部 API。

## 9. 旧路径迁移与落地顺序

1. 复用现有隐藏引用发送路径并回归新协议；优先验证单独发送的原生草稿隔离、提交/清空与恢复契约，无法通过则不进入该路径的完整实现。
2. 实现协议与控制器；迁出选区捕获、来源锚点、输入引用和历史转换，将空哨兵观察逻辑迁入控制器并适配逐卡关联，替换完成后删除旧 `addQuoteUI`、旧观察器、`pendingQuoteAnchor` 及三个局部事件的生产/消费路径，不移除哨兵能力。
3. 原生卡片、编辑浮层和 Chakra Quick Comment 接入同一个控制器。`renderOverlay` 返回卸载函数，由 content 生命周期调用，确保 React effect 执行清理。
4. 旧 body observer 只保留 Chat Outline 职责，移除其历史转换和“消息删除即 removeQuoteUI”逻辑；大纲统一读取 `getOutlineSummary`。
5. 控制器使用一个 body 发现观察器处理 chat-window 的出现/移除，忽略已有窗口内普通消息变化；一个当前窗口观察器处理编辑器重建与受影响消息。stop 时全部断开，不新增全局轮询。
6. 设置订阅只保留一个所有者；功能关闭清理待发送 UI、前缀和运行监听，恢复历史原文。恢复不触碰 Gemini 数据。

## 10. 实现边界与验证

生产代码已接入：多卡片及评论、协议往返、历史只读卡片、自定义 Prompt 双操作、逐卡片空哨兵、单份草稿恢复。旧 Follow-up 路径及三个局部事件已移除，Chat Outline 保留。未新增依赖、存储或后台模块。

实现边界：

- `## My request:\n` 仍固定存在；按正文条件插入及阻止删除隐藏节点留作后续探索。
- 当前 DOM 将协议文本集中到一个隐藏前缀，每个选区另配一个带稳定 ID 的空哨兵；删除对应哨兵后重新序列化剩余选区。标题没有独立哨兵。这与上文逻辑排列等价，但不证明原生 Backspace 每次恰好删除一个节点。
- 单独发送只接受捕获样本支持的纯文本编辑器及外围控件结构；富文本、提及、可疑附件或未知控件结构拒绝操作并保留草稿。DOM 检查不能证明 Gemini 内部附件状态为空，须人工核对实际页面与发送内容。
- 发送确认依赖新增用户消息的完整文本匹配及原正文清空两个信号；超时不自动重发、不覆盖新输入。暂存最多一份，跨会话不回填。
- 观察器限于当前编辑器、当前会话及 chat-window 发现；发送就绪观察器限于输入区域且有超时。关闭功能、会话解绑、React 卸载均回收观察器、订阅、浮层及计时器。

本地验证（2026-10-22）：

| 检查 | 结果 |
| --- | --- |
| `pnpm compile` | 通过 |
| Follow-up、Quick Comment 与 overlay 测试 | 46 项通过，覆盖协议、卡片、发送恢复、生命周期与键盘边界 |
| `pnpm test:run` | 75 个文件、525 项测试通过；另一个原有套件 `stuffMediaParser.test.ts` 因缺少 `.original/library/request.md` 无法加载，全量命令退出码为 1；实施前已存在 |
| `pnpm run check:i18n` | 通过 |
| `pnpm build` / `pnpm build:firefox` | 均通过 |
| `git diff --check` | 通过 |

既有设计脚本的 54 项断言仅是设计实验，不计入生产回归结果。构建和模拟 DOM 测试不代替以下真机检查。

人工验收（本次按要求不执行真机自动验证）：

1. 对照 PRD 第 2 节的页面结构、卡片层级及浮层关系说明，检查明暗主题、窄窗口、三行原文/两行评论截断、全文滚动、编辑浮层及单行/多行 Quick Comment；确认 Enter、Shift+Enter、平台发送快捷键和输入法。
2. 两卡从正文边界连续退格应先 B 后 A；检查全选删除、撤销/重做、最后一张删除及发送清空。若 Gemini 合并删除多个哨兵，记录原生行为后再调整，不以模拟 DOM 测试代替结论。
3. 核对实际发送原文：多卡片、长引用、转义、空主请求、隐藏前缀与空哨兵产生的换行；历史原生复制/编辑应保留完整内容。
4. 单独发送：原草稿不混入快捷消息，确认后恢复卡片/正文/光标；检查附件与提及拒绝、发送失败、晚确认、用户新输入、首次分配会话 URL 及切换会话。不得覆盖新内容或跨会话恢复。
5. Chrome / Firefox 分别检查输入框替换、功能开关及页面卸载，确认无重复卡片、残留浮层或持续监听。

## 11. 历史兼容修复（2026-10-23）

- P0：兼容第一版 `本地化前缀: 引用 + --------- + 请求`，包括九种既有语言、早期英文 `Regarding this`，不依赖当前界面语言。旧格式展示沿用第一版的首尾空白处理。
- 多选协议不变，继续严格校验编号、引用块、评论转义及请求标题；保留选区、评论和请求自身的缩进及空行，不把正文中的标题重新解析成结构。
- 兼容 Gemini 保存空正文消息时省略 `## My request:` 后的末尾空行：标题在文件末尾表示空请求，缺失标题或标题同一行混入正文仍拒绝解析。对应合成 DOM 夹具位于 `src/entrypoints/content/quick-follow-up/__fixtures__/history.html`。
- Chrome 实机验证确认两条选区及其评论会渲染为历史卡片，且不会显示额外正文占位；验证未发送新消息。
- 实页证据显示 Gemini 的文本插值在两个前后注释锚点之间添加一对空格。DOM 读取仅移除这层模板空格，不对多选正文逐行 `trim()`；对应的合成结构样例位于测试夹具中。
- 转换只隐藏原生消息行并添加展示视图，不改写消息原文。重复渲染、懒加载、节点复用、取消编辑及恢复原文均需保持可用。
- 展示层省略请求首尾的空白行，避免结构空行撑大卡片与正文间距；保留请求内部空行、正文行缩进和原始消息文本。空行可能来自隐藏前缀与原生段落的序列化边界，具体节点贡献尚未逐一验证。
- 已转换消息解除原生 96px 折叠上限，并隐藏原生展开按钮及渐变遮罩，避免裁掉 120px 卡片与请求正文。普通消息保留原生折叠行为。
- 普通追问的输入引用 UI 已按第一版改为随隐藏标记移除主动清理；历史文本匹配不再阻塞清理。单独发送后的草稿恢复仍要求匹配确认及清空信号。
- Chrome 实页已验证旧单引用、新多选历史、原生编辑完整原文及取消后恢复卡片；多选空正文、转义、多行、语言切换和节点复用由自动回归覆盖。Firefox 本次仅验证构建。
