# Theme

| **Document Version** | **V1.0** |
| :--- | :--- |
| **Feature Name** | Theme |
| **Created Date** | Feb 8, 2026 |
| **Status** | ❌ Not Implemented |

## 1. Background
Gemini 网页版本的配色非常单调，相比起其他 AI 工具，例如 ChatGPT，Gemini 缺少了各色主题，这将使得用户个性化体验非常差。

## 2. Goal
为 Gemini 提供预设的多套颜色主题，带来更丰富的视觉体验。

## 3. Solution
为 Gemini 集成 “Theme” 功能，用户可以通过设置页面选择不同的颜色主题。核心分为“数据”、“设置面板”、“主题样式应用”三个部分。

### 3.1. 数据结构

1. 预设颜色主题配置与拓展
- 预设的主题CSS配置预期放置于 `src/entrypoints/content/gemini-theme/preset/` 进行迭代，每个主题色为单独文件，以方便拓展
- 最终导出一个主题配置列表作为主题配置文件，供设置面板展示
  - 包含：主题Key、主题名称、主题的主色（primary）

2. 当前生效中的主题配置 (持久化存储)
- `themeKey`: 当前选择的预设主题 Key（若为默认则为空）

### 3.2. 设置面板

设置面板采用左右分栏布局，左侧为配置项，右侧为实时预览。
具体遵循设计稿：`docs/feature/theme/ui.png`

#### 3.2.1. 左侧配置区域

1. **COLOR PRESETS (颜色预设)**
   - 展示一组圆角矩形色块。
   - 选中状态：色块上显示 Check 图标，且外层有与主色一致的描边效果。
   - 交互：点击色块立即切换 `themeKey` 并生效。

2. **CUSTOM BACKGROUND (自定义背景)**
   - *注：本期仅在 UI 上保留占位及结构扩展性，功能逻辑暂不实现。*
   - **上传区域**：采用虚线边框的拖拽区域。
     - 包含上传图标、说明文字（支持 PNG, JPG, WebP，最大 5MB）及 “Select File” 按钮。
   - **Transparency (透明度)**：
     - 使用 Slider 组件调节。
     - 数值范围：0% - 100%。
     - 右侧实时显示百分比数值。
   - **Blur Intensity (模糊强度)**：
     - 使用 Slider 组件调节。
     - 数值范围：0px - 20px。
     - 右侧实时显示 px 数值。

#### 3.2.2. 右侧预览区域 (LIVE PREVIEW)

- **实时效果展示**：模拟 Gemini 页面的核心 UI 结构。
- **关联逻辑**：
  - 预览中的某些元素颜色（如用户消息气泡、图标等）随选中的颜色预设动态更新。
  - 背景效果（图片、透明度、模糊度）同步反映在预览容器中。
- **页面下方提示**："Changes are reflected immediately. Your settings are saved automatically."

#### 3.2.3. 技术实现要点

1. **组件选择**：
   - 优先使用 Chakra-UI v3 组件（参考 `src/components/ui`）。
   - Slider、Button、FileUpload 等组件需符合设计风格。
2. **状态管理**：
   - 使用统一的 `ThemeContext` 或类似机制管理主题状态。
   - 状态变更需触发 `storage` 同步，确保跨页面生效。
3. **响应式与美感**：
   - 严格对齐设计稿的间距、圆角与阴影。
   - 切换过程应具备平滑的过渡动画。

### 3.3. 样式 Apply

在能力上需支持：
- 动态切换主题
- 页面加载时应用主题

并且需要有以下接口封装：
- 获取当前生效中的主题
- 设置当前生效中的主题
  - Apply：可参考已有 demo: `src/entrypoints/content/gemini-theme/inject.ts`
  - Update：即替换已有的主题样式
- 清空当前生效中的主题（即恢复到页面默认状态）

## 4. 后续优化迭代

### 4.1. 自定义背景图片支持
由于本期核心目标是提供基础主题切换，自定义背景作为高级功能放入后续迭代：
- **功能描述**：允许用户上传自定义图片作为 Gemini 的背景。
- **配置项**：
  - `customBackground`: 背景图片数据。
  - `transparency`: 透明度控制。
  - `blurIntensity`: 模糊效果控制。
- **交互逻辑**：上传后实时应用背景，并支持针对不同预设色进行透明度叠底优化。

### 4.2. 更多预设扩展
- 增加动态主题（随时间变化的渐变色）。
- 增加社区主题分享与导入功能。

