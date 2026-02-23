# Gemini Power Kit 入口（Content Script）

## 目标
该模块会在 Gemini 左侧导航中，`Settings & help` 上方注入一个 `Gemini Power kit` 入口。

支持两类结构：
- 桌面侧边栏（`side-nav-action-button`）
- 移动端/抽屉控制区（`.mobile-controls` 下的 `button`）

点击入口后，通过 `eventBus` 打开插件主题设置面板。

## 文件
- `index.ts`：完整实现（DOM 注入、同步、观察器、tooltip 生命周期）

## 实现流程
1. 在桌面和移动端分别找到 `Settings & help` 参考节点。
2. 克隆参考节点（继承原有布局、class 与样式）。
3. 将图标、文案、属性改写为 `Gemini Power kit`。
4. 将克隆节点插入到 `Settings & help` 之前。
5. 在 Gemini 侧边栏重绘后持续同步，保证入口不丢失、不重复。

## 打开主题设置
点击处理触发：

```ts
eventBus.emitSync('settings:open', {
  from: 'prompt-entrance',
  open: true,
  module: 'theme',
})
```

## Tooltip 策略
- 桌面收起态：使用 `tippy.js`，沿用 `gemini-tooltip` 主题。
- 桌面展开态：不显示 tooltip。
- 移动端入口：保留原生 `title` 行为。

当前桌面 tooltip 配置：
- `placement: 'top'`
- `animation: 'shift-away-subtle'`
- `arrow: false`
- `duration: [null, 0]`

## 稳定性与生命周期
为适配 Gemini 高频重绘，模块包含：
- 多个 `MutationObserver`（layout、side nav、desktop list、desktop settings attrs、mobile controls）。
- `requestAnimationFrame` 节流同步。
- 启动期重试机制（参考节点暂未出现时自动重试）。

tooltip 生命周期防护：
- 有实例则复用，避免重复创建。
- 变体切换（`collapsed -> expanded`）时销毁。
- 宿主替换/移除时销毁。
- 每轮同步清理断连或越界实例。
- `beforeunload` 时全量清理。

## 关键选择器 / Test ID
- 桌面设置锚点：
  - `side-nav-action-button[data-test-id="settings-and-help-button"]`
- 移动端设置锚点：
  - `button[data-test-id="mobile-settings-and-help-control"]`
- 注入的桌面入口：
  - `side-nav-action-button[data-test-id="gemini-power-kit-button"]`
- 注入的移动端入口：
  - `button[data-test-id="mobile-gemini-power-kit-control"]`

## 维护建议
- 优先依赖结构选择器，不依赖文案匹配。
- 折叠态图标尺寸需与 Material Icon Button 对齐（当前为 `20px`）。
- 点击事件绑定使用 `data-gpk-bound` 防止重复绑定。
- 如果 Gemini DOM 结构变动，先更新锚点选择器再看其他逻辑。

## 快速验收清单
1. 桌面收起态：入口出现在 `Settings & help` 上方。
2. 桌面收起态 hover：tooltip 出现在上方，离开后消失。
3. 桌面收起态点击：tooltip 立即隐藏，并打开主题设置面板。
4. 桌面展开态：显示文字，不显示 tooltip。
5. 移动端/抽屉：入口存在（图标+文案），点击可打开主题设置。
6. 刷新、改尺寸、展开/收起循环后，入口不重复、不丢失。
