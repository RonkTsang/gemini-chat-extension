# Theme Appearance (System / Light / Dark)

| **Document Version** | **V1.1** |
| :--- | :--- |
| **Feature Name** | Theme Appearance |
| **Created Date** | Feb 22, 2026 |
| **Status** | ✅ Implemented |

## 1. Background
当前 Theme Setting 已支持 Colors 与 Wallpaper，但缺少“主题模式”控制。Gemini 原生支持 System / Light / Dark 模式，且其状态由页面 `localStorage` 维护。为保证插件设置与 Gemini 原生主题一致，需要在 Theme Setting 增加 Appearance 控件并接入 Gemini 现有主题键值逻辑。

## 2. Goal
在 Theme Setting 中新增 Appearance 功能，支持用户切换：
- `System`
- `Light`
- `Dark`

并保证：
- UI 位置固定在 `Colors` 之前
- 切换后立即生效（body class + localStorage）
- 与 Gemini 原生主题机制兼容（`theme` / `Bard-Color-Theme`）
- 与当前扩展 UI 色彩同步逻辑兼容（参考 `src/hooks/useSyncColorMode.ts`）

## 3. Scope
本期包含：
1. Theme Setting 新增 Appearance 分段选择控件（segmented-control）。
2. 新增 Gemini 主题模式读取逻辑（从页面 `localStorage` 推导）。
3. 新增主题切换逻辑（更新 body class + `localStorage`）。
4. System 模式下支持按系统主题写入并生效。
5. i18n 文案与基础测试补充。

本期不包含：
1. 改造现有 Colors / Wallpaper 业务逻辑。
2. 修改 Gemini 原生主题 UI。
3. 跨浏览器差异化降级策略（按当前 Chrome 插件环境实现）。

## 4. UI Requirements

### 4.1 位置
- 在 Theme Setting 左侧配置区内，放在 `Colors` 模块之前。

### 4.2 组件
- 使用 Chakra UI `segmented-control`（实现层可使用 Chakra v3 对应 `SegmentGroup` API 或项目封装组件）。
- 每个选项展示图标 + 文案。

### 4.3 选项定义
1. `System`
   - 图标：`MdOutlineBrightness4`
2. `Light`
   - 图标：`MdOutlineLightMode`
3. `Dark`
   - 图标：`MdOutlineDarkMode`

图标来源：`react-icons/md`

## 5. Data Source & Rules

### 5.1 Gemini 主题相关 localStorage 键
1. `theme`
   - 值：`light` | `dark`
   - 含义：当前实际生效主题
2. `Bard-Color-Theme`
   - 值：`Bard-Light-Theme` | `Bard-Dark-Theme`
   - 含义：当该字段存在时，表示当前为用户强制模式（非 System）

### 5.2 模式判定规则
1. 若 `Bard-Color-Theme` 存在：
   - `Bard-Light-Theme` -> Appearance = `light`
   - `Bard-Dark-Theme` -> Appearance = `dark`
2. 若 `Bard-Color-Theme` 不存在：
   - Appearance = `system`
3. `system` 下的实际主题（用于 UI 同步）优先级：
   1. body class（`dark-theme` / `light-theme`）
   2. `window.matchMedia('(prefers-color-scheme: dark)')`
   3. `localStorage.theme` 兜底

## 6. Behavior Requirements

### 6.1 初始化
进入 Theme Setting 时读取当前 Appearance：
1. 从页面 `localStorage` 读取 `theme` 与 `Bard-Color-Theme`。
2. 按 5.2 规则计算当前 Appearance。
3. Segmented 控件展示对应选中态。

### 6.2 切换到 `Light` / `Dark`
以切换到 `dark` 为例：
1. 更新 body class：
   - 先 `document.body.classList.remove('light-theme', 'dark-theme')`
   - 再 `document.body.classList.add('dark-theme')`
2. 写入 localStorage：
   - `localStorage.setItem('theme', 'dark')`
   - `localStorage.setItem('Bard-Color-Theme', 'Bard-Dark-Theme')`
3. 保持当前 segmented 选中项为 `dark`。

`light` 同理：
- `theme=light`
- `Bard-Color-Theme=Bard-Light-Theme`

### 6.3 切换到 `System`
1. 读取系统偏好：
   - `prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches`
2. 计算目标主题：
   - `targetTheme = prefersDark ? 'dark' : 'light'`
3. 更新 body class 到 `targetTheme`。
4. 写入 localStorage：
   - `localStorage.setItem('theme', targetTheme)`
   - `localStorage.removeItem('Bard-Color-Theme')`（关键：标识 System）
5. segmented 选中项切换为 `system`。

### 6.4 System 跟随系统变化
当 Appearance=`system` 时，监听 `matchMedia` 变化：
1. 系统主题变化后重新计算 `targetTheme`。
2. 更新 body class。
3. 更新 `localStorage.theme`。
4. `Bard-Color-Theme` 保持不存在。

当 Appearance=`light`/`dark` 时，不响应系统变化事件。

### 6.5 Main World Storage-Event Hack（已实现）
#### 6.5.1 背景问题
- 仅在 content script 中修改 `localStorage + body class` 时，Gemini SPA 的内存态仍可能保留旧值。
- 在切换 chat 路由后，页面会用旧内存态回写主题，导致主题“回弹”。

#### 6.5.2 方案
- 在 main world 注入桥接脚本，接收扩展事件后在页面上下文执行主题切换。
- 执行内容：
  1. 更新 `theme` / `Bard-Color-Theme` 的 localStorage
  2. 更新 `body` 的主题 class
  3. 人工派发 `StorageEvent('storage')`（`theme` 与 `Bard-Color-Theme` 各派发一次）

#### 6.5.3 触发链路
1. Theme UI 调用 `setAppearanceMode(mode)`（content script）。
2. appearance service 优先派发 `CustomEvent('gem-ext:theme-appearance-apply')`。
3. main world 脚本监听该事件并执行 6.5.2。
4. 若 main world bridge 未就绪，则回退到 content script 的本地写入逻辑。

## 7. Technical Design

### 7.1 代码改造点（建议）
1. 新增 UI 组件：
   - `src/components/setting-panel/views/theme/AppearanceSelector.tsx`
2. 调整 Theme Setting 入口：
   - `src/components/setting-panel/views/theme/index.tsx`
   - 在 `ColorPresets` 前插入 `AppearanceSelector`
3. 新增 Gemini appearance 服务（建议）：
   - `src/entrypoints/content/gemini-theme/appearance/types.ts`
   - `src/entrypoints/content/gemini-theme/appearance/service.ts`
   - `src/entrypoints/content/gemini-theme/appearance/index.ts`
4. 在主题入口导出：
   - `src/entrypoints/content/gemini-theme/index.ts`
5. 新增 main world 主题桥接脚本：
   - `src/entrypoints/theme-sync-main-world.ts`
6. 在内容脚本初始化阶段注入 main world 主题桥接脚本：
   - `src/entrypoints/content/index.tsx`
7. 更新 `web_accessible_resources`，确保 bridge 脚本可注入：
   - `wxt.config.ts`
8. 新增跨 world 事件常量：
   - `src/common/event.ts` (`gem-ext:theme-appearance-apply`)

### 7.2 类型建议
```ts
export type AppearanceMode = 'system' | 'light' | 'dark'
export type GeminiTheme = 'light' | 'dark'
```

### 7.3 服务接口建议
```ts
getAppearanceState(): AppearanceState
setAppearanceMode(mode: AppearanceMode): AppearanceState
subscribeSystemThemeChange(onChange: (theme: GeminiTheme) => void): () => void
```

### 7.4 Main World Bridge 协议（已实现）
bridge 事件：`gem-ext:theme-appearance-apply`

```ts
type ThemeAppearanceApplyEventDetail = {
  mode: 'system' | 'light' | 'dark'
  theme: 'light' | 'dark'
  bardColorTheme: 'Bard-Light-Theme' | 'Bard-Dark-Theme' | null
}
```

main world ready 标记：
- `document.documentElement[data-gpk-theme-sync-ready="true"]`
- appearance service 仅在该标记存在时走 bridge；否则本地回退。

### 7.5 UI 交互接口建议
`AppearanceSelector` 对外：
```ts
interface AppearanceSelectorProps {
  value: AppearanceMode
  onChange: (mode: AppearanceMode) => Promise<void> | void
  isLoading?: boolean
}
```

### 7.6 与现有同步逻辑关系
`useSyncColorMode` 已基于 body class 同步扩展 UI 颜色模式。  
Appearance 切换只要正确更新 body class，扩展 UI 会自动同步，不需要重复设置 Chakra 主题状态。

## 8. i18n Requirements
在 `settingPanel.theme` 下新增（至少）：
- `appearance`: `Appearance` / `外观`
- `appearanceSystem`: `System` / `跟随系统`
- `appearanceLight`: `Light` / `浅色`
- `appearanceDark`: `Dark` / `深色`

缺失语言按现有策略 fallback（通常回退 key 或英文）。

## 9. Error Handling
1. `localStorage` 读写异常：
   - 捕获异常并降级为只更新 body class。
   - 控件维持可操作，避免阻断。
2. body class 缺失/异常：
   - 采用 `remove('light-theme','dark-theme') + add(target)` 兜底。
3. 非法存储值：
   - 按 `system` 处理，并重新写回合法值。
4. main world bridge 未就绪或事件派发失败：
   - 自动回退到 content script 本地写入，不阻断主题切换。

## 10. Acceptance Criteria
1. Theme Setting 中出现 Appearance 分段控件，且位于 Colors 之前。
2. 选项为 `System` / `Light` / `Dark`，图标分别为指定 `react-icons/md` 图标。
3. 当 `Bard-Color-Theme` 不存在时，控件显示 `System`。
4. 切换 `Light` 时：
   - body class 为 `light-theme`
   - `localStorage.theme=light`
   - `localStorage.Bard-Color-Theme=Bard-Light-Theme`
5. 切换 `Dark` 时：
   - body class 为 `dark-theme`
   - `localStorage.theme=dark`
   - `localStorage.Bard-Color-Theme=Bard-Dark-Theme`
6. 切换 `System` 时：
   - `Bard-Color-Theme` 被移除
   - 根据系统主题写入 `theme` 并更新 body class
7. `System` 模式下系统主题变化可自动更新页面主题。
8. 刷新页面后，Appearance 显示与 Gemini 实际主题模式一致。
9. 不影响现有 Colors / Wallpaper 的功能与持久化。
10. 切换 chat 等 SPA 路由后，主题不应被旧内存态回弹覆盖。
11. main world bridge 生效时，可通过 `storage` 事件驱动页面内存态同步。

## 11. Test Plan

### 11.1 Unit Test（建议）
1. `getAppearanceState`：
   - 有/无 `Bard-Color-Theme` 的判定
   - 非法值兜底
2. `setAppearanceMode`：
   - 三种模式下 localStorage 写入断言
   - body class 更新断言
3. `System` 监听：
   - 仅在 `system` 模式触发更新
4. main world bridge：
   - ready 标记存在时，`setAppearanceMode` 优先派发 `gem-ext:theme-appearance-apply`
   - bridge 不可用时回退本地写入

### 11.2 Manual Regression
1. Theme Setting 打开后 Appearance 选中态正确。
2. 三模式来回切换，页面主题即时变化。
3. 刷新后状态保持。
4. 与 Colors 主题切换交叉测试（先改 Appearance，再改 Colors，反之亦然）。
5. 在系统浅/深色切换时验证 `system` 模式表现。
6. 切换 chat 路由后检查主题不回弹。
7. 验证 synthetic `storage` 路径：
   - 在 Gemini Console 直接执行人工派发逻辑可生效
   - 扩展链路下切换主题后能观察到同 tab 稳定保持
