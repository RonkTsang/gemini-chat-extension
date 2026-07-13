# Bulk Delete 技术方案

## 1. 模块归属
新增 content module：

```text
src/entrypoints/content/bulk-delete/
  index.tsx              # 模块启动/停止，入口 React mount
  BulkDeleteEntry.tsx    # header 右侧 LuTrash 入口
  dom.ts                 # Gemini DOM 查找、checkbox 注入、菜单插入
  deleteQueue.ts         # 串行删除流程
  style.css              # 主文档注入样式
  index.test.tsx
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

1. 将 row scroll 到可视区域。
2. hover row，显示更多操作按钮。
3. 找到 row 对应三点/更多按钮。
4. 点击菜单。
5. 在 overlay 中点击 Delete。
6. 在确认弹窗中点击确认 Delete。
7. 等待 row 从 DOM 消失或超时。

关键选择器降级：

```ts
const ACTIONS_MENU_BUTTON_SELECTORS = [
  'button[data-test-id="actions-menu-button"]',
  '[data-test-id*="menu" i]',
  'button[aria-label*="actions" i]',
  'button[aria-label*="menu" i]',
  'button[aria-label*="more" i]',
  'button[aria-label*="options" i]',
  'button[aria-haspopup="menu"]',
  'button.mat-mdc-menu-trigger',
]

const DELETE_MENU_BUTTON_SELECTORS = [
  'button[data-test-id="delete-button"]',
  '[data-test-id*="delete" i]',
  'button[aria-label*="delete" i]',
  '[role="menuitem"][aria-label*="delete" i]',
]

const CONFIRM_DELETE_BUTTON_SELECTORS = [
  'button[data-test-id="confirm-button"]',
  '[data-test-id="confirm-button"]',
  'button[aria-label*="confirm" i]',
  'button[aria-label*="delete" i]',
]
```

如果静态 selector 找不到更多按钮，则采用参考项目的评分策略：

- 命中 actions menu selector：加分。
- `aria-haspopup="menu"`：加分。
- 文案/属性包含 `more | menu | option | action`：加分。
- 文案/属性包含 `delete | share | copy | rename | pin | unpin` 且不含 menu 语义：扣分。
- 与 row 垂直中心距离越远，分数越低。

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

手动验证：

1. 打开 Gemini，确认 Chat header 右侧出现垃圾桶图标。
2. 点击图标，确认菜单在 Chat header 下方。
3. 勾选 checkbox 时页面不跳转。
4. pinned chat 不会被 `select unpinned` 选中。
5. 删除前有确认，确认后逐条删除。
