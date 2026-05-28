# Message Glass Light/Dark Transparency

## 背景

当前 `Message Glass Effect` 已经有独立的玻璃透明度和模糊控制，但模型回复的历史默认值在 Light 和 Dark 模式并不一致：

| Surface | Light legacy | Dark legacy |
|---|---:|---:|
| User bubble | `transparent 40%` | `transparent 40%` |
| Model response | `transparent 40%` | `transparent 90%` |
| Dual model response | `transparent 40%` | `transparent 60%` |

这不是单纯的数字不统一。Dark 模式下模型回复使用更亮的 surface，例如 `--theme-200`，再用 `transparent 90%` 让最终盖层非常轻。如果把 Light 的 `transparent 40%` 直接套到 Dark，Dark 模型回复会从几乎透明变成明显的亮色块，视觉上会突变。

目前相关代码路径：

- `src/entrypoints/content/gemini-theme/background/types.ts`
  - 已有 `messageGlassLightTransparency` / `messageGlassDarkTransparency` 和各自 customized flag 的数据结构雏形。
- `src/entrypoints/content/gemini-theme/background/styleController.ts`
  - 目前仍主要向 CSS 暴露单一 `--gpk-msg-glass-transparency`。
- `src/entrypoints/content/gemini-theme/background/style.css`
  - legacy 分支保留了 Dark model 的 `--theme-200` + `transparent 90%`。
  - customized 分支仍使用单一透明度变量覆盖 Light/Dark。
- `src/components/setting-panel/views/theme/CustomBackground.tsx`
  - 当前 UI 仍是一个玻璃透明度 slider。
- `src/components/setting-panel/views/theme/LivePreview.tsx`
  - 当前预览跟随单一 slider，并在未 customized 时模拟 legacy Light/Dark 默认值。

## 思考

### 1. 透明度数字不是用户真正关心的目标

`transparent 40%` 是 CSS 混色参数，不等于用户在 UI 中调节的“背景透出”。感知结果还取决于：

- surface 本身的明暗，例如 `--theme-50`、`--theme-200`、`--theme-600`。
- 背后壁纸的亮度、对比度和纹理。
- Light/Dark 模式下文字、容器和 Gemini 原生 surface 的层级差异。

所以“同一个 CSS 透明度同时作用于 Light 和 Dark”技术上简单，但产品上容易让其中一个模式突变。

### 2. 只替换 Dark surface 不能单独解决问题

可以用更暗的 Dark surface 抵消透明度差异，例如：

```css
color-mix(in srgb, var(--theme-950), var(--theme-200) 10%)
```

这个方向能让 Dark 在较低透明度下接近历史亮度，但如果在用户第一次移动 slider 时才从 `--theme-200` 切到这个校准 surface，依旧会跳变。问题从“透明度跳变”变成“surface 跳变”。

因此不能把 `customized=true` 作为 Dark surface 分支开关。只要要做 Dark surface 校准，就必须是连续映射：

- 默认点必须等于 legacy 外观。
- 从默认点往更实、更透两个方向变化时，surface 和透明度都平滑变化。
- 不允许在首次 customized 时切换到另一套离散公式。

### 3. 普通层应使用 `背景透出 0-10`，不应显示百分比

普通用户更熟悉 `0-10` 这种强度模型。建议把用户可见项命名为 `背景透出`，取值范围为 `0-10`，默认值 `5`。

以模型回复为例：

| UI value | Light model actual | Dark model actual |
|---:|---|---|
| `5` | `--theme-50` + `transparent 40%` | `--theme-200` + `transparent 90%` |

这意味着 `5` 是“默认背景透出”，不是 `5%` 或 `50%` 透明度。UI 继续显示 `%` 会让用户自然理解为 CSS 百分比，这会和实际映射冲突。

`背景透出` 也比 `清透度` 更不容易和 `玻璃模糊` 混淆：

- `背景透出`：控制消息背景中壁纸露出的程度。
- `玻璃模糊`：控制透出背景被虚化的强度。

### 4. 兼容性的底线

历史兼容要分两类用户：

1. 从未动过玻璃透明度的用户
   - `messageGlassTransparencyCustomized=false`
   - 升级后必须继续看到 legacy 外观。
   - Light model 仍是 `transparent 40%`。
   - Dark model 仍是 `transparent 90%`。

2. 已经使用旧版单 slider 调过透明度的用户
   - 他们的设置代表“我接受这个绝对透明度同时作用于 Light/Dark”。
   - 升级到 light/dark 分离后，应把旧 `messageGlassTransparency` 复制到 Light 和 Dark 两个 customized 值。
   - 不能自动把旧值改成新的感知映射，否则这些用户会在升级时看到外观变化。

现有 normalization 已经有一个正确方向：当旧的全局 `messageGlassTransparencyCustomized=true`，且缺少 light/dark 字段时，用旧全局值回填两个新字段。后续实现应保留这个迁移语义。

## 方案

修正后的推荐方案：不要把主问题定义成 “Dark model response 如何校准”，也不要优先暴露 Light/Dark 两套设置。主问题应定义为：

> 一个 UI 控件不能再作为“绝对 CSS 透明度”直接覆盖所有 surface，而应该作为“相对历史默认观感的背景透出调节”。

### 1. 默认 UI：一个相对背景透出控制

默认仍只展示一个主控制，但它不表示 CSS `transparent %`：

```text
背景透出        5
不透出  [ 0 ... 5 ... 10 ]  更透
```

交互含义：

- 用户看到的是一个“背景透出”概念，而不是 CSS `transparent %`。
- `5` 是所有 surface 的历史默认观感。
- `0` 表示背景尽量不透出，消息块更实。
- `10` 表示背景透出最多，玻璃感更强。
- 每个 surface/mode 都以自己的 legacy transparency 作为锚点。
- Light/Dark、user/model 的实际 CSS 透明度可以不同。
- 用户拖动 slider 时，所有 surface 都从自己的历史默认值连续变化，不发生首次 customized 跳变。
- Blur 继续保持一个全局 slider，不拆 Light/Dark，因为 blur 是物理 px，模式差异没有透明度明显。

### 2. 核心算法：per-surface legacy anchor

每个 surface/mode 保留自己的 legacy 默认透明度：

| Surface | Light anchor | Dark anchor |
|---|---:|---:|
| User bubble | `40` | `40` |
| Model response | `40` | `90` |
| Dual model response | `40` | `60` |

把 UI 背景透出 `backgroundVisibility` 映射到实际 CSS `transparent`：

```ts
function resolveTransparency(
  backgroundVisibility: number,
  legacy: number,
): number {
  const value = Math.min(10, Math.max(0, Math.round(backgroundVisibility)))

  if (value < 5) {
    return Math.round(legacy * (value / 5))
  }

  return Math.round(
    legacy + (100 - legacy) * ((value - 5) / 5),
  )
}
```

含义：

- `backgroundVisibility = 5` 时，实际值完全等于 legacy，不会跳变。
- `backgroundVisibility < 5` 时，从 legacy 平滑走向更实的 `0`。
- `backgroundVisibility > 5` 时，从 legacy 平滑走向更透的 `100`。
- 同一个背景透出值不再承诺 “所有 surface 的 CSS 百分比相同”，只承诺 “所有 surface 相对各自默认值同步变实或变透”。

Dark 模式示例：

| 背景透出 | User dark actual | Model dark actual | Dual dark actual |
|---:|---:|---:|---:|
| `4` | `32%` | `72%` | `48%` |
| `5` | `40%` | `90%` | `60%` |
| `6` | `52%` | `92%` | `68%` |

这直接解决两个跳变：

- 当前实现的 Dark model 首次调整：不会从 `90%` 掉到全局 `40%`。
- 如果 UI 默认改成 `5`：User dark 仍保持 legacy `40%`，不会跳到 CSS `50%` 或其他绝对值。

### 3. 最佳效果补充：Dark 需要 surface + transparency 双轴映射

上面的 per-surface legacy anchor 只解决了“透明度不要跳变”，但它还没有完整表达 `背景透出` 的产品语义。

如果 `背景透出 = 0` 表示“背景尽量不透出，消息块更实体”，那么 Dark 模式不能只把 legacy surface 的 `transparent` 降到 `0`。例如 Dark model 的 legacy surface 是偏亮的 `--theme-200`：

```css
color-mix(in srgb, var(--theme-200), transparent 0%)
```

这会得到一个偏亮实色块，而不是更接近 Dark 模式实体面的结果。更符合直觉的方向是：

```text
背景透出 0  -> 接近 dark solid surface，例如 --theme-900，transparent 0%
背景透出 5  -> 完全等于 legacy 默认：--theme-200 + transparent 90%
背景透出 10 -> legacy surface 继续走向 transparent 100%
```

因此从最佳效果出发，resolver 不应只输出 transparency，而应输出 `surfaceColor + transparency`：

```ts
interface ResolvedMessageGlassSurface {
  surfaceColor: string
  transparency: number
}
```

Dark 模式推荐 anchor：

| Surface | Solid surface at `0` | Legacy surface at `5` | Legacy transparency at `5` |
|---|---|---|---:|
| User bubble | `--theme-900` | `--gem-sys-color--surface-container-high` | `40` |
| Model response | `--theme-900` | `--theme-200` | `90` |
| Dual model response | `--theme-900` | `--theme-600` | `60` |

转换算法分两段：

```ts
function resolveSurface(
  backgroundVisibility: number,
  solidSurface: string,
  legacySurface: string,
  legacyTransparency: number,
): ResolvedMessageGlassSurface {
  const value = Math.min(10, Math.max(0, Math.round(backgroundVisibility)))

  if (value <= 5) {
    const progress = value / 5
    return {
      surfaceColor: `color-mix(in srgb, ${solidSurface}, ${legacySurface} ${Math.round(progress * 100)}%)`,
      transparency: Math.round(legacyTransparency * progress),
    }
  }

  const progress = (value - 5) / 5
  return {
    surfaceColor: legacySurface,
    transparency: Math.round(
      legacyTransparency + (100 - legacyTransparency) * progress,
    ),
  }
}
```

这个算法的约束：

- `5` 必须完全等于 legacy，避免升级或首次拖动跳变。
- `0-5` 同时让 surface 从 dark solid surface 过渡到 legacy surface，让 transparency 从 `0` 过渡到 legacy transparency。
- `5-10` 保持 legacy surface，只继续增加背景透出。
- 不能用 `customized=true` 触发离散 surface 切换；surface 和 transparency 都必须连续。
- `LivePreview` 和真实页面必须调用同一个 resolver，不能复制公式。

Light 模式可以暂时保持当前的 transparency-only 映射，因为 Light 的实体面和 legacy surface 通常不会出现“低背景透出反而变亮”的语义冲突。后续如果 review 发现 Light 也需要校准，可以用同一套 anchor 模型扩展。

实现上需要新增 resolved surface CSS 变量，例如：

```css
--gpk-msg-glass-user-dark-surface-color: color-mix(...);
--gpk-msg-glass-model-dark-surface-color: color-mix(...);
--gpk-msg-glass-dual-dark-surface-color: color-mix(...);
```

并继续保留当前 per-surface transparency 变量。CSS 只消费 resolved vars，不承载算法。

### 4. MVP 边界与当前结论

`color-mix(in srgb, var(--theme-950), var(--theme-200) 10%)` 这类 Dark surface 校准不应该进入第一版主方案。

原因：

- 它只处理 Model response，没有处理 User bubble 和 Dual model response。
- 如果 customized 后才切换 surface，会产生 surface 跳变。
- 它会把方案复杂度推高，但仍无法保证不同 wallpaper 下的感知一致。

这个判断对“离散替换 surface”仍然成立。但经过 `背景透出` 语义 review 后，如果产品希望 `0` 明确表示“背景不透出、Dark 下更接近实体暗面”，那么下一步应优先采用上一节的连续双轴 resolver，而不是继续只调整 transparency。

后续如果要做 surface 校准，也必须作为连续映射的一部分，并且每个 surface/mode 都有自己的 default anchor。不能用 `customized=true` 触发离散 surface 切换。

### 5. 高级 UI：分别调整作为逃生口

Light/Dark 分别调整不应作为第一步默认方案。它只作为第二步评估方向，在 `背景透出` 的真实效果完成 review 后再决定是否需要。

```text
背景透出
[ 同步调整 ] [ 分别调整 ]

浅色  5    [ slider ]
深色  5    [ slider ]

[恢复同步调整]
```

这里的 Light/Dark slider 仍然是“相对背景透出”，不是绝对 CSS 透明度。只有在更高级的 debug/advanced 入口中，才考虑暴露 raw CSS transparency。

不推荐“仅调整当前主题”。它会在系统切换 Light/Dark 后制造新的困惑。

### 6. 数据模型方向

如果产品确定使用“背景透出 5 = 默认观感”，建议新增背景透出字段，而不是静默改变旧 `messageGlassTransparency` 的含义：

```ts
messageGlassBackgroundVisibility: number // 0-10, default 5
messageGlassBackgroundVisibilityCustomized: boolean
messageGlassBackgroundVisibilityMode: 'sync' | 'separate'
messageGlassLightBackgroundVisibility: number
messageGlassDarkBackgroundVisibility: number
```

兼容规则：

- 未 customized 老用户：
  - 保持 legacy CSS 分支，或等价迁移为 `messageGlassBackgroundVisibility=5`。
  - 升级视觉必须无变化。
- 已 customized 老用户：
  - 不能把旧 `messageGlassTransparency` 解释成新 `messageGlassBackgroundVisibility`。
  - 旧值代表绝对 CSS transparency。
  - 应迁移到兼容模式或 advanced separate/raw 值，确保升级后实际 CSS 输出不变。
- 新用户：
  - 默认使用 `messageGlassBackgroundVisibility=5`。

### 7. CSS/实现方向

`styleController` 可以直接输出最终 resolved 变量，CSS 不负责算法：

```css
--gpk-msg-glass-user-light-transparency: 40%;
--gpk-msg-glass-user-dark-transparency: 40%;
--gpk-msg-glass-model-light-transparency: 40%;
--gpk-msg-glass-model-dark-transparency: 90%;
--gpk-msg-glass-dual-light-transparency: 40%;
--gpk-msg-glass-dual-dark-transparency: 60%;
```

优点：

- CSS 保持简单。
- `LivePreview` 和真实页面可以复用同一个 resolver。
- 后续如果要加 surface 校准，也可以在 resolver 层扩展，而不是堆 CSS 分支。

如果采用 Dark 双轴映射，不应在 `:root` / root inline style 上直接定义引用 `--theme-*` 的 surface color 变量。`--theme-*` 这类 token 可能只存在于 Gemini 的 theme subtree；如果在 root 层定义：

```css
--gpk-msg-glass-model-dark-surface-color: var(--theme-200);
```

实际使用时可能表现为 `--gpk-msg-glass-model-dark-surface-color` 未定义或无效。

更稳的做法是：

- `styleController` 只输出不依赖 theme token 的数字变量，例如 Dark surface 从 solid 走向 legacy 的 mix 比例。
- `style.css` 在具体 message surface 规则内定义 `--gpk-msg-glass-*-surface-color`，让 `--theme-*` 在正确的元素/theme 作用域内解析。
- 默认蓝色没有 preset CSS，`--theme-*` 不一定存在；所有 `--theme-*` surface 都必须带 Gemini 原生 surface token fallback，否则默认蓝色下 model response 的 `background` 会因变量无效而表现为 `背景透出` 不生效。

```css
:root {
  --gpk-msg-glass-model-dark-surface-legacy-mix: 64%;
}

model-response response-container>div.response-container {
  --gpk-msg-glass-model-light-surface-color: var(
    --theme-50,
    var(--theme-25, color-mix(in srgb, var(--gem-sys-color--surface-container), #ffffff 35%))
  );
}

body.dark-theme model-response response-container>div.response-container {
  --gpk-msg-glass-model-dark-solid-surface-color: var(
    --theme-900,
    var(--gem-sys-color--surface-container-high, var(--gem-sys-color--surface-container, #1f1f1f))
  );
  --gpk-msg-glass-model-dark-legacy-surface-color: var(
    --theme-200,
    var(--gem-sys-color--surface-container-high, var(--gem-sys-color--surface-container, #2d2f31))
  );
  --gpk-msg-glass-model-dark-surface-color: color-mix(
    in srgb,
    var(--gpk-msg-glass-model-dark-solid-surface-color),
    var(--gpk-msg-glass-model-dark-legacy-surface-color) var(--gpk-msg-glass-model-dark-surface-legacy-mix)
  );
}
```

`5 -> 0` 区间的 Dark surface legacy mix 先采用二次曲线，让 bright legacy surface 更快退场，降低“暗 -> 亮 -> 暗”的中段亮度峰值：

```ts
const progress = backgroundVisibility / 5
const legacySurfaceMix = progress ** 2
```

示例：

| 背景透出 | Linear mix | Quadratic mix |
|---:|---:|---:|
| `5` | `100%` | `100%` |
| `4` | `80%` | `64%` |
| `3` | `60%` | `36%` |
| `2` | `40%` | `16%` |
| `1` | `20%` | `4%` |
| `0` | `0%` | `0%` |

这样 CSS 中的消息 surface 始终写成：

```css
background: color-mix(
  in srgb,
  var(--gpk-msg-glass-model-dark-surface-color),
  transparent var(--gpk-msg-glass-model-dark-transparency)
);
```

### 8. 当前执行计划

当前按两步推进，不在第一步预设高级设置一定要做。

#### Step 1: 实现 `背景透出` 并一起 review 效果

目标：

- 先只实现普通层 `背景透出`。
- 取值范围 `0-10`，默认 `5`。
- UI 不显示 `%`。
- `5` 对应所有 surface 的 legacy 默认观感。
- 按 per-surface/per-mode legacy anchor 计算实际 CSS transparency。
- 让 `Live Preview` 和真实 Gemini 页面使用同一套 resolved 结果。
- 完成后基于 Light/Dark、user/model/dual、不同壁纸亮度一起 review 实际视觉效果。

第一步包含：

1. 文案和概念调整
   - 把用户可见的 `Glass transparency` 从百分比心智改为 `Background visibility` / `背景透出`。
   - 普通层使用 `0-10`，默认 `5`。
   - 保留 `玻璃模糊` 作为独立控制，避免和 `背景透出` 混用。

2. 数据模型选择和兼容
   - 如果产品确定使用“背景透出 5 = 默认观感”，建议新增 `messageGlassBackgroundVisibility` / `messageGlassBackgroundVisibilityCustomized`，不要静默改变旧 `messageGlassTransparency` 的含义。
   - `messageGlassTransparency` 继续作为旧版绝对 CSS 透明度字段，用于迁移和兼容。
   - 旧版已经 customized 的用户不能直接解释成 background visibility，需要保留绝对输出。
   - 未 customized 用户保持 legacy 分支。

3. CSS 变量接入
   - `styleController` 暴露 per-surface/per-mode resolved 变量。
   - `style.css` 按 Light/Dark theme host 使用对应 resolved 变量。
   - `LivePreview` 同步使用同一套映射，避免设置和预览不一致。

第一步不包含：

- 不做 Light/Dark 分别调整 UI。
- 不做 raw CSS transparency 高级面板。
- 不做 Dark surface calibration。
- 不默认改变 blur 的交互模型。

#### Step 2: Review 后再决定是否需要高级设置

触发条件：

- `背景透出` 在 Light/Dark 下仍无法满足用户对视觉一致性的期待。
- Dark 模式下低 `背景透出` 的消息块不应继续接近偏亮 legacy surface，而应更接近 `--theme-900` 一类 dark solid surface。
- 用户需要独立调 Light/Dark。
- 用户需要更精细地控制 user/model/dual 的差异。
- Dark model 或特定 wallpaper 下仍存在明显观感偏差。

可能方向：

- 优先把 resolver 升级为 Dark `surface + transparency` 双轴连续映射。
- Light/Dark 分别调整 `背景透出`。
- raw CSS transparency 作为更高级/debug 设置。
- per-surface 设置，例如 user/model/dual 分别调整。
- surface continuous calibration，例如 Dark model 使用连续 surface 映射。

第二步是否进入实现，取决于第一步效果 review，不在当前阶段提前承诺。

## 潜在其他选择

### 选择 A：继续保留单一 CSS 透明度 slider

优点：

- 实现最简单。
- UI 最少。

缺点：

- 当前痛点不解决。
- Light 合适时 Dark 容易突变，Dark 合适时 Light 容易偏厚或偏浅。
- 用户会把它理解为“一个设置控制两个模式”，但实际观感无法一致。

不推荐作为最终方案。

### 选择 B：始终展示 Light/Dark 两个 slider

优点：

- 最透明，最可控。
- 不需要解释自动映射。

缺点：

- 对普通用户心智负担高。
- 设置面板空间占用明显增加。
- 大多数用户不需要一开始就理解两个主题模式的差异。

适合作为高级展开态，不适合作为默认 UI。

### 选择 C：只调整当前主题模式

优点：

- 当前屏幕所见即所得。
- UI 可以只展示一个 slider。

缺点：

- 系统或应用切换主题后，用户会看到数值或效果变化。
- 用户容易困惑：“我刚设置了 40，为什么切到 Dark 变成了 60？”
- 隐式状态太强，不利于长期维护。

不推荐。

### 选择 D：用 Dark 校准 surface 统一透明度

优点：

- 理论上可以让同一个透明度数字在 Light/Dark 下更接近。
- UI 可以保持单 slider。

缺点：

- 如果校准 surface 只在 customized 后启用，会产生首次调整跳变。
- 如果做连续映射，需要引入更复杂的算法和预览一致性测试。
- 不同主题色、不同壁纸亮度下仍无法完全一致。

可以作为 `自动平衡` 的后续增强，但不能作为简单替换。

### 选择 E：保留“透明度 %”文案，但内部做感知映射

优点：

- 文案改动小。

缺点：

- 数字语义不诚实。`50%` 在 Light/Dark 对应的 CSS 可能完全不同。
- 用户和维护者都会误以为这是 CSS 透明百分比。

不推荐。若做映射，应改名为“背景透出”，并使用 `0-10` 等级而不是百分比。
