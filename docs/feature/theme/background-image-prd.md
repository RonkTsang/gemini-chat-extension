# Background Image

| **Document Version** | **V1.1** |
| :--- | :--- |
| **Feature Name** | Background Image |
| **Created Date** | Feb 20, 2026 |
| **Status** | ❌ Not Implemented |

## 1. Background
当前主题能力已支持预设色，但页面背景仍较单一。用户希望在 Gemini 页面启用自定义背景图，并通过毛玻璃效果提升整体层次感与可读性。

## 2. Goal
新增“背景图”能力，支持：
- 页面级背景图启用与模糊强度配置
- 侧边栏半透明毛玻璃化
- 消息气泡毛玻璃效果开关
- 隐藏与背景图冲突的默认渐变层

## 3. Scope
本期包含以下能力：
1. 启用背景图并应用到主容器
2. 侧边栏在 Light / Dark 下的半透明样式
3. 用户消息、模型消息的毛玻璃效果开关
4. 隐藏输入框与侧边栏列表默认渐变层
5. 设置面板中“消息毛玻璃效果”旁增加 info 图标，hover/focus 展示性能提示（多语言）

不包含：
- 背景图上传能力的存储实现细节（如上传服务）
- 新增滤镜类型（仅支持 blur，Dark 下附加 brightness）

## 4. Functional Requirements

### 4.1 配置项
建议新增以下配置字段（命名可在开发阶段微调）：
- `backgroundImageEnabled`: `boolean`，是否启用背景图
- `backgroundImageUrl`: `string`，背景图 URL / Data URL
- `backgroundBlurPx`: `number`，背景模糊强度（px）
- `messageGlassEnabled`: `boolean`，是否启用消息毛玻璃效果

#### 4.1.1 配置约束与默认值
1. 背景图文件约束
- 支持格式：`image/png`、`image/jpeg`、`image/webp`
- 大小上限：`5MB`（超出后阻止保存并提示）

2. 默认值（首次安装/无历史配置）
- `backgroundImageEnabled`: `false`
- `backgroundImageUrl`: `""`
- `backgroundBlurPx`: `5`
- `messageGlassEnabled`: `false`

3. 数值边界
- `backgroundBlurPx` 范围：`0 - 20`
  - 小于 `0` 按 `0` 处理
  - 大于 `20` 按 `20` 处理

4. 固定视觉参数（非用户配置）
- Dark 背景亮度：`brightness(0.5)`
- 侧边栏模糊：`10px`
- 消息毛玻璃 blur：用户消息 Light `20px` / Dark `10px`；模型消息 Light `20px` / Dark `20px`

### 4.1.2 设置项 UI 与交互定义
1. 设置项
- `Enable Background Image`：Switch，控制 `backgroundImageEnabled`
- `Background Image Upload`：上传入口，写入 `backgroundImageUrl`
- `Blur Intensity`：Slider，控制 `backgroundBlurPx`
- `Message Glass Effect`：Switch，控制 `messageGlassEnabled`

开关联动规则：
- 当用户上传图片成功并写入 `backgroundImageUrl` 后，自动将 `backgroundImageEnabled` 置为 `true`
- 当用户删除当前图片并清空 `backgroundImageUrl` 后，自动将 `backgroundImageEnabled` 置为 `false`

2. Message Glass 的 info 提示
- 在 `Message Glass Effect` 标题右侧增加一个小型 info 图标（`i`）
- 鼠标 hover 或键盘 focus 到图标时显示 tooltip
- tooltip 为只读提示，不影响开关状态

3. 多语言文案（示例）
- `zh-CN`：`开启后可获得毛玻璃视觉效果。对于低性能设备，可能会影响流畅度。`
- `en-US`：`Enabling this adds a glass effect. It may impact performance on low-end devices.`
- 若当前语言缺失，回退到 `en-US`

### 4.2 页面背景图（主容器）
容器选择器：`chat-app`

实现方式：
- 在 `chat-app` 上增加 `::before` 覆盖层承载背景图
- `chat-app` 本身需具备可承载绝对定位子层的定位上下文

样式规则：
1. 基础（Light）
- `content: "";`
- `position: absolute;`
- `inset: 0;`
- `background-image: <用户设置>;`
- `filter: blur(<backgroundBlurPx>px);`

2. Dark
- `filter: blur(<backgroundBlurPx>px) brightness(0.5);`

备注：
- 需确保内容层级位于背景层之上，避免遮挡交互元素。

### 4.3 左侧侧边栏样式
容器选择器：`bard-sidenav-container > bard-sidenav`

Light：
- `background-color: rgba(246, 240, 224, 0.11);`
- `backdrop-filter: blur(10px);`

Dark：
- `background-color: color-mix(in srgb, var(--theme-600), transparent 80%);`
- `backdrop-filter: blur(10px);`

### 4.4 消息毛玻璃效果（开关）

#### 4.4.1 用户消息样式
选择器：`user-query user-query-content span.user-query-bubble-with-background`

开启消息毛玻璃效果（Light）：
- `background-color: color-mix(in srgb, var(--gem-sys-color--surface-container-high), transparent 60%);`
- `backdrop-filter: blur(20px);`
- `border: 1px #f2f2f2 solid;`

开启消息毛玻璃效果（Dark）：
- `background-color: color-mix(in srgb, var(--gem-sys-color--surface-container-high), transparent 40%);`
- `backdrop-filter: blur(10px);`
- `box-shadow: 0 0 1px 0 #ffffff;`

#### 4.4.2 模型消息样式
选择器：`model-response response-container`

通用：
- `padding: 12px;`

Light：
1. 开启消息毛玻璃效果：
- `background: color-mix(in srgb, var(--theme-50), transparent 80%);`
- `backdrop-filter: blur(20px);`
- `border: 1px #f2f2f2 solid;`

2. 未开启消息毛玻璃效果：
- `background: var(--theme-25);`

Dark：
1. 开启消息毛玻璃效果：
- `background: color-mix(in srgb, var(--theme-600), transparent 60%);`
- `backdrop-filter: blur(20px);`
- `box-shadow: 0 0 1px 0 #ffffff;`

2. 未开启消息毛玻璃效果：
- `background-color: transparent;`

### 4.5 隐藏默认渐变层
为避免背景图与默认渐变叠加导致视觉脏污，启用背景图时需隐藏以下元素：

1. 输入框顶部渐变
- 选择器：`input-container::before`
- 样式：`visibility: hidden;`

2. 侧边栏列表顶部渐变
- 选择器：`bard-sidenav-container > bard-sidenav > side-navigation-content > div > div > infinite-scroller .top-gradient`
- 样式：`visibility: hidden;`

3. 侧边栏列表底部渐变
- 选择器：`bard-sidenav-container > bard-sidenav > side-navigation-content > div > div > infinite-scroller .bottom-gradient`
- 样式：`visibility: hidden;`

### 4.6 状态优先级与生效规则
1. 背景图渲染优先级
- 仅当 `backgroundImageEnabled = true` 且 `backgroundImageUrl` 非空时渲染 `chat-app::before`
- 其余情况不渲染背景图层（或清空 `background-image`）
- 上传/删除图片触发的自动开关变更优先于手动开关状态（见 4.1.2 联动规则）

2. 渐变层隐藏规则
- 仅在背景图生效时隐藏（见 4.5）
- 背景图关闭或无有效图片时，恢复默认可见性

3. 消息毛玻璃规则
- `messageGlassEnabled = true`：命中 4.4 的玻璃规则
- `messageGlassEnabled = false`：命中 4.4 的非玻璃规则
- 该开关与背景图开关解耦，可独立生效

4. 模式切换规则
- Light / Dark 切换时，不改变用户配置值，仅切换对应样式分支
- 页面刷新后按持久化配置恢复

## 5. UX & Interaction
### 5.1 主流程
1. 用户开启背景图后，页面即时生效并自动保存。
2. 用户上传有效图片后立即预览，且自动开启背景图开关；刷新后保持。
3. 用户调整背景模糊值后，背景滤镜即时更新。
4. 用户开启/关闭消息毛玻璃效果时，仅消息容器视觉规则切换，不影响文本内容与排版。
5. Light / Dark 模式切换时，样式自动套用对应规则。

### 5.2 异常与反馈
1. 文件类型不支持：拦截并提示 `仅支持 PNG/JPG/WebP`。
2. 文件超限（> 5MB）：拦截并提示 `图片大小不能超过 5MB`。
3. 图片读取失败：提示 `图片加载失败，请重试`，保留上一次有效配置。
4. blur 输入越界：自动 clamp 到 `0-20` 并在 UI 显示矫正后的值。

### 5.3 可访问性
1. info 图标可通过键盘 focus 触达并展示 tooltip。
2. tooltip 文案需进入 i18n 资源，支持屏幕阅读器读取（使用语义化属性）。

## 6. Technical Notes
1. 建议复用当前主题注入链路（如 `inject.ts`）统一管理样式插入、更新与清理。
2. 建议将背景图与毛玻璃样式拆分为独立 style block，便于按开关精确更新。
3. 所有新增样式需支持幂等更新，避免重复注入。
4. 需处理 DOM 尚未挂载时的重试或观察机制，确保目标节点出现后可应用样式。
5. 该功能运行于 Chrome 插件场景，本期不单独设计 `backdrop-filter` 浏览器兼容性降级方案。
6. 性能风险通过设置面板 info tooltip 提示用户，不阻断功能使用。
7. 建议埋点字段：开关变化、上传成功/失败、超限拦截、blur 调整次数。

## 7. Acceptance Criteria
1. 开启背景图后，`chat-app` 可显示用户配置的背景图，并按配置应用 blur。
2. Dark 模式下背景层自动附加 `brightness(0.5)`。
3. 侧边栏在 Light / Dark 下均符合指定透明与模糊规则。
4. 开启消息毛玻璃时，用户消息与模型消息命中对应规则；关闭后回退到非毛玻璃样式。
5. 启用背景图时，输入框与侧边栏列表的顶部/底部渐变层可见性为 hidden。
6. 页面刷新后配置保持，视觉效果可自动恢复。
7. 背景图上传时仅接受 PNG/JPG/WebP，且文件大小超过 `5MB` 时可被拦截并给出提示。
8. 无历史配置时，默认值为：背景图关闭、背景模糊 `5px`、消息毛玻璃关闭。
9. `Message Glass Effect` 右侧展示 info 图标，hover 与 focus 均可触发 tooltip。
10. tooltip 至少提供 `zh-CN` 与 `en-US` 文案，缺失语言时回退 `en-US`。
11. 当 `backgroundImageEnabled=false` 或 `backgroundImageUrl` 为空时，不应渲染背景图层，且默认渐变层恢复。
12. 开关/上传/滑杆的配置变更均自动保存，刷新后可恢复。
13. 上传图片成功后，`Enable Background Image` 自动切换为开启状态。
14. 删除图片后，`Enable Background Image` 自动切换为关闭状态。

## 8. Risks
1. `backdrop-filter` 在低性能设备可能造成掉帧，需要关注滚动与长会话场景。
2. DOM 结构变动会导致选择器失效，需要预留容错与版本兼容策略。
3. 背景图过亮或过暗可能影响可读性，后续可考虑叠加遮罩强度配置。

## 9. Milestones
1. PRD 评审与冻结
2. 样式注入与配置联调
3. Light / Dark 视觉验收
4. 回归测试与发布
