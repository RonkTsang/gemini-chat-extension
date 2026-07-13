# Bulk Delete

| **Document Version** | **V1.0** |
| :--- | :--- |
| **Feature Name** | Bulk Delete |
| **Issue** | [#25](https://github.com/RonkTsang/gemini-chat-extension/issues/25) |
| **Status** | Draft |

## 1. 背景
Gemini 原生历史列表缺少高效的批量清理能力。用户想删除临时对话时，只能逐个删除，或在已有批量选择能力中手动避开 pinned conversations。

本功能在 Gemini 左侧 Chat 区域增加轻量批量删除入口，支持快速选择最近对话或未置顶对话，再复用 Gemini 原生删除流程逐个删除。

## 2. 目标
1. 在 Chat 标题右侧提供一个紧凑的批量删除入口。
2. 点击入口后进入批量选择模式，每个 chat item 显示 checkbox。
3. 提供两个快捷选择：
   - `select latest 50`
   - `select unpinned`
4. 删除按钮显示已选数量：`Delete (number)`。
5. 删除流程串行执行，避免误删 pinned conversations。

## 3. 入口
入口注入到左侧导航栏 Chat 区域标题的最右侧。

目标 header：

```css
side-navigation-content > div > div > infinite-scroller > expandable-section[storagekey="chats"][data-test-id="chats-expandable-section"] > button.expandable-section-header
```

插入结构：

1. 第一层 `div`：入口容器，`flex: 1`，内部右对齐。
2. 第二层 `div`：真实入口按钮，被父容器推到最右侧。
3. 入口只显示一个图标：`<LuTrash />`。

入口不展示说明文字，hover/focus 可使用 `Bulk delete` 作为 accessible label / tooltip。

## 4. 交互
点击入口后：

1. 在 `button.expandable-section-header` 后插入菜单容器。
2. 对当前已渲染的 chat item 注入 checkbox。
3. 监听 chat 列表滚动/新增节点，为后续加载的 chat item 补 checkbox。
4. 再次点击入口或按 Escape 退出批量模式，并移除菜单与 checkbox。

菜单内容：

```text
[[select latest 50] [select unpinned]]
[ Delete (number) ]
```

行为：

- `select latest 50`：主动向下加载历史，直到选到最近 50 条，或确认没有更多可加载 chat。
- `select unpinned`：选择所有未 pinned 且未选中的 chat。
- `Delete (number)`：没有选择时禁用；有选择时执行批量删除。
- 删除前使用确认弹窗，确认后按队列逐条删除。

## 5. 范围
本期包含：

1. Chat 标题右侧入口。
2. 批量选择菜单。
3. chat item checkbox 注入与选择状态统计。
4. `select latest 50` 与 `select unpinned`。
5. 串行删除已选 chat。

本期不包含：

1. 付费墙、配额或授权码。
2. 后台静默删除或网络 API 直删。
3. 跨刷新恢复选择状态。
4. 自定义选择数量。
5. 删除后撤销。

## 6. 验收标准
1. Chat header 右侧出现垃圾桶图标入口，且不影响原生折叠/展开。
2. 进入批量模式后，菜单出现在 Chat header 下方。
3. 每个已渲染 chat item 都有 checkbox，点击 checkbox 不跳转会话。
4. `select latest 50` 最多选择 50 条。
5. `select unpinned` 不选择 pinned conversations。
6. `Delete (number)` 数字随选择变化更新，未选择时不可执行。
7. 删除按序执行，失败项不阻断后续项，并在结束后清理批量模式。
