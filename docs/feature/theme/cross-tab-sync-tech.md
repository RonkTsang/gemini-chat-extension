# Theme 跨 Tab 同步技术方案

| **文档版本** | **V1.0** |
| :--- | :--- |
| **功能名称** | Theme 跨 Tab 同步 |
| **创建日期** | Feb 25, 2026 |
| **状态** | ✅ 已实现 |

## 1. 背景

Theme 功能（颜色预设 / 背景图）的配置持久化在 `chrome.storage` 中，但原始实现只在当前 Tab 内即时生效。用户在 Tab A 修改主题后，已打开的其他 Gemini Tab 不会响应，需要刷新才能看到变化。

## 2. 问题分析

主题更新链路分为两条，各自独立：

| 层级 | 颜色预设 | 背景图 |
|------|----------|--------|
| 写入 | `applyTheme()` → `setThemeKey()` → `chrome.storage.sync` | `updateThemeBackgroundSettings()` → `chrome.storage.local` |
| 当前 Tab 即时生效 | `injectGeminiThemeOverride(css)` | `applyThemeBackgroundStyle(state)` |
| 其他 Tab | ❌ 无机制 | ❌ 无机制 |
| 设置面板 UI | ❌ 无机制 | ❌ 无机制 |

问题核心：**服务层（DOM 操作）和 UI 层（React state）都缺少对 `chrome.storage` 变更的响应机制**。

## 3. 解决方案

利用 WXT `storage.defineItem().watch()` 封装的 `chrome.storage.onChanged`，在两个层面独立注册监听器：

- **服务层**：`content script` 初始化时启动，监听 storage 变更后重新 apply 样式到页面 DOM。
- **UI 层**：React 组件 / Provider 中启动，监听 storage 变更后更新 React state，驱动界面重新渲染。

```
chrome.storage 写入（任意 Tab）
  │
  ├── chrome.storage.onChanged（触发所有 Tab 的 watcher）
  │
  ├── [服务层 watcher] → 更新页面 DOM / CSS（`<style>` 注入、CSS 变量）
  │
  └── [UI 层 watcher]  → 更新 React state → 界面重新渲染
```

> watcher 同样会在触发写入的 Tab A 自身触发，但两侧 apply 均幂等，不产生副作用。

## 4. 实现细节

### 4.1 颜色预设 — 服务层

文件：`src/entrypoints/content/gemini-theme/index.ts`

在 `initTheme()` 末尾启动 watcher，**无需修改调用方** `content/index.tsx`：

```ts
export async function initTheme(): Promise<void> {
  // 初始化：读取持久化 key 并注入 CSS
  try {
    const key = await getThemeKey()
    if (key) {
      const preset = getPresetByKey(key)
      if (preset?.css) injectGeminiThemeOverride(preset.css)
    }
  } catch (error) {
    console.warn('[Theme] Failed to initialize theme:', error)
  }

  // 跨 Tab 同步：其他 Tab 切换颜色预设时重新 apply
  themeKeyStorage.watch((newKey) => {
    const key = newKey ?? ''
    const preset = getPresetByKey(key)
    if (preset?.css) {
      injectGeminiThemeOverride(preset.css)
    } else {
      removeGeminiThemeOverride()
    }
  })
}
```

存储键：`sync:themeKey`（`chrome.storage.sync`）

---

### 4.2 背景图设置 — 服务层

文件：`src/entrypoints/content/gemini-theme/background/service.ts`

在 `initThemeBackground()` 末尾启动 watcher：

```ts
export async function initThemeBackground(): Promise<void> {
  // 初始化：读取设置并 apply
  try {
    const settings = await getThemeBackgroundSettings()
    const resolvedBackgroundUrl = await resolveBackgroundUrlFromSettings(settings)
    const state = buildThemeBackgroundResolvedState(settings, resolvedBackgroundUrl)
    applyThemeBackgroundStyle(state)
  } catch (error) {
    console.warn('[ThemeBackground] Failed to initialize background settings:', error)
    clearThemeBackgroundStyle()
  }

  // 跨 Tab 同步：其他 Tab 修改背景设置时重新 apply
  themeBackgroundSettingsStorage.watch(async (newSettings) => {
    if (!newSettings) {
      clearThemeBackgroundStyle()
      return
    }
    try {
      const resolvedBackgroundUrl = await resolveBackgroundUrlFromSettings(newSettings)
      const state = buildThemeBackgroundResolvedState(newSettings, resolvedBackgroundUrl)
      applyThemeBackgroundStyle(state)
    } catch (error) {
      console.warn('[ThemeBackground] Failed to sync background settings:', error)
    }
  })
}
```

存储键：`local:themeBackgroundSettings`（`chrome.storage.local`）

背景图 Blob 存储在 IndexedDB（Dexie，同源共享），各 Tab 各自创建独立的 objectURL，`resolveBackgroundUrlFromSettings` 内已有按 `assetId` 的 per-tab 缓存，不会重复读取。

---

### 4.3 颜色预设 — UI 层

文件：`src/hooks/useThemeColorPalette.tsx`

`ColorPaletteProvider` 在 mount 时同步读取 storage，并注册 watcher 监听跨 Tab 变更：

```tsx
useEffect(() => {
  getThemeKey().then((key) => {
    if (key) setPalette(key)
  })

  const unwatch = themeKeyStorage.watch((newKey) => {
    setPalette(newKey || 'blue')
  })
  return unwatch  // 组件卸载时自动 unwatch
}, [])
```

---

### 4.4 背景图设置 — UI 层

文件：`src/components/setting-panel/views/theme/index.tsx`

`ThemeSettingsView` 在 mount 后注册 watcher，storage 变更时直接更新 `backgroundState`：

```tsx
useEffect(() => {
  const unwatch = themeBackgroundSettingsStorage.watch(async (newSettings) => {
    if (!newSettings) return
    try {
      const previewUrl = await resolveThemeBackgroundPreviewUrl(newSettings)
      setBackgroundState(toResolvedState(newSettings, previewUrl))
    } catch {
      // 静默忽略 watcher 触发的错误，初始加载已有错误处理
    }
  })
  return unwatch
}, [])
```

`themeBackgroundSettingsStorage` 从 `background/index.ts` re-export，供 UI 层直接使用。

---

## 5. 存储键与 watcher 触发范围

| 功能 | 存储键 | Storage 类型 | Watcher 触发范围 |
|------|--------|-------------|----------------|
| 颜色预设 | `themeKey` | `chrome.storage.sync` | 同一 Chrome Profile 下所有页面（含其他设备） |
| 背景图设置 | `themeBackgroundSettings` | `chrome.storage.local` | 本机所有同源页面 |

> `sync` 存储在同一 Chrome Profile 的多设备间同步，`local` 仅限本机。背景图 Blob 存于 IndexedDB，不随 `sync` 跨设备同步，因此背景图设置特意使用 `local`。

## 6. 架构约束

1. **服务层与 UI 层 watcher 完全独立**，互不依赖，各自负责自己的更新目标（DOM vs React state）。
2. **不注册重复 watcher**：两处均在 init / mount 时注册一次，生命周期与 content script / React 组件一致，content script 不需要显式 unwatch；React 组件通过 `useEffect` return 清理。
3. **幂等性**：`injectGeminiThemeOverride` 覆盖同一 `<style>` 标签；`applyThemeBackgroundStyle` 直接赋值 DOM 属性和 CSS 变量，多次调用无副作用。
4. **`content/index.tsx` 零改动**：watcher 封装在 `initTheme` / `initThemeBackground` 内部，调用方无感知。

## 7. 涉及文件

| 文件 | 改动类型 | 说明 |
|------|----------|------|
| `src/entrypoints/content/gemini-theme/index.ts` | 修改 | `initTheme()` 末尾加 `themeKeyStorage.watch()` |
| `src/entrypoints/content/gemini-theme/background/service.ts` | 修改 | `initThemeBackground()` 末尾加 `themeBackgroundSettingsStorage.watch()` |
| `src/entrypoints/content/gemini-theme/background/index.ts` | 修改 | re-export `themeBackgroundSettingsStorage` |
| `src/hooks/useThemeColorPalette.tsx` | 修改 | `ColorPaletteProvider` 加 `themeKeyStorage.watch()` |
| `src/components/setting-panel/views/theme/index.tsx` | 修改 | `ThemeSettingsView` 加 `themeBackgroundSettingsStorage.watch()` |
