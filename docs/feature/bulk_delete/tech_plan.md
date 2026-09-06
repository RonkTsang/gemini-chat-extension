# Bulk Delete 技术方案

## 1. 模块归属
新增 content module：

```text
src/entrypoints/content/bulk-delete/
  index.tsx              # 模块启动/停止，入口 React mount
  BulkDeleteEntry.tsx    # header 右侧 LuTrash 入口
  dom.ts                 # Gemini DOM 查找、checkbox 注入、菜单插入
  deleteQueue.ts         # 串行删除流程
  deleteQueue.dom.ts     # 删除队列的 row/ActionButton DOM 契约与 resolver
  style.css              # 主文档注入样式
  index.test.tsx
  deleteQueue.dom.test.ts
```

在 `src/entrypoints/content/index.tsx` 中随 content script 启动：

- `startBulkDelete()`
- `ctx.onInvalidated(() => stopBulkDelete())`

## 2. Header 入口注入
首选插入点：

```css
side-navigation-content > div > div > infinite-scroller > expandable-section[storagekey="chats"][data-test-id="chats-expandable-section"] > button.expandable-section-header
```

注入结构：

```html
<div data-gpk-bulk-delete-entry-spacer>
  <div data-gpk-bulk-delete-entry-root></div>
</div>
```

样式要求：

```css
[data-gpk-bulk-delete-entry-spacer] {
  flex: 1;
  display: flex;
  justify-content: flex-end;
}

[data-gpk-bulk-delete-entry-root] {
  display: flex;
  align-items: center;
}
```

`BulkDeleteEntry` 使用 `react-icons/lu` 的 `<LuTrash />`。按钮采用 icon-only，`aria-label="Bulk delete"`。

入口注入策略：

1. `MutationObserver` 监听 `document.body`。
2. 找到 header 后，如果未注入，则 append 第一层 spacer。
3. 如果 Gemini rerender 导致入口丢失，下一轮 reconcile 重新注入。
4. stop 时卸载 React root 并移除 spacer。

## 3. 批量菜单
菜单插入在同一个 `button.expandable-section-header` 后方：

```html
<div data-gpk-bulk-delete-menu>
  <div data-gpk-bulk-delete-select-row>
    <button>Select latest 50</button>
    <button>Select unpinned</button>
  </div>
  <button data-gpk-bulk-delete-submit>Delete (0)</button>
</div>
```

菜单状态由 content module 内存维护：

```ts
interface BulkDeleteState {
  active: boolean
  selectedKeys: Set<string>
  deleting: boolean
}
```

不做持久化。刷新或离开页面后选择状态丢弃。

## 4. Chat item 与 checkbox
参考项目的主要选择器思路，收集 Gemini chat rows：

```ts
const CHAT_LINK_SELECTORS = [
  'conversations-list a[href^="/app/"]',
  'chat-history a[href^="/app/"]',
  '.chat-history a[href^="/app/"]',
  'bard-sidenav-content a[href^="/app/"]',
  'side-navigation-v2 a[href^="/app/"]',
  'side-navigation-content a[href^="/app/"]',
]
```

行元素解析：

1. 从 chat link 向上找最小可点击行容器。
2. 行容器必须包含一个合法 `/app/{conversationId}` link。
3. 排除入口、菜单、overlay、非历史导航项。
4. 用 normalized pathname 作为 conversation key。

checkbox 注入：

```html
<input
  type="checkbox"
  class="gpk-bulk-delete-checkbox"
  data-gpk-conversation-key="/app/..."
  aria-label="Select conversation"
/>
```

事件处理：

- `pointerdown`
- `mousedown`
- `click`

以上事件都必须 `stopPropagation()`，避免点击 checkbox 时触发 Gemini 会话跳转。

样式：

- chat row 标记 `data-gpk-bulk-delete-row="true"`。
- row 设置 `position: relative`。
- checkbox 绝对定位到左侧。
- chat 内容增加左侧 padding，为 checkbox 留空间。

## 5. 快捷选择
### 5.1 Select latest 50
对齐参考项目行为：点击后主动加载更多历史，而不是只处理当前已渲染 DOM。

核心流程：

1. reconcile 当前已渲染 checkbox。
2. 如果当前 chat rows 少于 50，定位 Gemini 侧栏历史滚动容器。
3. 将滚动容器滚到底部，触发 Gemini 加载更早的 chat。
4. 等待 loading spinner 消失。
5. 如果存在 Show more 按钮，则点击它并再次等待 loading spinner 消失。
6. 重复加载，直到收集到 50 个 chat rows，或确认到底/超时/加载失败。
7. 选择前 50 个 chat rows。
8. 更新 `Delete (number)`。

滚动容器定位参考项目的评分思路：

```ts
const CHAT_HISTORY_CONTAINER_SELECTORS = [
  'conversations-list',
  'chat-history',
  '.chat-history',
  '.chat-history-scroll-container',
  'bard-sidenav-content',
  'side-navigation-v2',
  'side-navigation-content',
  'div[role="list"]',
  '.conversations-container',
  '[data-test-id="conversations-list"]',
]
```

优先选择：

- 可滚动：`scrollHeight > clientHeight + 20`
- 内部包含 chat links 或 `conversations-list`
- 位于 Gemini sidenav/navigation 内
- 排除 main/chat-window 内容区

加载更多相关 selector：

```ts
const SHOW_MORE_SELECTORS = [
  '.show-more-button',
  'button[data-test-id*="show-more"]',
  'button[aria-label*="more conversations" i]',
  'button[aria-label*="show more" i]',
]

const LOADING_HISTORY_SELECTORS = [
  '[data-test-id="loading-history-spinner"]',
]
```

加载循环规则：

1. 每轮先 `reconcileChatCheckboxes()` 并检查数量。
2. `scroller.scrollTo({ top: scroller.scrollHeight - scroller.clientHeight, behavior: 'auto' })`。
3. 等待约 `600ms`，再等待 loading spinner hidden，最长约 `7s`。
4. 若 Show more 可见且可用，点击后再次等待 spinner hidden。
5. 记录上一轮 chat 数量和滚动位置；如果接近底部且数量连续 3 轮不增长，则停止。
6. 总循环设置上限，例如 24 轮或 30s，避免无限滚动。
7. 如果 Gemini 出现 `Couldn't load recent chats` / `Try reloading this page` 等加载失败提示，则停止并给出轻量 warning。

加载中禁用 `select latest 50` 按钮，并将按钮文案临时切换为 `Loading...`。加载完成或失败后恢复。

### 5.2 Select unpinned
pinned 判断基于 `.original/sidenav/pinned_chat_item.html` 与 `.original/sidenav/unpinned_chat_item.html` 的实际 DOM 差异。

首选信号：

- pinned chat 的 `<a href="/app/...">` 内部存在 trailing pin icon：
  - `.trailing-content mat-icon[data-mat-icon-name="push_pin"]`
  - `.trailing-content mat-icon[fonticon="push_pin"]`
- unpinned chat 的 `.trailing-content` 为空。

因此实现应优先在当前 chat row 内检查：

```ts
const PINNED_SIGNAL_SELECTORS = [
  '.trailing-content mat-icon[data-mat-icon-name="push_pin"]',
  '.trailing-content mat-icon[fonticon="push_pin"]',
  'mat-icon[data-mat-icon-name="push_pin"]',
  'mat-icon[fonticon="push_pin"]',
]
```

备选信号：

- `jslog` 的 `BardVeMetadataKey` 中，样本显示 pinned row 为 `["c_...", null, 1, 0]`，unpinned row 为 `["c_...", null, 0, 15]`。
- 该字段可作为 fallback 解析，但不作为首选，因为它是内部埋点数据，稳定性弱于可见 pin icon。

不要依赖 chat 标题、`aria-label` 中的自然语言或 actions menu 的 `pin/unpin` 文案来判断 pinned 状态。标题可变，菜单文案需要 hover/打开菜单后才可靠，且会受语言影响。

如果 row 命中 pin icon，则跳过。否则选中。

## 6. 删除队列
删除复用 Gemini 原生 DOM 交互，不调用内部 API。

单项删除流程：

1. 从入队 row 读取 conversation key。
2. 用 conversation key 重新解析当前唯一 row，避免持有 Gemini 重绘前的旧节点。
3. 将当前 row scroll 到可视区域。
4. 仅在当前 row 内解析唯一 ActionButton，并点击其内部原生 `button`。
5. 在 overlay 中点击 Delete。
6. 在确认弹窗中点击确认 Delete。
7. 等待 row 从 DOM 消失或超时。

本次最小改造只覆盖步骤 1–4；Delete menu item、confirmation dialog 和删除完成判断保持现状。

### 6.1 目标与安全边界

row 与 ActionButton 必须通过确定性链路关联：

```text
conversation key
  -> 当前唯一 row
  -> row 内唯一 Action trigger
  -> trigger 内唯一未 disabled 的原生 button
```

任意一步为空或出现多个候选时必须停止当前删除，不得扩大到 parent、sibling 或其他 row 继续猜测。

### 6.2 DOM 契约与选择器管理

row/ActionButton 选择器和纯 DOM resolver 集中维护在 `deleteQueue.dom.ts`，不内联到 `deleteQueue.ts` 的删除过程中。

当前已验证的选择器直接使用完整 CSS 字符串，不将一个复合选择器拆分后 `join('')`：

```ts
const CONVERSATION_ROW_SELECTOR =
  'gem-nav-list-item[data-test-id="conversation"][data-gpk-conversation-key]'

const CONVERSATION_LINK_SELECTOR = ':scope > a[href^="/app/"]'

const ACTION_MENU_TRIGGER_SELECTOR =
  'gem-icon-button[data-test-id="actions-menu-button"][aria-haspopup="menu"]'

const ACTION_MENU_BUTTON_SELECTOR = ':scope > button:not([disabled])'
```

选择器不依赖：

- `.visible` 或 `always-show-hovered-trailing-content` 等瞬时状态 class。
- `.hovered-trailing-content` 等用于布局或 hover 展示的 class 和 wrapper 层级。
- `aria-label` 或菜单文案等受语言影响的内容。
- `more_vert` 或 pin icon 等展示信号。
- 节点可见性或几何位置。

未来如果出现经验证的新 DOM 结构，改为维护“完整候选选择器”数组，并由 resolver 按优先级逐个尝试。不应使用逗号 union 混合多套结构，也不应为尚未出现的变化预先加入宽泛 fallback。

### 6.3 Row 解析

`findConversationRowByKey()` 从 `CONVERSATION_ROW_SELECTOR` 的命中结果中同时验证扩展注入的 key 和当前原生 link。row 必须只有一个直接子级的 `CONVERSATION_LINK_SELECTOR` 命中，且该 link 相对 `window.location.origin` 规范化后的 pathname 必须与 `conversationKey` 一致：

```ts
export function findConversationRowByKey(
  conversationKey: string,
  root: ParentNode = document,
): HTMLElement | null {
  const matches = Array.from(
    root.querySelectorAll<HTMLElement>(CONVERSATION_ROW_SELECTOR),
  ).filter((row) => {
    if (row.dataset.gpkConversationKey !== conversationKey) {
      return false
    }

    const links = row.querySelectorAll<HTMLAnchorElement>(CONVERSATION_LINK_SELECTOR)
    return links.length === 1
      && new URL(links[0].getAttribute('href') ?? '', window.location.origin)
        .pathname === conversationKey
  })

  return matches.length === 1 ? matches[0] : null
}
```

不使用标题、列表索引或几何位置消除歧义。dataset key 命中但原生 link 已指向另一会话、row 内零个或多个 conversation link、零个或多个同时通过双重校验的 row，均返回 `null`；这可避免 Gemini 复用 row 后 extension dataset 尚未 reconcile 时误删新会话。

### 6.4 ActionButton 解析

`findActionMenuButton()` 只查找当前 row 内的 DOM 契约。`row.querySelectorAll()` 已将范围限制在当前 row 的后代节点，因此 trigger 选择器不需要依赖 `.hovered-trailing-content` 或其直接子级层级：

```ts
export function findActionMenuButton(row: HTMLElement): HTMLButtonElement | null {
  if (!row.isConnected) {
    return null
  }

  const triggers = row.querySelectorAll<HTMLElement>(ACTION_MENU_TRIGGER_SELECTOR)
  if (triggers.length !== 1) {
    return null
  }

  const buttons = triggers[0].querySelectorAll<HTMLButtonElement>(ACTION_MENU_BUTTON_SELECTOR)
  if (buttons.length !== 1 || !buttons[0].isConnected) {
    return null
  }

  return buttons[0]
}
```

需删除的旧逻辑：

- `dispatchHover()` 及其固定延时。合成事件不能建立可信的 CSS `:hover` 状态。
- `addButtons()` 对 parent、previous sibling 和 next sibling 的扫描。
- `scoreActionButton()` 及文案、图标、几何距离评分。
- ActionButton 的 `isVisibleElement()` 门槛。当 row 范围和技术属性已唯一确定 trigger 时，隐藏状态不应否定节点身份。

菜单是否真正打开应在 `.click()` 之后验证，不应通过点击前的可见性推测。

### 6.5 过程代码

`deleteQueue.ts` 只负责串联 resolver 与原生交互：

```ts
const conversationKey = originalRow.dataset.gpkConversationKey
if (!conversationKey) {
  throw new Error('conversation key not found')
}

const row = findConversationRowByKey(conversationKey)
if (!row) {
  throw new Error('conversation row not found')
}

row.scrollIntoView({ block: 'center', inline: 'nearest' })

const actionButton = findActionMenuButton(row)
if (!actionButton) {
  throw new Error('actions menu button not found')
}

actionButton.click()
```

后续 Delete menu item 和 ConfirmButton 流程本次不做技术改造。

### 6.6 后续候选选择器的扩展规则

当且仅当已获得新版 Gemini DOM 样本并验证身份关系时，才增加完整候选：

```ts
const CONVERSATION_ROW_SELECTORS = [
  'gem-nav-list-item[data-test-id="conversation"][data-gpk-conversation-key]',
  // 仅在新 DOM 契约经验证后添加完整选择器。
]
```

resolver 按数组顺序逐个尝试，每个候选都独立执行“按 key 精确匹配且结果唯一”验证。一个候选出现多个同 key row 时应立即失败，不继续用更宽泛的候选消除歧义。

## 7. 运行与清理
执行删除时：

1. `deleting = true`，禁用菜单按钮。
2. 用 `AbortController` 支持取消或 teardown。
3. 队列串行，不并发。
4. 单项失败记录后继续下一项。
5. 全部结束后 reconcile 列表，清空已消失项选择。

stop/退出批量模式时：

- disconnect observers。
- unmount React root。
- remove menu。
- remove injected checkboxes。
- 移除 row 上的 `data-gpk-*` 标记和 padding 标记。

## 8. 测试
单元测试覆盖：

1. header 入口注入到指定 selector。
2. 菜单插入到 header 后方。
3. checkbox 注入不会重复。
4. checkbox click 不触发 row/link click。
5. `select latest 50` 最多选 50 个。
6. `select unpinned` 跳过 pinned rows。
7. `Delete (number)` 随选择变化。
8. 删除队列按顺序调用 DOM 操作，单项失败继续。
9. ActionButton 即使 `offsetParent === null` 也能通过 row 内唯一技术契约解析。
10. target row 的 ActionButton 隐藏、相邻 row 的 ActionButton 可见时，仍只返回 target row 内的按钮。
11. target row 无 ActionButton，但 parent 或 sibling 存在 ActionButton 时返回 `null`。
12. 同一 row 出现多个 trigger 时返回 `null`。
13. 原始 row 被重绘替换后，可根据 conversation key 解析到最新 row。
14. 同一 conversation key 出现多个 row 时返回 `null`。
15. dataset key 命中但原生 conversation link 已变更时返回 `null`；正常相对 href 可匹配。
16. 同一 row 出现多个原生 conversation link 时返回 `null`。
17. trigger 内部原生 button 为 disabled 时返回 `null`。
18. Action wrapper class 改名或增加一层 wrapper 后，仍能在当前 row 内解析唯一 trigger。

手动验证：

1. 打开 Gemini，确认 Chat header 右侧出现垃圾桶图标。
2. 点击图标，确认菜单在 Chat header 下方。
3. 勾选 checkbox 时页面不跳转。
4. pinned chat 不会被 `select unpinned` 选中。
5. 删除前有确认，确认后逐条删除。
