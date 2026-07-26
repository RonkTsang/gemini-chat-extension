# Gemini Power Kit 入口（Content Script）

## 目标
该模块会在 Gemini 左侧导航中，`Settings & help` 上方注入一个 `Gemini Power kit` 入口。

支持两类结构：
- 桌面侧边栏（`sidenav-mavatar-footer`，并保留旧 `side-nav-action-button` fallback）
- 移动端/抽屉控制区（`.mobile-controls` 下的 `button`）

点击入口后，通过 `eventBus` 打开插件的 **Enhancements** 页面。

## 文件
- `index.ts`：完整实现（DOM 注入、同步、观察器、tooltip 生命周期）

## 实现流程
1. 解析 Gemini 所有的 `Settings & help` 定位锚点和当前桌面变体。
2. 当前 mavatar 入口使用 GPK 自有 Light DOM 渲染：容器、原生 button、SVG、样式、tooltip 和点击事件。
3. 展开态插入到 Settings 前；收起态作为对齐的 rail 项插入到 Settings 上方。
4. Gemini 选择器与插入决策只存在于适配层；入口不克隆 Gemini 自定义元素、Angular 属性、class 或事件行为。
5. 在 Gemini 侧边栏重绘后持续同步，保证入口不丢失、不重复。

## 打开 Enhancements 页面
点击处理触发：

```ts
eventBus.emitSync('settings:open', {
  from: 'prompt-entrance',
  open: true,
  module: 'enhancements',
})
```

## Tooltip 策略
- 桌面收起态：在自有 button 上使用 `tippy.js`，显示在右侧。
- 桌面展开态：在自有 button 上使用 `tippy.js`，显示在上方。
- 移动端入口：保留原生 `title` 行为。
- 桌面 tooltip 明确挂载到 `document.body`，避免被 SideNav overflow 截断。

当前桌面 tooltip 配置：
- 收起态 `placement: 'right'`，展开态 `placement: 'top'`
- `appendTo: () => document.body`
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
- `beforeunload` 时全量清理观察器、tooltip 实例、注入 DOM 和模块自有样式。

## 关键选择器 / Test ID
- 桌面设置锚点：
  - `gem-icon-button[data-test-id="mavatar-footer-settings-button"]`
  - `button[data-test-id="mavatar-footer-settings-button"]`
  - 旧版 fallback：`side-nav-action-button[data-test-id="settings-and-help-button"]`
- 移动端设置锚点：
  - `button[data-test-id="mobile-settings-and-help-control"]`
- 注入的桌面入口：
  - `[data-test-id="gemini-power-kit-mavatar-container"]`
  - `button[data-test-id="gemini-power-kit-button"]`
  - `side-nav-action-button[data-test-id="gemini-power-kit-button"]`
- 注入的移动端入口：
  - `button[data-test-id="mobile-gemini-power-kit-control"]`

## 维护建议
- 优先依赖结构选择器，不依赖文案匹配。
- Gemini 依赖止于定位和变体判断；当前 mavatar 入口禁止克隆 Gemini 控件。
- 自有 host/button 几何尺寸需与 Gemini 对齐（`32px` host、`36px` button、`20px` icon box）。
- 点击事件绑定使用 `data-gpk-bound` 防止重复绑定。
- 如果 Gemini DOM 结构变动，先更新锚点选择器再看其他逻辑。
- 当前桌面布局使用 `.mavatar-footer-row.collapsed` 判断收起态，去掉 `collapsed` 后为展开态。

## 快速验收清单
1. 桌面收起态：入口出现在 `Settings & help` 上方。
2. 桌面收起态 hover：tooltip 出现在右侧，且不会被 SideNav 截断。
3. 桌面收起态点击：tooltip 立即隐藏，并打开 **Enhancements** 页面。
4. 桌面展开态：入口紧邻 Settings 前方对齐，tooltip 显示在上方。
5. 移动端/抽屉：入口存在（图标+文案），点击可打开 **Enhancements** 页面。
6. 刷新、改尺寸、展开/收起循环后，入口不重复、不丢失。
