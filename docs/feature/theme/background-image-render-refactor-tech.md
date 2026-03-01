# Theme 背景图渲染改造技术方案（V1）

## 1. 需求背景
当前 Theme 背景图能力已经支持：
- 本地上传背景图
- blur 强度调节
- Light/Dark 分支样式
- 刷新后恢复背景图配置

但在实际使用中出现关键稳定性问题：
- 设置 blur 后，首次效果正常
- 页面刷新后，底部出现缝隙，且边缘出现明显白边
- 在 DevTools 手动切换 `::before` 的 `inset` 后，问题可暂时消失

该问题影响视觉质量和功能可信度，属于必须优先解决的渲染稳定性问题。

## 2. 原因分析

### 2.1 当前实现方式
当前背景图由伪元素承载：
- 选择器：`chat-app::before`
- 定位方式：`position: absolute`
- 滤镜：`filter: blur(...)`
- 通过 `inset` / `transform` 做过绘扩展，试图避免 blur 白边
- 父层 `chat-app` 同时存在裁剪上下文（`overflow: hidden`）

### 2.2 问题根因（机制层）
该问题不是普通布局问题，而是**图层合成/重绘稳定性问题**：
1. `filter: blur` 会触发离屏栅格化和边缘扩散。
2. 伪元素位于父容器裁剪上下文中，边缘扩散需要“过绘缓冲区”。
3. 刷新首屏阶段（DOM/样式分批到位）下，`inset` 或 `transform` 的过绘边界与裁剪边界可能发生不稳定重建。
4. 最终表现为底部缝隙/白边；手动切换样式触发重绘后暂时恢复。

结论：
- 问题与 `inset` 高相关，但本质是“`pseudo-element + blur + clipping + refresh timing`”组合导致的渲染不稳定。
- 单纯微调 `inset`/`transform`/`margin` 难以根治。

## 3. 改造思路

### 3.1 目标
将背景图渲染从 `chat-app::before` 迁移到**独立真实元素**，避免伪元素与父裁剪上下文耦合，提升刷新稳定性。

### 3.2 新渲染架构
新增独立背景层元素（真实 DOM，不使用 `::before`）：
- 元素：`<div id="gpk-theme-bg-layer"></div>`
- 挂载位置：`document.body` 直属子节点
- 定位：`position: fixed; inset: 0;`
- 层级：低层级（在应用内容层之下）
- 交互：`pointer-events: none`

背景层样式核心：
- `background-image: var(--gpk-bg-image)`
- `background-size: cover`
- `background-position: center`
- `filter: blur(var(--gpk-bg-blur))`（Dark 模式附加 brightness）

内容层保持在背景层之上（通过已存在层级或显式 z-index 保证）。

### 3.3 为什么要用真实元素而不是 fixed 伪元素
- 真实元素生命周期可控（创建/销毁/重建）。
- 更容易显式触发重绘与兜底策略。
- 避免伪元素在复杂 stacking context 下的不稳定合成行为。
- 可读性和可维护性更好（便于后续加入遮罩、渐变、动画）。

## 4. 详细改造方案

### 4.1 styleController 改造
文件：`src/entrypoints/content/gemini-theme/background/styleController.ts`

新增职责：
1. `ensureBackgroundLayerElement()`：确保背景层元素存在。
2. `applyThemeBackgroundStyle(state)`：
   - 更新 `data-gpk-*` 属性（保留）
   - 更新 CSS 变量（保留）
   - 同步背景层的显示状态、背景图 URL、blur。
3. `clearThemeBackgroundStyle()`：
   - 清理属性和变量
   - 隐藏或移除背景层

保留现有规则：
- 侧栏毛玻璃
- 消息毛玻璃
- 输入区域样式
- 渐变层隐藏

移除/停用规则：
- `chat-app::before` 全部规则
- `chat-app` 为背景层服务的裁剪耦合规则

### 4.2 样式文件改造
文件：`src/entrypoints/content/gemini-theme/background/style.css`

调整点：
- 删除 `chat-app::before` 相关规则。
- 新增 `#gpk-theme-bg-layer` 样式块。
- Dark 模式 brightness 通过 root class/data-theme 分支应用到背景层。

### 4.3 初始化与刷新恢复
文件：`src/entrypoints/content/gemini-theme/background/service.ts`

保持现有配置和 asset URL 解析逻辑不变。
`initThemeBackground()` 在读取设置后，调用新的 styleController 将背景直接应用到独立背景层。

### 4.4 回退策略
如果遇到宿主站点结构突变：
- 背景层仍可独立工作（与 chat-app 层级解耦）。
- 失败时可退化为隐藏背景层，不影响主功能交互。

## 5. 风险与对策

### 风险 1：背景层盖住内容
- 对策：`pointer-events: none` + 明确 z-index 分层 + 实测 overlay 组件可交互。

### 风险 2：fixed 层在某些页面态滚动/缩放表现异常
- 对策：覆盖欢迎页、对话页、窄屏、immersive 模式的回归场景。

### 风险 3：已有附加样式与新分层冲突
- 对策：先保留原功能规则，仅替换背景承载方式，分批清理旧耦合选择器。

## 6. 验收标准
1. 开启背景图并设置 blur 后，刷新页面不再出现底部缝隙。
2. 刷新后不再出现 blur 白边。
3. Light/Dark 下背景可正常显示，Dark 仍保留 brightness 分支。
4. 无横向滚动条回归。
5. 上传、删除、切换 blur、切换毛玻璃开关行为与现有一致。

## 7. 测试计划

### 自动化（建议补充）
- styleController：
  - 创建背景层元素
  - 更新背景层状态
  - 清理背景层

### 手工回归
1. 对话页：blur=0/5/20，刷新前后对比。
2. 欢迎页：刷新后检查底部边缘。
3. Light/Dark 切换。
4. 窄屏模式。
5. 与 Message Glass 开关组合测试。

## 8. 实施顺序（建议）
1. 新增 `#gpk-theme-bg-layer` 渲染链路（不删旧规则）。
2. 切换默认渲染到独立背景层。
3. 回归通过后，删除 `chat-app::before` 旧规则。
4. 补齐单测与文档。
