# Chat Layout Requirement Plan

| **Document Version** | **V1.0** |
| :--- | :--- |
| **Feature Name** | Chat layout |
| **Related Issue** | [#37 Adjustable Chat Container Width](https://github.com/RonkTsang/gemini-chat-extension/issues/37) |
| **Status** | Draft |

## 1. 背景

Gemini 使用固定的聊天内容宽度。在高分辨率或宽屏设备上，页面两侧会留下大量空白；长文本、代码和表格也无法充分利用横向空间。用户还可能希望输入区域与聊天内容保持一致，或改变用户消息的对齐和宽度表现。

这些需求都直接作用于当前聊天页面，既适合通过 Top Bar 中的轻量入口即时调节，也属于 Theme 所承载的页面呈现设置。Theme 提供固定入口，Top Bar 面板提供快捷入口。

## 2. 产品目标

1. 让用户在当前 Gemini 页面直接调整聊天内容与输入区域宽度，并即时看到效果。
2. 允许输入区域跟随聊天宽度，避免两处重复配置和视觉错位。
3. 提供用户消息左 / 右对齐及更充分利用横向空间的能力。
4. 将 Chat layout 集成到现有 Theme 设置内容中，不新增独立的主设置导航页。
5. 默认不改变 Gemini 原生布局；用户随时可以恢复原始表现。

## 3. 产品范围

### 3.1 V1 包含

1. Theme 设置页与 Theme floating panel 中的固定 Chat layout 区块。
2. Top Bar 中的 Chat layout 快捷入口。
3. Top Bar customization 中独立的入口显示开关。
4. 锚定在入口图标下方的 Chat layout 快捷面板。
5. Chat Width 的 `Default`、`%`、`px` 三种模式。
6. Input Width 的 `Default`、`%`、`px` 三种模式。
7. Chat Width 与 Input Width 的同步能力。
8. User messages 的左 / 右对齐。
9. 允许用户消息使用完整聊天宽度。
10. 设置持久化、非法值归一化及实时页面更新。
11. Chat Width 对 Gemini 表格内容的兼容。

### 3.2 V1 不包含

1. Font size、line height、段落间距或 Markdown 排版覆写。
2. Message text color；它继续属于 Theme 的色彩设置。
3. 拖拽文件放置状态下的 Input Width 特殊处理。
4. 为桌面端和移动端分别保存宽度。
5. 按对话保存不同设置。
6. Deep Research 等页面模式的独立宽度预设。
7. 隐藏 Gemini 原生免责声明或修改其他无关页面元素。
8. 独立的主设置导航页或额外 Live Preview；Chat layout 复用 Theme 容器，当前 Gemini 页面就是实时预览。

## 4. 信息架构与命名

用户侧功能名称统一使用 **Chat layout**。内部继续保留既有 `chatSettings` service、storage key、类型与事件名称。

推荐文案如下：

| Requirement Name | User-facing Copy | 理由 |
| :--- | :--- | :--- |
| Chat layout | `Chat layout` | 明确表达它控制聊天页面的空间布局 |
| Chat Width | `Chat Width` | 与同类产品对聊天内容宽度的常见称呼一致 |
| Input Width | `Input Width` | 与 Chat Width 形成清晰的一组控制 |
| Sync Chat width and Input Width | `Sync Chat Width and Input Width` | 直接说明被同步的两个对象 |
| User message | `User messages` | 表明规则作用于所有用户消息 |
| Align | `Alignment` | 与图标组合后语义完整 |
| Full Width | `Allow full-width messages` | 说明这是放宽消息最大宽度，而不是强制短消息拉满 |

辅助说明：

- `Chat Width`：Set the maximum width of the chat.
- `Input Width`：Set the maximum width of the prompt area.
- `Sync Chat Width and Input Width`：Keep the input area aligned with the chat.
- `Allow full-width messages`：Let long user messages use the full chat width.

## 5. 入口

### 5.1 位置

入口位于 Gemini Top Bar 的现有 Theme 入口左侧：

```text
[Chat layout] [Theme] [Gemini native action]
```

要求：

1. 使用 `src/assets/chat-width.svg`。
2. 图标尺寸、点击区域、hover、focus 和颜色跟随 Theme 入口。
3. accessible label 与 tooltip 使用 `Chat layout`。
4. Chat layout 与 Theme 顺序固定；Gemini DOM 更新或入口重建后仍保持 Chat layout 在 Theme 左侧。

### 5.2 入口开关

在 `Settings > Enhancements > Top bar customization` 中新增：

- Title：`Show Chat layout shortcut`
- Description：`Show a shortcut to Chat layout in Gemini's top bar.`
- Default：`true`

该开关只控制快捷入口是否显示，不是 Chat layout 的总开关：

1. 关闭入口后，已经保存并应用的布局设置保持生效。
2. 再次开启入口时恢复相同设置。
3. 如果入口关闭时面板处于打开状态，应同时关闭面板。
4. Theme 入口显示开关与 Chat layout 入口显示开关互不影响。
5. 即使快捷入口关闭，用户仍可从 Theme 设置页访问 Chat layout。

## 6. 快捷面板

### 6.1 容器

点击入口后，在 `src/assets/chat-width.svg` 图标下方打开快捷面板。

面板沿用 Theme 容器的视觉语言：

- Chakra UI 组件与项目现有 theme tokens。
- `gemSurface` 背景、muted border、`lg` 圆角和 `lg` shadow。
- 桌面端建议宽度 `320px`。
- 高度随内容自适应，不继承 Theme 面板的 `520px` 最小高度。
- 不展示 Header、标题、返回按钮或 Close 按钮；打开后直接呈现设置内容。
- 面板容器仍需提供 `Chat layout` accessible name。
- 面板优先将右边缘与入口图标右边缘对齐，垂直间距建议为 `8px`。
- 空间不足时应在视口内平移，避免面板被左右边缘裁切。

### 6.2 打开与关闭

1. 点击关闭状态的入口：打开 Chat layout 快捷面板。
2. 再次点击相同入口：关闭面板。
3. 点击面板外部或按 `Escape`：关闭面板。
4. 打开 Chat layout 快捷面板时，关闭 Theme floating panel 和 Settings panel。
5. 打开 Theme 或 Settings 时，关闭 Chat layout 快捷面板。
6. 面板关闭不撤销已经修改的值。
7. 页面 resize、Top Bar 重建或入口位置变化时，面板保持锚定；入口消失时关闭面板。

## 7. 面板内容

推荐布局：

```text
Chat Width                 [ Default | % | px ]
[ Slider ---------------- 50% ]

Input Width                [ Default | % | px ]
[ Slider ---------------- 50% ]
[✓] Sync Chat Width and Input Width

------------------------------

User messages

Alignment              [ Left | Right ]
Allow full-width messages     [Switch]
```

Chat Width / Input Width label 与对应的 Segmented Control 放在同一行，Slider 单独位于下一行。Slider 仅在对应宽度不是 `Default` 时出现。同步开启时，两组宽度控件保持可编辑，详见 8.3。

## 8. 设置行为

### 8.1 Chat Width

控制聊天内容容器的最大宽度。

| Mode | 行为 | 默认值 | 范围 | Step |
| :--- | :--- | :--- | :--- | :--- |
| `Default` | 不注入宽度覆写，保留 Gemini 原生样式 | — | — | — |
| `%` | 使用相对宽度 | `50%` | `35%–100%` | `1%` |
| `px` | 使用固定最大宽度 | `760px` | `700–2000px` | `10px` |

交互：

1. 首次进入 `%` 或 `px` 时使用该模式默认值。
2. `%` 和 `px` 分别记忆最后一次使用的数值。
3. 模式切换后立即应用该模式最近的值，不进行 `%` 与 `px` 的自动换算。
4. 切换到 `Default` 时移除 Chat width 自定义样式，但保留 `%` 和 `px` 的最近值。
5. Slider 拖动期间实时更新当前页面；松开后持久化最终值。
6. Slider 右侧持续显示当前数值和单位，不能只依赖拖动 tooltip。
7. 实际可见宽度仍受当前 viewport 可用空间限制，不应产生页面级横向滚动。

### 8.2 Input Width

控制 Prompt 输入区域的最大宽度。模式、默认值、范围、Step 和模式记忆规则与 Chat Width 相同。

`Default` 表示恢复 Gemini 原生 Input Width，不代表自动跟随 Chat Width；跟随行为只由 `Sync Chat Width and Input Width` 控制。

### 8.3 Sync Chat Width and Input Width

使用 Chakra UI `Checkbox`，默认开启。

开启时：

1. Input Width 立即继承 Chat Width 的 mode 和 value。
2. 修改 Chat Width 时，Input Width 同步实时更新。
3. 修改 Input Width 时，Chat Width 同步实时更新。
4. 两组 Segmented Control 和 Slider 均保持可用，并展示相同的 mode 和 value。
5. Chat Width 为 `Default` 时，Input Width 同样恢复原生样式；反向操作同理。
6. 两组 mode、百分比值和 px 值在持久化数据中保持一致。

关闭时：

1. 保留关闭同步时两组控件的当前 mode 和 value。
2. 之后两组宽度可以分别修改。

该设计让两个入口具备对称行为：用户可以从正在关注的 Chat 或 Input 一侧直接调整，不需要先关闭同步或切换到另一组控件。

### 8.4 User messages — Alignment

使用两项 Segmented Control：

- Left：使用 `src/assets/left-align.svg`
- Right：使用 `src/assets/right-align.svg`

规则：

1. 默认选择 `Right`，维持 Gemini 原生表现。
2. 选择 `Left` 后，用户消息、附件预览和消息正文统一左对齐。
3. 选择 `Right` 时移除左对齐覆写，优先恢复 Gemini 原生规则。
4. 两个纯图标选项必须提供 tooltip、accessible label 和 selected state。

### 8.5 Allow full-width messages

使用 Chakra UI `Switch`，默认关闭。

规则：

1. 开启后，用户消息气泡的最大宽度可以达到当前 Chat Width。
2. 该选项只放宽最大宽度，不强制短消息填满整行。
3. 关闭后恢复 Gemini 原生用户消息最大宽度。
4. Alignment 与该选项相互独立；短消息仍按选中的 Alignment 对齐。

## 9. 默认状态与恢复

新用户与缺失配置使用：

| Setting | Default |
| :--- | :--- |
| Show Chat layout shortcut | `true` |
| Chat Width mode | `Default` |
| Chat Width `%` value | `50%` |
| Chat Width `px` value | `760px` |
| Input Width mode | `Default` |
| Input Width `%` value | `50%` |
| Input Width `px` value | `760px` |
| Sync Chat Width and Input Width | `true` |
| User message alignment | `Right` |
| Allow full-width messages | `false` |

V1 不增加全局 Reset 按钮：

- 每个宽度控件的 `Default` 就是该宽度的恢复入口。
- User messages 的原始表现可通过 `Right` + 关闭 `Allow full-width messages` 恢复。

## 10. 设置数据建议

推荐存储独立的 mode 和各单位最近值，使用户切换单位时不会丢失之前的调节结果：

```ts
type ChatWidthMode = 'default' | 'percent' | 'px'
type UserMessageAlignment = 'left' | 'right'

interface ChatSettings {
  chatWidthMode: ChatWidthMode
  chatWidthPercent: number
  chatWidthPx: number
  inputWidthMode: ChatWidthMode
  inputWidthPercent: number
  inputWidthPx: number
  syncInputWidth: boolean
  userMessageAlignment: UserMessageAlignment
  userMessageFullWidth: boolean
}
```

`showChatSettingsShortcut` 应继续属于现有 Top Bar customization settings，而不是 `ChatSettings`。

归一化规则：

1. 未知 mode 回退到 `default`。
2. 非有限数值回退到对应默认值。
3. `%` 值 clamp 到 `35–100`。
4. `px` 值 clamp 到 `700–2000`。
5. 未知 Alignment 回退到 `right`。
6. 非 boolean 值回退到对应默认值。

## 11. 技术实现约束

本节只定义实现边界；具体模块拆分由实现计划决定。

### 11.1 入口与 Overlay

1. 入口观察、插入、Top Bar 重建和清理逻辑参考现有 Theme top-bar action。
2. Chat layout 快捷入口必须插入 Theme 入口左侧。
3. Chat layout 快捷面板在 `src/entrypoints/content/overlay/index.tsx` 中挂载。
4. 面板使用 Chakra UI，并复用 Theme floating panel 的 surface、border、radius 与 shadow；不复用 Header。
5. 快捷面板定位必须以真实 Chat layout 入口 DOM 为 anchor，不使用固定 bottom-right 定位。
6. Theme 设置页与 Theme floating panel 通过同一个可复用 Chat layout 组件，在 Wallpaper 后显示固定设置区块。
7. 入口 observer、事件监听、定位监听与注入 DOM 必须有完整停止和清理路径。

### 11.2 CSS Scope

所有 Chat layout 样式必须限定到主对话窗口：

```css
chat-window:not(.preview-chat-window):not(.in-gems-mode)
```

Gem 创建/编辑页中的预览对话带有 `preview-chat-window` 与 `in-gems-mode`，因此不得命中任何 Chat Width、Input Width、User message 或 Gem Avatar 对齐覆写。该隔离由 CSS selector 完成，不依赖 Gem Avatar 功能是否启用。

### 11.3 Chat Width

目标选择器：

```css
infinite-scroller > div.conversation-container
```

应用：

```css
max-width: var(--gpk-chat-width) !important;
```

`Default` mode 不设置 `--gpk-chat-width`，并移除对应启用标记或覆写规则。

为适配 Gemini 最新的消息容器宽度约束，Chat Width 启用时还需在同一启用标记下添加：

```css
infinite-scroller > div.conversation-container user-query {
  max-width: 100% !important;
}
```

该规则必须限定在目标 `conversation-container` 内，并随 Chat Width 恢复 `Default` 而失效。

表格兼容参考：

```text
.original/chat_width_reference/style_modification_rules.md
```

V1 的兼容目标：

1. 表格外层不能撑破 Chat Width。
2. 表格内容超宽时由表格内容区域横向滚动。
3. 不使用 `overflow-x: hidden` 裁切表格内容。
4. 表格规则仅作用于目标 Chat 容器内的 `table-block` / `.table-block`，不扩大到页面其他区域。

### 11.4 Input Width

目标选择器：

```css
input-container > fieldset
```

应用：

```css
max-width: var(--gpk-input-width) !important;
```

V1 暂不处理文件拖拽放置状态下动态插入的 Drop Zone。

### 11.5 User message alignment

Left：

```css
user-query-content {
  justify-content: flex-start;
}

user-query-content .file-preview-container {
  justify-content: flex-start;
  margin-inline-start: unset;
}

user-query-content .file-preview-container user-query-file-carousel {
  justify-content: flex-start;
}

user-query-content .query-content {
  margin-inline-start: unset;
  padding-inline-start: unset;
  justify-content: flex-start;
}
```

Gem Avatar 兼容：当 Gem Avatar 功能已注入用户头像时，Left 还需将 `.gpk-gem-avatar-message-user` 对齐到 Model Avatar 的定位：

```css
user-query-content > div.user-query-container > .gpk-gem-avatar-message-user {
  left: -12px;
  right: auto;
  transform: translateX(-100%);
}
```

规则仅在 Left 状态下生效；未启用 Gem Avatar 时不会匹配任何元素。

Right：

- 移除以上自定义覆写，恢复 Gemini 原生右对齐。

### 11.6 User message full width

目标选择器：

```css
user-query user-query-content span.user-query-bubble-with-background
```

应用：

```css
max-width: 100%;
```

规则必须限定在 `user-query` 内，不能影响 Input area 或 Gemini response。

## 12. 可访问性

1. Top Bar 入口、Left、Right 图标均必须有 accessible label。
2. Segmented Control 支持方向键切换、清晰的 focus ring 和选中态。
3. Slider 支持键盘调节，并向辅助技术暴露数值与单位。
4. Checkbox 与 Switch 的 label 都可点击。
5. 同步开启时，两组宽度控件都必须保持可操作并反馈相同结果。
6. 快捷面板打开后焦点进入面板，关闭后回到 Chat layout 入口。
7. `Escape` 关闭面板时不改变设置。

## 13. 验收标准

### 13.1 入口与面板

1. Chat layout 快捷入口显示在 Theme 左侧，并使用指定 `src/assets/chat-width.svg`。
2. 开关可以独立显示 / 隐藏 Chat layout 快捷入口，不影响 Theme 入口或 Theme 内的固定设置。
3. 面板从入口下方打开，视觉样式与 Theme 容器一致且高度紧凑。
4. 同一时间只显示 Chat layout 快捷面板、Theme floating panel、Settings 中的一个面板。
5. 点击入口、外部区域和按 `Escape` 均符合关闭规则。
6. Gemini 重建 Top Bar 后，入口顺序、开关状态和面板行为保持正确。
7. Theme 完整设置页与 Theme floating panel 均在 Wallpaper 后显示 Chat layout。
8. Wallpaper 关闭或未配置时，Theme 中的 Chat layout 仍保持可见和可操作。
9. 从任一入口修改后，其他入口通过同一 storage 状态显示相同结果。

### 13.2 宽度

1. 两个宽度控件均支持 `Default`、`%`、`px`。
2. `Default` mode 不改变 Gemini 原生 max-width。
3. `%` 和 `px` Slider 使用定义的默认值、范围和 Step。
4. `%` 与 `px` 分别记忆最后值，切换 mode 不丢失。
5. 拖动 Slider 时页面即时变化，刷新后恢复最终设置。
6. 宽度不会造成页面级横向滚动。
7. 表格不撑破聊天区域，超宽表格可以在内容区域横向滚动。

### 13.3 同步

1. Sync Chat Width and Input Width 默认开启。
2. 同步开启时，修改 Chat Width 会同步更新 Input Width。
3. 同步开启时，修改 Input Width 会同步更新 Chat Width。
4. 关闭同步后，两组控件从当前相同值开始，可分别调整。
5. 同步状态在刷新后保持。

### 13.4 User messages

1. Right 保持 Gemini 原生表现。
2. Left 同时正确对齐文本、附件预览和文件 carousel。
3. Allow full-width messages 只放宽用户消息最大宽度。
4. 两个 User messages 设置彼此独立，并在刷新后保持。

## 14. 测试重点

实现阶段至少覆盖：

1. 普通纯文本对话。
2. 长用户消息与短用户消息。
3. 带附件 / 文件 carousel 的用户消息。
4. 包含宽表格的 Gemini response。
5. `%`、`px`、`Default` 来回切换。
6. 同步开启 / 关闭、从 Chat Width 修改及从 Input Width 反向修改。
7. 视口宽度小于设置的 `px` max-width。
8. Top Bar 重建、入口开关变化和面板打开时入口消失。
9. 刷新、跨标签页同步和非法存储值恢复。
