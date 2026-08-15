# Theme Bloom 原型执行计划

| 项目 | 内容 |
| :--- | :--- |
| **Feature** | Theme Bloom |
| **目标形态** | 将本地图片拖入 Gemini 页面后，自动匹配 Theme 预设并以绽放动效完成换肤 |
| **阶段** | 交互原型，不作为正式功能发布 |
| **范围** | Chromium 优先；Firefox 保留降级路径 |

## 1. 原型目标

验证以下产品假设：

> 用户能够理解“拖入图片即可换肤”，并从图片落点向整个 Gemini 界面扩散的 Theme Bloom 动效中感受到明显、可传播的视觉变化。

原型必须形成完整的可体验链路：

1. 图片进入页面后出现明确、稳定的拖放提醒。
2. 图片被解析为代表色，并自动匹配现有 Theme 预设。
3. 壁纸与预设主题在一次连续的绽放 / 融合动效中完成切换。

原型直接运行在真实 Gemini 页面和现有扩展 Theme 链路中，但仅在开发环境或显式实验开关下启用，不新增正式设置入口。

## 2. 原型范围

### 2.1 本期包含

- 从操作系统拖入单张 PNG、JPG、WebP 或 AVIF 图片。
- 页面级 Theme 拖放区域及拖放提醒。
- 与 Gemini 原生图片上传区域的交互避让。
- 本地图片取色、代表色选择和现有 Theme preset 匹配。
- 壁纸、Theme preset 的同步应用与持久化。
- 从图片落点开始的 Theme Bloom 换肤动效。
- View Transition 不可用或用户开启 reduced motion 时的降级表现。
- 原型所需的自动化测试和真实 Gemini 页面手工验证。

### 2.2 本期不包含

- 从其他网页拖入图片 URL。
- 多图片批量处理。
- 动态生成新的 Theme 色阶。
- 自动切换 Light / Dark Appearance。
- 面向正式用户的设置项、引导页或开关。
- 社区主题分享、主题导入导出。
- 正式埋点、Undo 历史栈或跨设备同步。

## 3. 核心交互

### 3.1 拖放区域规则

页面分为两类拖放目标：

1. **Theme 区域**：聊天内容区、侧边栏、顶栏和其他非输入区域。放开图片后触发 Theme Bloom。
2. **Gemini 原生上传区域**：输入框及其真实图片附件目标。进入该区域后不拦截事件，由 Gemini 继续处理图片上传。

实施前必须在当前 Gemini 页面验证原生上传区域的实际 DOM wrapper、事件目标和 `composedPath()`；不得只根据历史选择器推断。

### 3.2 拖放提醒状态

| 状态 | 视觉反馈 | 行为 |
| :--- | :--- | :--- |
| `idle` | 无额外界面 | 不处理普通鼠标操作 |
| `eligible-drag` | 页面边缘出现低强度主题色光晕；Theme 顶栏入口高亮 | 仅确认拖入内容包含图片文件 |
| `over-theme` | 落点附近显示图片色彩种子；文案为 `Drop to apply theme` | `dropEffect = copy`，允许换肤 |
| `over-native-upload` | Theme 光晕退去，保留 Gemini 原生反馈 | 不调用 `preventDefault()`，不触发换肤 |
| `analyzing` | 色彩种子轻微呼吸，避免处理等待看起来像卡顿 | 校验图片并计算 preset |
| `transitioning` | 执行 Theme Bloom | 暂时忽略新的图片 drop |
| `error` | 清除覆盖层并显示现有风格的错误 toast | 保留原主题 |

拖放覆盖层挂载于现有 Shadow DOM UI，必须 `pointer-events: none`，不得遮挡 Gemini 交互。全局 Drag & Drop 控制器使用计数器或等价机制处理嵌套元素造成的重复 `dragenter` / `dragleave`，避免提醒闪烁。

## 4. Theme 预设计算

### 4.1 计算流程

1. 复用 `validateThemeBackgroundImage()` 校验 MIME、10MB 大小限制和 40MP 像素限制。
2. 使用 `createImageBitmap()` 解码图片，并缩放到约 `96 x 96` 的离屏 Canvas。
3. 忽略透明像素，对采样色从 sRGB 转换为 OKLab / OKLCH。
4. 通过固定初始顺序的 K-means 或等价确定性算法，将像素聚类为 4–6 个代表色。
5. 为每组记录像素占比 `P`、明度 `L`、彩度 `C` 和色相 `H`。
6. 先执行 Gray 判定；图片具有足够彩色内容时，再计算 accent。
7. 将 accent 与 `themePresets[].primary` 转换到 OKLCH，选择加权距离最小的 preset。

第一版只选择现有 preset，不修改其 CSS 色阶。图片决定壁纸与主题气质；文本颜色、语义状态和 Light / Dark Appearance 继续由现有 Theme 体系负责。

### 4.2 Accent 评分

不能直接使用像素占比最大的颜色。白墙、黑色背景、天空等大面积低彩度区域可能主导图片，却不适合作为主题 accent。

每个颜色簇按以下初始公式评分：

```text
lightnessFitness = clamp(
  1 - abs(L - 0.62) / 0.42,
  0.15,
  1
)

accentScore = sqrt(P) * C^1.2 * lightnessFitness
```

- `sqrt(P)`：保留面积影响，但避免大面积背景完全压倒较小的高辨识度颜色。
- `C^1.2`：优先选择更有主题感的颜色。
- `lightnessFitness`：降低接近纯白或纯黑颜色的权重。

从非中性色簇中选择 `accentScore` 最高者作为 accent。若分数相同，依次以较高 `P`、较高 `C` 和固定聚类顺序决胜，保证同一图片重复计算结果一致。

### 4.3 Gray 判定

在匹配彩色 preset 前，先计算：

```text
maxClusterChroma = max(cluster.C)
coloredPopulation = sum(cluster.P where cluster.C >= 0.04)
```

满足任一条件时直接返回 `gray`：

```text
maxClusterChroma < 0.04
coloredPopulation < 0.08
```

该规则避免黑白照片因为很小的彩色 Logo 或噪点被误判为彩色主题。`0.04` 和 `8%` 是原型初始阈值，必须根据第 4.6 节样本调优。

### 4.4 Preset 匹配

现有彩色 preset 为 `blue`、`red`、`pink`、`purple`、`cyan`、`teal`、`green`、`yellow` 和 `orange`；`gray` 已由上一步单独处理。

将 accent 与各 preset 的 `primary` 转换为 OKLCH，并计算：

```text
hueDistance =
  min(abs(H1 - H2), 360 - abs(H1 - H2)) / 180

chromaDistance =
  abs(C1 - C2) / max(C1, C2, 0.1)

lightnessDistance =
  abs(L1 - L2)

presetDistance =
  0.75 * hueDistance
  + 0.15 * chromaDistance
  + 0.10 * lightnessDistance
```

选择 `presetDistance` 最小的 preset。色相权重最高，因为目标是匹配主题类别，而不是寻找数值上最接近的色块；例如浅蓝和深蓝都应优先进入 Blue，而不是因明度差异落入 Gray。

距离相同时按 `themePresets` registry 顺序决胜，确保结果稳定。匹配到 `blue` 时沿用当前行为：移除自定义 preset CSS，恢复 Gemini 默认蓝色主题。

### 4.5 计算结果

```ts
interface ThemeBloomPaletteResult {
  sampledColors: Array<{
    hex: string
    population: number
    lightness: number
    chroma: number
  }>
  accentColor: string
  presetKey: string
  presetDistance: number
}
```

原型开发模式可在完成后短暂显示 `accentColor -> presetKey` 诊断信息，便于判断匹配是否合理；正式视觉中不展示算法细节。

算法的产品原则为：面积决定画面主体，彩度决定颜色性格，色相决定 preset 类别。

### 4.6 测试样本

至少准备以下图片类别进行人工判断：

- 单一高饱和主色。
- 多色插画或专辑封面。
- 大面积白色 / 黑色背景。
- 低饱和灰阶图片。
- 暖色人像。
- 蓝天、海面或绿色植物等自然图片。

## 5. Theme Bloom 换肤动效

### 5.1 动效时间轴

| 阶段 | 时间 | 表现 |
| :--- | :--- | :--- |
| 吸附 | `0–120ms` | 拖拽预览在落点收缩为色彩种子，页面产生轻微聚焦感 |
| 绽放 | `120–600ms` | 新壁纸和新主题从落点向最远屏幕角扩张，边缘叠加柔和的多层色彩光晕 |
| 融合 | `450–900ms` | 侧边栏、消息气泡与输入区完成色彩过渡；玻璃模糊短暂增强后回落 |
| 凝结 | `900–1200ms` | 一次低强度高光扫过页面，覆盖层退出，真实 Theme 保持生效 |

动效必须让观众看见真实 Gemini UI 被换肤，不使用遮满页面的粒子或与界面无关的庆祝特效。

### 5.2 主实现路径

Chromium 优先使用同文档 View Transition：

1. 在 drop 后记录 `clientX/clientY` 和到最远视口角的半径。
2. 完成图片解码、preset 计算和临时背景 URL 准备。
3. 捕获切换前状态。
4. 在 View Transition update callback 中同步应用临时 wallpaper 状态和 preset CSS。
5. 对 `::view-transition-new(root)` 从 `circle(0 at x y)` 动画到覆盖视口的圆。
6. 独立的 Theme Bloom 覆盖层负责色彩种子、柔边光晕和收尾高光。
7. 动效开始后通过现有 `uploadThemeBackground()` 与 `applyTheme()` 完成持久化；持久化后的真实状态替换临时状态时不得发生视觉跳变。
8. 成功或失败后清理临时 Object URL、View Transition 样式和覆盖层状态。

不得为了动效复制新的 Theme 存储模型；临时视觉与最终持久化应汇入现有 background service、preset 注入和 styleController 链路。

### 5.3 降级路径

- `document.startViewTransition` 不可用：使用固定覆盖层完成 wallpaper 淡入和光晕扩张，真实 Theme 在其下应用，最后淡出覆盖层。
- `prefers-reduced-motion: reduce`：取消径向扩张和模糊过冲，仅使用约 120ms 的交叉淡入。
- 动画执行失败：换肤仍可完成；动效不得成为主题应用的阻断条件。

## 6. 技术结构

建议新增以下模块，实际命名可在实现前根据当前目录进一步微调：

| 模块 | 职责 |
| :--- | :--- |
| `src/entrypoints/content/theme-bloom/controller.ts` | 全局 Drag & Drop 监听、目标分类、状态机、启动与清理 |
| `src/entrypoints/content/theme-bloom/palette.ts` | 图片采样、OKLab / OKLCH 转换、聚类与 preset 匹配 |
| `src/entrypoints/content/theme-bloom/transition.ts` | View Transition、圆形揭示、降级动效与临时样式清理 |
| `src/entrypoints/content/theme-bloom/service.ts` | 串联校验、计算、临时应用、现有 Theme 持久化和错误恢复 |
| `src/components/theme-bloom-overlay/index.tsx` | 拖放提醒、色彩种子、分析中与收尾视觉 |
| `src/common/event.ts` | 定义 controller 与 Shadow DOM overlay 之间的事件及 payload 类型 |

集成点：

- 在 `src/entrypoints/content/index.tsx` 中启动 controller，并在 `ctx.onInvalidated()` 中停止和清理。
- 在 `src/entrypoints/content/overlay/index.tsx` 中挂载 `ThemeBloomOverlay`。
- 复用 `src/entrypoints/content/gemini-theme/preset/presets.ts` 的 preset registry。
- 复用 `src/entrypoints/content/gemini-theme/background/service.ts` 的图片校验、asset 存储和背景应用。
- 复用 `src/entrypoints/content/gemini-theme/background/styleController.ts` 的真实 wallpaper 层和 CSS 变量映射。

原型控制器必须有完整清理路径：移除 window 监听器、取消 animation、撤销临时 Object URL、移除临时 style/DOM，并清空进行中的状态。

## 7. 实施阶段

### 阶段 0：真实页面契约确认

- 在当前 Gemini 对话页确认原生图片上传的目标元素、事件传播路径和拖入反馈。
- 确认现有扩展 overlay、真实 wallpaper 层和 View Transition snapshot 的层级关系。
- 记录欢迎页、普通对话页和临时对话页的差异。

**完成条件**：Theme 区域与原生上传区域能够依据真实事件路径稳定分类。

### 阶段 1：拖放提醒

- 实现 Drag & Drop 状态机与生命周期。
- 实现 overlay 的 `eligible-drag`、`over-theme`、`over-native-upload` 和 `error` 状态。
- 先用固定 preset 验证 drop 到换肤触发，不接入取色算法。

**完成条件**：提醒不闪烁、不遮挡页面；输入框 drop 保持 Gemini 原生行为；其他有效区域只触发一次 Theme drop。

### 阶段 2：preset 计算

- 实现纯函数形式的色彩空间转换、聚类评分和 preset 匹配。
- 接入本地图片解码及开发诊断信息。
- 使用规定样本调整灰度阈值和 accent 评分。

**完成条件**：高饱和单色、灰阶和常见自然图片均能给出可解释且稳定的 preset；同一图片重复计算结果一致。

### 阶段 3：Theme Bloom 动效

- 接入落点坐标、View Transition 和最远角半径计算。
- 完成吸附、绽放、融合、凝结四段时间轴。
- 完成无 View Transition 与 reduced motion 降级。

**完成条件**：动效从实际 drop 点开始；壁纸与 UI preset 在同一转换中完成；结束后不存在临时遮罩或视觉跳变。

### 阶段 4：现有 Theme 链路整合

- 将临时视觉状态与 `uploadThemeBackground()`、`applyTheme()` 连接。
- 处理校验、计算、持久化和动画任一步骤失败时的恢复。
- 加入开发环境 / 实验开关，确保生产默认不启用。

**完成条件**：刷新页面后仍恢复新壁纸和 preset；失败时保留旧主题；旧 asset 与 Object URL 不泄漏。

### 阶段 5：验证与调优

- 完成自动化测试。
- 在真实 Gemini 页面验证完整事件到渲染链路。
- 录制多图片连续换肤样片，检查动效是否具有清晰的音乐卡点节点。

**完成条件**：通过第 9 节验收标准，并形成一段可用于判断传播效果的原型录屏。

## 8. 测试计划

### 8.1 自动化

- `palette.test.ts`
  - sRGB 到 OKLab / OKLCH 转换边界。
  - 透明像素忽略。
  - 单色、灰阶、多色输入的 preset 匹配。
  - preset 相同距离时的稳定决策。
- `controller.test.ts`
  - 非文件、非图片、多文件和有效单图片分类。
  - 嵌套 `dragenter` / `dragleave` 不导致状态闪烁。
  - 原生上传区域不被拦截。
  - stop 后监听器和状态全部清理。
- `transition.test.ts`
  - 最远角半径计算。
  - View Transition 与 fallback 分支。
  - reduced motion 分支。
  - 动画完成和异常后的样式清理。
- `service.test.ts`
  - 计算结果正确传入 `applyTheme()`。
  - wallpaper 和 preset 持久化只执行一次。
  - 任一步骤失败时清理临时资源并保留旧主题。

实施后的最低命令验证：

```bash
pnpm test:run <Theme Bloom targeted test files>
pnpm compile
pnpm run check:i18n
git diff --check
```

若新增或修改 `src/locales/*.json`，必须通过项目 `i18n-writer` subAgent 完成并验证 locale parity。

### 8.2 真实页面手工验证

1. 欢迎页、已有对话页、临时对话分别拖入图片。
2. 从页面中心、四角和侧边栏 drop，确认绽放原点正确。
3. 在输入框区域 drop，确认仍进入 Gemini 图片上传流程。
4. 连续拖入两张不同色调图片，确认不会残留旧 overlay 或旧动画。
5. 验证 Light / Dark 下 preset 和文字可读性。
6. 验证 PNG、JPG、WebP、AVIF、非法格式、超 10MB 图片和超 40MP 图片。
7. 验证 View Transition fallback 与 reduced motion。
8. 刷新页面，确认 wallpaper 与 preset 均恢复。

## 9. 原型验收标准

1. 有效图片进入页面后 50ms 内出现第一帧拖放反馈。
2. 拖放提醒在跨越嵌套 DOM 时不闪烁。
3. Gemini 原生图片上传区域不被 Theme Bloom 劫持。
4. 同一张图片重复计算得到相同 preset。
5. 灰阶图片匹配 Gray；明显主色图片匹配到感知上接近的现有 preset。
6. 动效从 drop 坐标开始，并在约 1.2 秒内完成吸附、绽放、融合和凝结。
7. 动效期间真实 Gemini UI 的壁纸、侧边栏、消息区域和输入区域变化清晰可见。
8. 动效结束后 wallpaper 与 preset 已通过现有 Theme 链路保存，刷新后仍生效。
9. 不支持 View Transition 或启用 reduced motion 时仍能完成换肤。
10. 失败路径不改变现有主题，且不遗留监听器、临时 DOM、style 或 Object URL。
11. 原型可以连续完成至少 5 次不同图片换肤，不出现明显卡顿或状态错乱。
12. 录屏中无需额外说明即可理解“拖入图片 -> 页面换肤”的因果关系。

## 10. 原型结束后的决策

原型评审只回答三个问题：

1. 拖放目标是否足够清晰，且不会破坏 Gemini 原生上传心智？
2. preset 匹配是否已经足够产生“图片决定主题”的感觉？
3. Theme Bloom 是否比普通淡入或圆形擦除更具传播价值？

三个问题均成立后，再进入正式功能 PRD、跨浏览器产品化、Undo / Replay 和公开设置入口设计。
