# Welcome Greeting 可读性技术方案（Light 模式，首次局部推算）

## 1. 目标与约束

### 1.1 目标
- 解决首页欢迎语在 Light 模式 + 背景图下可读性差的问题。
- 使用低成本方案：**首次局部推算**，不做持续实时重算。
- 提供可理解的用户控制：Select 三选一（默认/强制浅色/自动）。

### 1.2 非目标
- 不改全站字体颜色系统。
- 不在 Dark 模式下处理欢迎语颜色。
- 不做持续监听滚动、动画、实时对比度跟踪。

## 2. UI 与交互设计

### 2.1 控件位置
- 位置：Theme > Wallpaper 区域，紧随现有背景相关设置。
- 组件：Chakra Select（参考官方 Select 组件）。

### 2.2 选项文案（避免与主题模式混淆）
- `保持默认`（`default`）
- `自动适配（首次推算）`（`auto`）
- `强制浅色文字`（`force-light`）

说明文案（tooltip 或辅助文案）：
- `仅在亮色模式首页生效；暗色模式不受影响。`

### 2.3 生效规则
- `default`：不覆写欢迎语颜色。
- `force-light`：直接将欢迎语改为白色。
- `auto`：上传背景图后（或首次检测到缓存缺失时）执行一次局部推算，得到“默认/浅色”结论并缓存；后续直接使用缓存结果。

## 3. 数据模型（在现有 ThemeBackgroundSettings 上扩展）

在 `src/entrypoints/content/gemini-theme/background/types.ts` 扩展：

```ts
type WelcomeGreetingReadabilityMode = 'default' | 'auto' | 'force-light'
type WelcomeGreetingResolved = 'default' | 'force-light'

interface ThemeBackgroundSettings {
  // existing fields...
  welcomeGreetingReadabilityMode: WelcomeGreetingReadabilityMode
  welcomeGreetingResolved: WelcomeGreetingResolved
  welcomeGreetingResolvedAssetId: string | null
}
```

默认值建议：
- `welcomeGreetingReadabilityMode: 'auto'`
- `welcomeGreetingResolved: 'default'`
- `welcomeGreetingResolvedAssetId: null`

说明：
- `welcomeGreetingResolvedAssetId` 用于判断缓存是否对应当前背景图，避免重复计算。

## 4. 架构拆分（保持清晰，避免堆在一个文件）

建议新增以下文件（均位于 `src/entrypoints/content/gemini-theme/background/welcome-greeting/`）：

1. `types.ts`
- 定义 mode/resolved 类型、阈值常量、采样参数。

2. `rect.ts`
- 负责欢迎语目标区域计算。
- 包含：
  - DOM 直取：`greeting div.greeting-title`
  - Fallback 推算（见第 5.1 节）

3. `estimator.ts`
- 负责图片 cover 映射、局部采样、亮度/对比度评估、决策输出。

4. `styleController.ts`
- 负责目标 DOM 应用/清理样式（`div.top-section-container.visible-primary-message`）。

5. `service.ts`
- 协调入口：上传后计算、设置切换、初始化恢复、缓存命中判断。

> 现有 `background/service.ts` 仅负责调用 welcome-greeting service，不承载具体推算逻辑。

## 5. 核心算法

### 5.1 欢迎语区域获取

优先路径：
- 查询 `greeting div.greeting-title`
- 若存在，使用 `getBoundingClientRect()` 作为采样基准区域。

fallback 路径（当欢迎语 DOM 不存在时）：
- `width = 350`
- `height = 80`
- `left = (window.innerWidth - sideNavWidth - 760) / 2 + sideNavWidth`
- `top = (window.innerHeight - 48) / 2 - 80 * 2 - 24 + 48`

其中 `sideNavWidth`：
- 选择器：`bard-sidenav-container > bard-sidenav`
- 若不存在，按 `0` 处理。

注：
- 需求文字中的 `right` 公式在几何语义上对应垂直定位，方案按 `top` 解释实现。

### 5.2 cover 映射（关键）

背景图显示方式为 `cover`，因此采样需要从“视口区域”映射到“源图区域”：

```ts
scale = max(viewportW / imageW, viewportH / imageH)
renderW = imageW * scale
renderH = imageH * scale
offsetX = (viewportW - renderW) / 2
offsetY = (viewportH - renderH) / 2
```

将欢迎语区域（视口坐标）映射到源图坐标：

```ts
srcX = clamp((rect.left - offsetX) / scale, 0, imageW)
srcY = clamp((rect.top - offsetY) / scale, 0, imageH)
srcW = clamp(rect.width / scale, 1, imageW - srcX)
srcH = clamp(rect.height / scale, 1, imageH - srcY)
```

### 5.3 局部采样与决策

采样策略（轻量）：
- 使用 `createImageBitmap(blob)` 或 `Image` 解码。
- 使用小画布（例如 48x24）绘制源图中 `[srcX, srcY, srcW, srcH]` 子区域。
- 计算平均相对亮度 `Lbg`（sRGB -> linear）。

对比度比较：
- 白字：`contrastWhite = (1.0 + 0.05) / (Lbg + 0.05)`
- 深字（默认近似 `#1f1f1f`）：`contrastDark = (Lbg + 0.05) / (Ldark + 0.05)`
- 若 `contrastWhite > contrastDark`，结果为 `force-light`，否则 `default`。

额外阈值建议：
- 仅当 `contrastWhite - contrastDark >= 0.4` 才切换到 `force-light`，避免临界值抖动。

## 6. 样式应用

目标 DOM：
- `div.top-section-container.visible-primary-message`

强制浅色样式：

```css
--gem-sys-color--on-surface: white;
color: white;
```

应用条件：
- 当前是 Light 模式。
- 当前页面命中首页（存在欢迎语容器或可识别首页结构）。
- mode 结果为 `force-light`（来自 `force-light` 或 `auto` 推算）。

否则清理覆写样式。

## 7. 触发时机与数据流

### 7.1 上传背景图后
1. 背景图上传成功 -> 拿到 `assetId + blob + dimensions`
2. 若 `mode === 'auto'`，执行一次局部推算
3. 写入：
   - `welcomeGreetingResolved`
   - `welcomeGreetingResolvedAssetId = currentAssetId`
4. 应用欢迎语样式

### 7.2 初始化（页面刷新/新标签）
1. 读取 settings
2. 若 `mode !== 'auto'`，直接按模式应用
3. 若 `mode === 'auto'`：
   - 缓存命中（assetId 一致）-> 直接应用
   - 缓存未命中 -> 执行一次推算并更新缓存

### 7.3 用户切换 Select
- `default`：清理覆写。
- `force-light`：立即覆写为白色。
- `auto`：若缓存命中直接应用，否则立即推算一次并缓存。

## 8. 性能与边界场景

### 8.1 性能策略
- 不做实时重算（无 scroll/mutation 高频计算）。
- 仅在“上传后/首次缓存缺失/用户切换到 auto 且未命中缓存”时计算一次。
- 采样画布固定小尺寸，避免大图全量像素处理。

### 8.2 边界处理
- 背景图关闭、无图：清理欢迎语覆写。
- Dark 模式：始终清理欢迎语覆写（该功能仅 Light）。
- 目标 DOM 暂时不存在：保留计算结果，待首页 DOM 出现时应用。
- 旧资产无宽高：回退到解码获取自然尺寸，不阻断功能。
- 侧边栏 DOM 不存在：fallback 时 `sideNavWidth = 0`。

## 9. 测试方案

### 9.1 单测
- `rect.ts`：
  - 有 greeting DOM 时返回真实 rect
  - 无 greeting DOM 时按公式返回 fallback rect
- `estimator.ts`：
  - cover 映射正确性（多纵横比）
  - 白字/深字决策正确
- `service.ts`：
  - auto 缓存命中不重复计算
  - assetId 变化触发重新推算
  - dark 模式不应用白字覆写

### 9.2 手工验收
1. Light + 高亮背景区域：auto 应切换白字。
2. Light + 深色背景区域：auto 保持默认字色。
3. 切到 Dark：欢迎语不保留白字覆写。
4. 上传新图后：auto 结果更新。
5. 不在首页上传后进入首页：能基于缓存正确应用。

## 10. 最小落地范围（MVP）
- 仅实现 Light 首页欢迎语可读性 Select。
- 仅支持三种策略（default/auto/force-light）。
- auto 采用上传后首次局部推算 + 缓存，不做实时重算。
