# ThemeFloatingPanel 技术方案

| 项目 | 内容 |
| :--- | :--- |
| 文档版本 | V1.0 |
| 功能名称 | 真实页面主题调节面板 |
| 创建日期 | May 24, 2026 |
| 状态 | Draft |

## 1. 背景与目标

当前主题配置位于 `SettingPanel` 的 `theme` tab 内。`SettingPanel` 使用 Chakra `Dialog`，内容区域最大 `1200px`、高度 `90vh`，并带有 backdrop。这种形态适合普通设置项，但不适合视觉调参：

1. 用户调节主题时看不到真实 Gemini 页面的大部分区域。
2. `LivePreview` 只能模拟局部 UI，无法覆盖真实页面中的侧边栏、输入框、长对话、欢迎页、背景图可读性等实际状态。
3. 主题配置项已经包含颜色、明暗模式、壁纸、模糊、消息玻璃、侧边栏遮罩、欢迎语可读性等多项视觉参数，用户需要边看真实页面边调节。

本方案目标：

1. 保留现有 `SettingPanel -> Theme` 页面，不破坏既有设置入口。
2. 在现有 `LivePreview` 下增加一个明确入口，例如 `Customize on page` / `在页面中调节`。
3. 用户点击入口后隐藏 `SettingPanel`，打开独立的 `ThemeFloatingPanel`。
4. `ThemeFloatingPanel` 以非模态浮动面板形态展示，真实 Gemini 页面作为主预览画布。
5. 最大化复用现有主题业务逻辑和 UI 子组件，避免复制主题读写、上传、watcher、错误处理逻辑。

不在 MVP 范围内：

1. 不引入 draft / cancel / compare 机制。当前仍沿用“调节即应用并持久化”的行为。
2. 不重做整个 `SettingPanel` 信息架构。
3. 不移除现有 `LivePreview`。
4. 不新增复杂动效或可拖拽窗口。面板先固定停靠，后续再按反馈增强。

## 2. 现有代码结构梳理

### 2.1 Content overlay 挂载

入口文件：

- `src/entrypoints/content/index.tsx`
- `src/entrypoints/content/overlay/index.tsx`

content script 启动后执行：

1. 注入 `url-monitor-main-world.js`。
2. 注入 `theme-sync-main-world.js`。
3. 启动 `urlMonitor`、`chatChangeDetector`、`tabTitleSync`、`stuffPageModule`。
4. 执行 `initTheme().then(() => initThemeBackground())`，恢复主题颜色和背景样式。
5. 通过 `createIntegratedUi` 创建固定定位的 overlay root。
6. `renderOverlay(container)` 在 Shadow DOM 中渲染 React overlay。

当前 overlay app：

```tsx
function App() {
  useSyncColorMode()

  return (
    <>
      <SettingPanel />
      <Toaster />
      <QuickFollowUp />
      <ExtensionUpdate />
      <WhatsNew />
    </>
  )
}
```

结论：

- `ThemeFloatingPanel` 应作为 `SettingPanel` 的同级 overlay 组件挂载到 `App` 中。
- 它可以共享 `Provider`、`ColorPaletteProvider`、`ThemeProvider`、Shadow DOM 和 Chakra system。
- 不需要新增 WXT entrypoint。

### 2.2 SettingPanel 结构

核心文件：

- `src/components/setting-panel/index.tsx`
- `src/components/setting-panel/Sidebar.tsx`
- `src/components/setting-panel/ContentArea.tsx`
- `src/components/setting-panel/config.ts`
- `src/stores/settingStore.ts`

`SettingPanel` 监听事件：

```ts
useEvent('settings:open', (data) => {
  setOpen(data.open)
  if (data.module) {
    setActiveSection(data.module)
  }
})

useEvent('settings:close', () => {
  setOpen(false)
})
```

`ContentArea` 根据 `settingStore.route` 渲染当前 section/view。`theme` section 在 `config.ts` 中注册：

```ts
{
  id: 'theme',
  label: t('settingPanel.config.theme.title'),
  group: 'tools',
  icon: HiOutlineColorSwatch,
  title: t('settingPanel.config.theme.title'),
  views: [
    {
      id: 'index',
      title: t('settingPanel.config.theme.views.index.title'),
      componentId: 'theme/index'
    }
  ]
}
```

结论：

- 不建议点击左侧 `Theme` tab 后直接关闭 `SettingPanel`。这会破坏 tab 的常规心智。
- 推荐在 `theme/index` 内增加显式入口，由用户主动进入真实页面调节模式。
- `ThemeFloatingPanel` 的返回按钮可以通过 `settings:open` 重新打开 `SettingPanel` 并定位到 `theme` section。

### 2.3 ThemeSettingsView 现状

核心文件：

- `src/components/setting-panel/views/theme/index.tsx`
- `src/components/setting-panel/views/theme/AppearanceSelector.tsx`
- `src/components/setting-panel/views/theme/ColorPresets.tsx`
- `src/components/setting-panel/views/theme/CustomBackground.tsx`
- `src/components/setting-panel/views/theme/LivePreview.tsx`

`ThemeSettingsView` 当前同时负责：

1. 读取和维护 appearance 状态。
2. 读取和维护 color palette 状态。
3. 加载、watch、更新 background settings。
4. 处理上传、删除、错误 toast。
5. 布局左侧 controls 和右侧 `LivePreview`。

当前布局：

```tsx
<Flex gap={{ base: 0, lg: 8 }} height="100%" align="stretch">
  <Box flex="1" overflowY="auto">
    <AppearanceSelector />
    <ColorPresets />
    <CustomBackground />
  </Box>

  <Box width="340px" display={{ base: 'none', lg: 'block' }}>
    <LivePreview />
  </Box>
</Flex>
```

结论：

- `AppearanceSelector`、`ColorPresets`、`CustomBackground` 可以复用。
- `ThemeSettingsView` 不适合被整体塞进 floating panel，因为它绑定了 SettingPanel 内部的左右布局和 `LivePreview`。
- 应把状态控制逻辑从 `ThemeSettingsView` 抽成 hook，把 controls 渲染抽成独立组件。

### 2.4 主题服务现状

颜色主题：

- `src/entrypoints/content/gemini-theme/index.ts`
- `src/entrypoints/content/gemini-theme/themeStorage.ts`
- `src/entrypoints/content/gemini-theme/preset/presets.ts`
- `src/entrypoints/content/gemini-theme/inject.ts`

关键 API：

```ts
applyTheme(key: string): Promise<void>
initTheme(): Promise<void>
clearTheme(): Promise<void>
getThemeKey(): Promise<string>
themeKeyStorage.watch(...)
```

外观模式：

- `src/entrypoints/content/gemini-theme/appearance/service.ts`

关键 API：

```ts
getAppearanceState(): AppearanceState
setAppearanceMode(mode: AppearanceMode): AppearanceState
subscribeSystemThemeChange(onChange): () => void
```

背景设置：

- `src/entrypoints/content/gemini-theme/background/service.ts`
- `src/entrypoints/content/gemini-theme/background/storage.ts`
- `src/entrypoints/content/gemini-theme/background/styleController.ts`
- `src/entrypoints/content/gemini-theme/background/types.ts`

关键 API：

```ts
getThemeBackgroundSettings(): Promise<ThemeBackgroundSettings>
updateThemeBackgroundSettings(patch): Promise<ThemeBackgroundResolvedState>
uploadThemeBackground(file): Promise<ThemeBackgroundResolvedState>
removeThemeBackground(): Promise<ThemeBackgroundResolvedState>
resolveThemeBackgroundPreviewUrlForPanel(settings): Promise<string | null>
themeBackgroundSettingsStorage.watch(...)
```

背景服务会在持久化后立即调用：

```ts
applyThemeBackgroundStyle(state)
applyWelcomeGreetingReadabilityFromState(state)
```

结论：

- `ThemeFloatingPanel` 不需要自己操作 DOM 样式。
- 只要复用现有 service API，真实页面会自动应用更新。
- `resolveThemeBackgroundPreviewUrlForPanel` 仍可供 SettingPanel 的 `LivePreview` 使用；FloatingPanel MVP 不需要渲染 `LivePreview`。

### 2.5 色板上下文

文件：

- `src/hooks/useThemeColorPalette.tsx`
- `src/components/ui/provider-shadow-dom.tsx`

`ColorPaletteProvider` 维护 Chakra `colorPalette`，并监听 `themeKeyStorage.watch`：

```tsx
<ColorPaletteContext.Provider value={{ palette, setPalette }}>
  <Global styles={{ ':host': system.css({ colorPalette: palette }) as any }} />
  {children}
</ColorPaletteContext.Provider>
```

结论：

- `ThemeFloatingPanel` 挂在同一个 Shadow DOM provider 下即可共享当前 palette。
- 在 controller 中调用 `setPalette(key || 'blue')` 即可维持现有 Chakra UI 色彩联动。

### 2.6 EventBus 现状

文件：

- `src/common/event.ts`
- `src/utils/eventbus.ts`
- `src/hooks/useEventBus.ts`

已有设置事件：

```ts
'settings:open': {
  from: 'prompt-entrance' | 'popup' | 'whats-new',
  open: boolean
  module?: NavigationSection
}

'settings:close': {
  from: 'run-modal' | 'manual',
  reason?: string
}
```

结论：

- 需要补充 `theme-floating-panel:open` / `theme-floating-panel:close` 事件。
- 需要扩展 `settings:open.from` 和 `settings:close.from` 的来源枚举，或者统一收敛为更通用的 source 类型。

## 3. 目标交互

### 3.1 SettingPanel 内部入口

保留原路径：

```text
SettingPanel
  -> Sidebar: Theme
  -> ThemeSettingsView
  -> LivePreview
  -> Customize on page
```

在 `LivePreview` 下方增加入口按钮：

```text
[Live Preview]
[preview card]
[Customize on page]
```

点击按钮：

1. 关闭 `SettingPanel`。
2. 打开 `ThemeFloatingPanel`。
3. 保持当前页面原位置，不触发跳转。
4. 用户在真实 Gemini 页面上实时看到调节结果。

### 3.2 ThemeFloatingPanel 布局

桌面端 MVP：

```text
┌────────────────────────────────────┐
│ Theme                         [↩]  │
├────────────────────────────────────┤
│ Appearance                         │
│ [System] [Light] [Dark]            │
│                                    │
│ Colors                             │
│ [swatches...]                      │
│                                    │
│ Wallpaper                          │
│ Enable wallpaper            [toggle]│
│ Upload / Remove                    │
│ Blur                         slider │
│                                    │
│ Advanced                           │
│ Message glass               [toggle]│
│ Glass transparency          slider │
│ Glass blur                  slider │
│ Sidebar scrim               [toggle]│
│ Greeting readability        select │
└────────────────────────────────────┘
```

面板行为：

1. 右侧固定停靠，宽度建议 `380px`，最大高度 `calc(100dvh - 32px)`。
2. 不使用 backdrop，不阻塞用户观察页面。
3. 面板内部滚动，页面本身仍可滚动。
4. 顶部返回按钮含 tooltip：`Back to settings` / `返回设置`。
5. 点击返回按钮：关闭 floating panel，重新打开 `SettingPanel` 并定位到 `theme`。
6. 按 `Esc`：关闭 floating panel，不自动回到 `SettingPanel`。原因是 Esc 更接近“退出当前浮层”，不是“返回设置”。

移动端 MVP：

1. 使用 bottom sheet 形态。
2. 宽度 `100%`，底部固定，高度建议 `min(70dvh, 560px)`。
3. 顶部仍保留 title 和返回按钮。
4. `LivePreview` 入口可以在移动端保留，但 `ThemeFloatingPanel` 内不渲染 `LivePreview`。

## 4. 推荐技术设计

### 4.1 新增文件结构

推荐新增：

```text
src/components/setting-panel/views/theme/
  useThemeSettingsController.ts
  ThemeSettingsControls.tsx
  OpenThemeStudioButton.tsx

src/components/theme-floating-panel/
  index.tsx
```

修改：

```text
src/common/event.ts
src/components/setting-panel/views/theme/index.tsx
src/components/setting-panel/views/theme/CustomBackground.tsx
src/entrypoints/content/overlay/index.tsx
src/locales/*.json
```

当前 locale 文件包括：

```text
src/locales/de.json
src/locales/en.json
src/locales/es.json
src/locales/fr.json
src/locales/ja.json
src/locales/ko.json
src/locales/pt_BR.json
src/locales/zh_CN.json
src/locales/zh_TW.json
```

必须同步补齐全部 locale key，并运行 `pnpm run check:i18n`。

### 4.2 Controller hook

新增：

```text
src/components/setting-panel/views/theme/useThemeSettingsController.ts
```

职责：

1. 集中管理 `ThemeSettingsView` 里现有的主题状态逻辑。
2. 提供 controls 需要的状态和回调。
3. 统一处理错误 toast。
4. 供 `ThemeSettingsView` 和 `ThemeFloatingPanel` 共同使用。

建议返回类型：

```ts
export interface ThemeSettingsController {
  appearanceState: AppearanceState
  backgroundState: ThemeBackgroundResolvedState | null
  isBackgroundLoading: boolean
  activeKey: string
  previewState: ThemeBackgroundResolvedState

  handleSelect: (key: string) => Promise<void>
  handleAppearanceChange: (mode: AppearanceMode) => void
  handleToggleBackground: (enabled: boolean) => Promise<void>
  handleBlurChange: (value: number) => Promise<void>
  handleToggleSidebarScrim: (enabled: boolean) => Promise<void>
  handleSidebarScrimIntensityChange: (value: number) => Promise<void>
  handleToggleMessageGlass: (enabled: boolean) => Promise<void>
  handleMessageGlassTransparencyChange: (value: number) => Promise<void>
  handleMessageGlassBlurChange: (value: number) => Promise<void>
  handleResetGlassSettings: () => Promise<void>
  handleWelcomeGreetingReadabilityModeChange: (
    mode: WelcomeGreetingReadabilityMode,
  ) => Promise<void>
  handleUploadFile: (file: File) => Promise<void>
  handleRemoveImage: () => Promise<void>
}
```

建议 hook：

```ts
export function useThemeSettingsController(options?: {
  systemThemeWatchEnabled?: boolean
}): ThemeSettingsController
```

`systemThemeWatchEnabled` 默认 `true`。SettingPanel 和 FloatingPanel 都可以使用默认值。后续如遇到两个实例同时挂载导致 watcher 重复，可在调用方控制；MVP 中点击入口时会先关闭 SettingPanel 再打开 FloatingPanel，正常不会同时挂载两套 controller。

迁移规则：

1. 从 `ThemeSettingsView` 中移动 `toResolvedState`、`getBackgroundErrorMessage`。
2. 移动 `loadBackgroundState`、`themeBackgroundSettingsStorage.watch`、`subscribeSystemThemeChange`。
3. 移动所有 `handle*` 回调。
4. `ThemeSettingsView` 只保留布局。

### 4.3 Controls 组件

新增：

```text
src/components/setting-panel/views/theme/ThemeSettingsControls.tsx
```

职责：

1. 纯渲染主题设置控件。
2. 复用 `AppearanceSelector`、`ColorPresets`、`CustomBackground`。
3. 不直接访问 storage/service。

建议接口：

```ts
interface ThemeSettingsControlsProps {
  controller: ThemeSettingsController
  variant?: 'default' | 'compact'
}
```

实现草图：

```tsx
export function ThemeSettingsControls({
  controller,
  variant = 'default',
}: ThemeSettingsControlsProps) {
  return (
    <>
      <AppearanceSelector
        value={controller.appearanceState.mode}
        onChange={controller.handleAppearanceChange}
        isLoading={false}
      />
      <ColorPresets
        activeKey={controller.activeKey}
        onSelect={controller.handleSelect}
        isLoading={false}
      />
      <CustomBackground
        variant={variant}
        state={controller.backgroundState}
        isLoading={controller.isBackgroundLoading}
        onToggleBackground={controller.handleToggleBackground}
        onBlurChange={controller.handleBlurChange}
        onToggleSidebarScrim={controller.handleToggleSidebarScrim}
        onSidebarScrimIntensityChange={controller.handleSidebarScrimIntensityChange}
        onToggleMessageGlass={controller.handleToggleMessageGlass}
        onMessageGlassTransparencyChange={controller.handleMessageGlassTransparencyChange}
        onMessageGlassBlurChange={controller.handleMessageGlassBlurChange}
        onResetGlassSettings={controller.handleResetGlassSettings}
        onWelcomeGreetingReadabilityModeChange={
          controller.handleWelcomeGreetingReadabilityModeChange
        }
        onUploadFile={controller.handleUploadFile}
        onRemoveImage={controller.handleRemoveImage}
      />
    </>
  )
}
```

### 4.4 CustomBackground compact variant

当前 `CustomBackground` 的 slider 宽度和间距按 SettingPanel 内容区设计：

```tsx
width={{ base: '170px', md: '220px' }}
```

FloatingPanel 宽度更窄，建议新增：

```ts
variant?: 'default' | 'compact'
```

compact 调整：

1. section 间距减少，例如 `mb={4}`。
2. slider 宽度用 `minmax` 思路，避免固定宽度挤压文字：

```tsx
width={variant === 'compact'
  ? { base: '140px', md: '160px' }
  : { base: '170px', md: '220px' }}
```

3. 长 label 可允许换行，HStack 加 `align="flex-start"` 或在窄面板下改成 VStack。
4. 上传区域高度适当降低，例如 `py={5}`。

MVP 可以先只做 slider 宽度和 spacing 调整，不重写组件结构。

### 4.5 ThemeSettingsView 改造

改造后 `ThemeSettingsView` 职责：

1. 调用 `useThemeSettingsController()`。
2. 渲染 `ThemeSettingsControls`。
3. 渲染 `LivePreview`。
4. 在 `LivePreview` 下方渲染 `OpenThemeStudioButton`。

结构草图：

```tsx
export function ThemeSettingsView() {
  const controller = useThemeSettingsController()
  const { emit } = useEventEmitter()

  const handleOpenThemeStudio = () => {
    emit('settings:close', {
      from: 'theme-floating-panel',
      reason: 'open-theme-studio',
    })
    emit('theme-floating-panel:open', {
      source: 'setting-panel',
      returnToSettings: true,
    })
  }

  return (
    <Box ...>
      <Flex ...>
        <Box ...>
          <ThemeSettingsControls controller={controller} />
        </Box>

        <Box width="340px" ...>
          <LivePreview {...previewPropsFrom(controller.previewState)} />
          <OpenThemeStudioButton onClick={handleOpenThemeStudio} />
        </Box>
      </Flex>
    </Box>
  )
}
```

注意：

- `settings:close` 和 `theme-floating-panel:open` 的 emit 顺序建议先 close 后 open，避免两个 overlay 短暂重叠。
- 因为 `emit` 是 async，若需要严格顺序可使用 `emitSync`，或在 `ThemeFloatingPanel` 打开时主动保证 `SettingPanel` 已关闭。MVP 推荐使用 `emitSync`。

### 4.6 OpenThemeStudioButton

新增：

```text
src/components/setting-panel/views/theme/OpenThemeStudioButton.tsx
```

建议使用 Chakra `Button`，图标可以用现有 `react-icons`：

- `HiOutlineAdjustments`
- `HiOutlineExternalLink`
- 或其他已安装 `react-icons/hi` 图标

示例：

```tsx
<Button
  width="100%"
  size="sm"
  variant="outline"
  onClick={onClick}
>
  <HiOutlineAdjustments />
  {tt('settingPanel.theme.customizeOnPage', 'Customize on page')}
</Button>
```

文案：

- en: `Customize on page`
- zh_CN: `在页面中调节`

### 4.7 ThemeFloatingPanel 组件

新增：

```text
src/components/theme-floating-panel/index.tsx
```

职责：

1. 监听 `theme-floating-panel:open` / `theme-floating-panel:close`。
2. 维护自身 open state 和 `returnToSettings`。
3. 打开时渲染右侧浮动面板。
4. 复用 `useThemeSettingsController` 和 `ThemeSettingsControls`。
5. 返回按钮关闭自身并重新打开 SettingPanel 的 `theme` section。

结构草图：

```tsx
export function ThemeFloatingPanel() {
  const [open, setOpen] = useState(false)
  const [returnToSettings, setReturnToSettings] = useState(false)
  const { emitSync } = useEventEmitter()

  useEvent('theme-floating-panel:open', (data) => {
    setReturnToSettings(data.returnToSettings ?? false)
    setOpen(true)
  })

  useEvent('theme-floating-panel:close', () => {
    setOpen(false)
  })

  const handlePrimaryAction = () => {
    setOpen(false)
    if (returnToSettings) {
      emitSync('settings:open', {
        from: 'theme-floating-panel',
        open: true,
        module: 'theme',
      })
    }
  }

  if (!open) return null

  return (
    <ThemeFloatingPanelContent
      returnToSettings={returnToSettings}
      onPrimaryAction={handlePrimaryAction}
    />
  )
}

function ThemeFloatingPanelContent({
  returnToSettings,
  onPrimaryAction,
}: {
  returnToSettings: boolean
  onPrimaryAction: () => void
}) {
  const controller = useThemeSettingsController()
  const actionLabel = returnToSettings
    ? tt('settingPanel.theme.backToSettings', 'Back to settings')
    : tt('settingPanel.theme.closeThemePanel', 'Close theme panel')

  return (
    <Box
      position="fixed"
      top={{ base: 'auto', md: 4 }}
      right={{ base: 0, md: 4 }}
      bottom={{ base: 0, md: 4 }}
      width={{ base: '100%', md: '380px' }}
      maxHeight={{ base: '70dvh', md: 'calc(100dvh - 32px)' }}
      bg="gemSurface"
      borderWidth="1px"
      borderColor="border.muted"
      borderRadius={{ base: '16px 16px 0 0', md: 'lg' }}
      shadow="xl"
      overflow="hidden"
      zIndex={1}
    >
      <Flex as="header" ...>
        <Heading size="md">{tt('settingPanel.config.theme.title', 'Theme')}</Heading>
        <Tooltip content={actionLabel}>
          <IconButton aria-label={actionLabel} onClick={onPrimaryAction}>
            <HiOutlineCog />
          </IconButton>
        </Tooltip>
      </Flex>

      <Box overflowY="auto" px={4} pb={4}>
        <ThemeSettingsControls controller={controller} variant="compact" />
      </Box>
    </Box>
  )
}
```

注意：

- 这里不使用 `Dialog`，避免 backdrop 和焦点陷阱阻断用户查看/滚动页面。
- `useThemeSettingsController()` 必须放在打开后才渲染的 inner component 中，避免 panel 关闭时仍常驻 storage watcher。
- `zIndex` 不需要再使用超大值；它已经在 extension integrated UI root 内，root 自身 z-index 是 `9999999999`。组件内部只需局部层级。
- 如果后续发现页面点击被 overlay root 拦截，需要检查 WXT integrated UI root 的 pointer-events 行为。可将 panel 外层设置为 `pointerEvents="none"`，panel 自身设置 `pointerEvents="auto"`。

### 4.8 overlay App 接入

修改：

```text
src/entrypoints/content/overlay/index.tsx
```

加入：

```tsx
import { ThemeFloatingPanel } from '@/components/theme-floating-panel'

function App() {
  useSyncColorMode()

  return (
    <>
      <SettingPanel />
      <ThemeFloatingPanel />
      <Toaster />
      <QuickFollowUp />
      <ExtensionUpdate />
      <WhatsNew />
    </>
  )
}
```

建议顺序：

1. `SettingPanel`
2. `ThemeFloatingPanel`
3. `Toaster`
4. 其他 overlay

`Toaster` 放在 floating panel 后面，确保错误提示不被面板遮挡。

### 4.9 Event 类型扩展

修改：

```text
src/common/event.ts
```

建议：

```ts
type SettingsOpenSource =
  | 'prompt-entrance'
  | 'popup'
  | 'whats-new'
  | 'theme-floating-panel'

type SettingsCloseSource =
  | 'run-modal'
  | 'manual'
  | 'theme-floating-panel'

export interface AppEvents {
  'settings:open': {
    from: SettingsOpenSource
    open: boolean
    module?: NavigationSection
  }

  'settings:close': {
    from: SettingsCloseSource
    reason?: string
  }

  'theme-floating-panel:open': {
    source: 'setting-panel'
    returnToSettings?: boolean
  }

  'theme-floating-panel:close': {
    source: 'back-to-settings' | 'escape' | 'manual'
    reopenSettings?: boolean
  }
}
```

MVP 简化也可以不引入 source type aliases，直接扩展 union。但建议抽 type alias，后续来源增多时更容易维护。

### 4.10 i18n keys

至少新增：

```json
{
  "settingPanel": {
    "theme": {
      "customizeOnPage": "Customize on page",
      "backToSettings": "Back to settings",
      "closeThemePanel": "Close theme panel"
    }
  }
}
```

中文：

```json
{
  "settingPanel": {
    "theme": {
      "customizeOnPage": "在页面中调节",
      "backToSettings": "返回设置",
      "closeThemePanel": "关闭主题面板"
    }
  }
}
```

需要同步 `src/locales/*.json` 中全部语言文件。完成后运行：

```bash
pnpm run check:i18n
```

## 5. 实施阶段

### Phase 1：结构拆分，不改交互

目标：在不改变 UI 行为的前提下，把 `ThemeSettingsView` 拆成可复用结构。

步骤：

1. 新增 `useThemeSettingsController.ts`。
2. 将 `ThemeSettingsView` 中的状态、effect、handler 迁移到 hook。
3. 新增 `ThemeSettingsControls.tsx`。
4. `ThemeSettingsView` 改为使用 controller + controls + LivePreview。
5. 保持视觉与行为尽量不变。

验收：

1. `SettingPanel -> Theme` 页面仍能正常打开。
2. 切换 Light/Dark/System 生效。
3. 选择颜色预设生效。
4. 上传、删除壁纸生效。
5. slider 和 switch 行为与改造前一致。
6. `LivePreview` 仍正常渲染。

建议命令：

```bash
pnpm compile
pnpm test:run src/entrypoints/content/gemini-theme/appearance/service.test.ts src/entrypoints/content/gemini-theme/background/welcome-greeting/service.test.ts
```

### Phase 2：增加 ThemeFloatingPanel 和入口

目标：打通从 `LivePreview` 到真实页面调节模式的路径。

步骤：

1. 新增 `OpenThemeStudioButton.tsx`。
2. 在 `ThemeSettingsView` 的 `LivePreview` 下方加入入口。
3. 扩展 `AppEvents`。
4. 新增 `src/components/theme-floating-panel/index.tsx`。
5. 在 overlay `App` 中挂载 `ThemeFloatingPanel`。
6. 点击入口时：关闭 `SettingPanel`，打开 `ThemeFloatingPanel`。
7. 点击 floating panel 返回按钮时：关闭自身，重新打开 `SettingPanel` 的 `theme` section。

验收：

1. 点击 `Customize on page` 后，`SettingPanel` 消失。
2. `ThemeFloatingPanel` 出现在右侧。
3. 真实 Gemini 页面可见。
4. 在 floating panel 中切换颜色、外观、壁纸设置，真实页面实时变化。
5. 点击返回设置后，重新打开 `SettingPanel -> Theme`。
6. 返回后 `LivePreview` 与当前设置一致。

### Phase 3：compact 适配和视觉细节

目标：让 floating panel 中的控件在窄宽度下稳定可用。

步骤：

1. 给 `CustomBackground` 增加 `variant`。
2. compact 下缩小 slider 宽度和 section 间距。
3. 检查长文案在英文和中文下是否换行正常。
4. 补充 tooltip 和 aria-label。
5. 确保移动端 bottom sheet 不遮挡过多页面。

验收：

1. 桌面宽度 `1280px` 下，面板不超过页面 1/3 宽度。
2. 移动端宽度 `390px` 下，无横向滚动。
3. 所有按钮文字不溢出。
4. tooltip、IconButton 有可访问名称。

### Phase 4：验证与补充测试

目标：补齐稳定性验证。

建议新增测试：

1. controller hook 的纯函数部分不容易直接测，可优先保证现有 service 测试继续通过。
2. 若已有 React Testing Library 测试模式，可新增：
   - `ThemeSettingsControls` 能渲染核心控件。
   - 点击 `OpenThemeStudioButton` 会触发传入 callback。
   - `ThemeFloatingPanel` 收到 open event 后渲染。

命令：

```bash
pnpm compile
pnpm test:run
pnpm run check:i18n
```

手动验证：

1. Chrome：
   - `pnpm dev`
   - 打开 `https://gemini.google.com/`
   - 进入设置主题页
   - 点击 `Customize on page`
   - 逐项调节主题
2. Firefox：
   - 先阅读 `docs/platforms.md`
   - `pnpm dev:firefox`
   - 验证壁纸预览和真实背景是否正常，特别关注 object URL 和 Firefox reload notice。

## 6. 风险与处理

### 6.1 两套 controller 同时挂载

风险：

- 如果 `SettingPanel` 未完全关闭时 `ThemeFloatingPanel` 已打开，可能同时存在两个 `themeBackgroundSettingsStorage.watch`。

处理：

1. 入口点击时先关闭 `SettingPanel` 再打开 floating panel。
2. 使用 `emitSync` 保证事件顺序。
3. 如后续仍有重叠，可在 `ThemeFloatingPanel` 打开事件中再次 emit `settings:close`。

### 6.2 overlay root 拦截页面点击

风险：

- `createIntegratedUi` 的 root 是 fixed。如果 root 覆盖全屏且 pointer events 默认启用，可能影响页面交互。

处理：

1. 优先实测当前 overlay 行为。
2. 如有问题，将 `ThemeFloatingPanel` 最外层 wrapper 设为 `pointerEvents="none"`。
3. 面板容器自身设为 `pointerEvents="auto"`。

### 6.3 FloatingPanel 和 Toaster 层级

风险：

- 错误 toast 可能被 floating panel 覆盖。

处理：

1. overlay App 中 `Toaster` 放在 `ThemeFloatingPanel` 后。
2. 如 Chakra Portal 层级仍不符合预期，再调 toaster z-index。

### 6.4 CustomBackground 在 compact 下拥挤

风险：

- 当前很多设置项使用 `HStack justify="space-between"`，窄面板下 label 和 slider 可能挤压。

处理：

1. MVP 先缩小 slider。
2. 如仍拥挤，将 compact 下的设置项改为 VStack：

```tsx
<Stack
  direction={variant === 'compact' ? 'column' : 'row'}
  align={variant === 'compact' ? 'stretch' : 'center'}
>
```

### 6.5 i18n key 不一致

风险：

- 新增英文/中文 key 后遗漏其他 locale，`check:i18n` 失败。

处理：

1. 修改全部 `src/locales/*.json`。
2. 跑 `pnpm run check:i18n`。

## 7. 推荐 PR 拆分

如果希望降低 review 风险，建议拆成两个 PR：

### PR 1：主题设置逻辑解耦

内容：

1. 新增 `useThemeSettingsController`。
2. 新增 `ThemeSettingsControls`。
3. `ThemeSettingsView` 改为组合式布局。
4. 行为不变。

验收重点：

- 无 UI 交互变化。
- 主题设置所有功能仍可用。

### PR 2：ThemeFloatingPanel

内容：

1. 新增事件类型。
2. 新增 `OpenThemeStudioButton`。
3. 新增 `ThemeFloatingPanel`。
4. overlay App 接入。
5. compact 适配和 i18n。

验收重点：

- 新入口路径清晰。
- FloatingPanel 真实页面调节可用。
- 返回设置路径稳定。

## 8. 最终验收清单

功能验收：

1. `SettingPanel -> Theme` 原路径可用。
2. `LivePreview` 仍可用。
3. `LivePreview` 下方出现真实页面调节入口。
4. 点击入口后 `SettingPanel` 隐藏，`ThemeFloatingPanel` 出现。
5. FloatingPanel 中所有主题设置项可用。
6. 真实 Gemini 页面实时反映主题变化。
7. 返回按钮重新打开 `SettingPanel -> Theme`。
8. ESC 关闭 FloatingPanel，不重新打开 SettingPanel。

技术验收：

1. 主题读写逻辑只存在于 `useThemeSettingsController`，没有复制一份到 FloatingPanel。
2. `ThemeSettingsView` 不再直接承担大段 service 调用逻辑。
3. `ThemeFloatingPanel` 不直接操作主题 DOM 样式。
4. `AppEvents` 类型覆盖新增事件。
5. locale key 全部对齐。

命令验收：

```bash
pnpm compile
pnpm test:run
pnpm run check:i18n
pnpm build
```

如涉及 Firefox 行为：

```bash
pnpm build:firefox
```
