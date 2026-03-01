# Theme Appearance (System / Light / Dark)

| **Document Version** | **V1.1** |
| :--- | :--- |
| **Feature Name** | Theme Appearance |
| **Created Date** | Feb 22, 2026 |
| **Status** | ✅ Implemented |

## 1. Background
The current Theme Setting supports Colors and Wallpaper but lacks "Theme Mode" control. Gemini natively supports System / Light / Dark modes, and its state is maintained by the page's `localStorage`. To ensure the extension settings are consistent with Gemini's native theme, an Appearance control needs to be added to the Theme Setting and integrated with Gemini's existing theme key-value logic.

## 2. Goal
Add the Appearance feature to Theme Setting, supporting user switching between:
- `System`
- `Light`
- `Dark`

And ensure:
- UI position is fixed before `Colors`.
- Changes take effect immediately (body class + localStorage).
- Compatible with Gemini's native theme mechanism (`theme` / `Bard-Color-Theme`).
- Compatible with the current extension UI color sync logic (refer to `src/hooks/useSyncColorMode.ts`).

## 3. Scope
This phase includes:
1. Adding an Appearance segmented-control to Theme Setting.
2. Adding logic to read Gemini's theme mode (derived from page `localStorage`).
3. Adding theme switching logic (updating body class + `localStorage`).
4. Supporting system theme application in System mode.
5. i18n copy and basic test supplementation.

This phase does not include:
1. Refactoring existing Colors / Wallpaper business logic.
2. Modifying Gemini's native theme UI.
3. Cross-browser differentiation downgrade strategies (implemented per current Chrome extension environment).

## 4. UI Requirements

### 4.1 Position
- Within the left configuration area of Theme Setting, placed before the `Colors` module.

### 4.2 Component
- Use Chakra UI `segmented-control` (implementation can use Chakra v3's `SegmentGroup` API or project-wrapped components).
- Each option displays an icon + text.

### 4.3 Option Definitions
1. `System`
   - Icon: `MdOutlineBrightness4`
2. `Light`
   - Icon: `MdOutlineLightMode`
3. `Dark`
   - Icon: `MdOutlineDarkMode`

Icon source: `react-icons/md`

## 5. Data Source & Rules

### 5.1 Gemini Theme Related localStorage Keys
1. `theme`
   - Values: `light` | `dark`
   - Meaning: Currently active theme
2. `Bard-Color-Theme`
   - Values: `Bard-Light-Theme` | `Bard-Dark-Theme`
   - Meaning: When this field exists, it indicates a user-forced mode (non-System)

### 5.2 Mode Determination Rules
1. If `Bard-Color-Theme` exists:
   - `Bard-Light-Theme` -> Appearance = `light`
   - `Bard-Dark-Theme` -> Appearance = `dark`
2. If `Bard-Color-Theme` does not exist:
   - Appearance = `system`
3. Actual theme under `system` (for UI sync) priority:
   1. body class (`dark-theme` / `light-theme`)
   2. `window.matchMedia('(prefers-color-scheme: dark)')`
   3. `localStorage.theme` fallback

## 6. Behavior Requirements

### 6.1 Initialization
Read the current Appearance when entering Theme Setting:
1. Read `theme` and `Bard-Color-Theme` from page `localStorage`.
2. Calculate current Appearance per 5.2 rules.
3. Segmented control shows the corresponding selected state.

### 6.2 Switching to `Light` / `Dark`
Taking switching to `dark` as an example:
1. Update body class:
   - First `document.body.classList.remove('light-theme', 'dark-theme')`
   - Then `document.body.classList.add('dark-theme')`
2. Write to localStorage:
   - `localStorage.setItem('theme', 'dark')`
   - `localStorage.setItem('Bard-Color-Theme', 'Bard-Dark-Theme')`
3. Keep the current segmented selection as `dark`.

`light` follows the same logic:
- `theme=light`
- `Bard-Color-Theme=Bard-Light-Theme`

### 6.3 Switching to `System`
1. Read system preference:
   - `prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches`
2. Calculate target theme:
   - `targetTheme = prefersDark ? 'dark' : 'light'`
3. Update body class to `targetTheme`.
4. Write to localStorage:
   - `localStorage.setItem('theme', targetTheme)`
   - `localStorage.removeItem('Bard-Color-Theme')` (Critical: identifies System)
5. Segmented selection switches to `system`.

### 6.4 System Following System Changes
When Appearance=`system`, listen for `matchMedia` changes:
1. Recalculate `targetTheme` after system theme changes.
2. Update body class.
3. Update `localStorage.theme`.
4. `Bard-Color-Theme` remains non-existent.

When Appearance=`light`/`dark`, do not respond to system change events.

### 6.5 Main World Storage-Event Hack (Implemented)
#### 6.5.1 Background Issue
- Modifying `localStorage + body class` only in the content script may leave the Gemini SPA's memory state with old values.
- After switching chat routes, the page might write back the theme using the old memory state, causing the theme to "rebound".

#### 6.5.2 Solution
- Inject a bridge script in the main world to execute theme switching in the page context after receiving extension events.
- Execution steps:
  1. Update `theme` / `Bard-Color-Theme` localStorage.
  2. Update `body` theme class.
  3. Manually dispatch `StorageEvent('storage')` (once for `theme` and once for `Bard-Color-Theme`).

#### 6.5.3 Trigger Chain
1. Theme UI calls `setAppearanceMode(mode)` (content script).
2. Appearance service prioritizes dispatching `CustomEvent('gem-ext:theme-appearance-apply')`.
3. Main world script listens for this event and executes 6.5.2.
4. If the main world bridge is not ready, fall back to the content script's local write logic.

## 7. Technical Design

### 7.1 Code Modification Points (Suggested)
1. New UI Component:
   - `src/components/setting-panel/views/theme/AppearanceSelector.tsx`
2. Adjust Theme Setting Entry:
   - `src/components/setting-panel/views/theme/index.tsx`
   - Insert `AppearanceSelector` before `ColorPresets`.
3. New Gemini Appearance Service (Suggested):
   - `src/entrypoints/content/gemini-theme/appearance/types.ts`
   - `src/entrypoints/content/gemini-theme/appearance/service.ts`
   - `src/entrypoints/content/gemini-theme/appearance/index.ts`
4. Export in Theme Entry:
   - `src/entrypoints/content/gemini-theme/index.ts`
5. New Main World Theme Bridge Script:
   - `src/entrypoints/theme-sync-main-world.ts`
6. Inject Main World Theme Bridge Script during content script initialization:
   - `src/entrypoints/content/index.tsx`
7. Update `web_accessible_resources` to ensure the bridge script can be injected:
   - `wxt.config.ts`
8. New Cross-World Event Constant:
   - `src/common/event.ts` (`gem-ext:theme-appearance-apply`)

### 7.2 Type Suggestions
```ts
export type AppearanceMode = 'system' | 'light' | 'dark'
export type GeminiTheme = 'light' | 'dark'
```

### 7.3 Service Interface Suggestions
```ts
getAppearanceState(): AppearanceState
setAppearanceMode(mode: AppearanceMode): AppearanceState
subscribeSystemThemeChange(onChange: (theme: GeminiTheme) => void): () => void
```

### 7.4 Main World Bridge Protocol (Implemented)
Bridge event: `gem-ext:theme-appearance-apply`

```ts
type ThemeAppearanceApplyEventDetail = {
  mode: 'system' | 'light' | 'dark'
  theme: 'light' | 'dark'
  bardColorTheme: 'Bard-Light-Theme' | 'Bard-Dark-Theme' | null
}
```

Main world ready flag:
- `document.documentElement[data-gpk-theme-sync-ready="true"]`
- Appearance service only uses the bridge if this flag exists; otherwise, it falls back to local.

### 7.5 UI Interaction Interface Suggestions
`AppearanceSelector` external:
```ts
interface AppearanceSelectorProps {
  value: AppearanceMode
  onChange: (mode: AppearanceMode) => Promise<void> | void
  isLoading?: boolean
}
```

### 7.6 Relationship with Existing Sync Logic
`useSyncColorMode` already syncs extension UI color mode based on body class.
As long as Appearance switching correctly updates the body class, the extension UI will sync automatically without needing to repeat Chakra theme state settings.

## 8. i18n Requirements
Add under `settingPanel.theme` (at least):
- `appearance`: `Appearance`
- `appearanceSystem`: `System`
- `appearanceLight`: `Light`
- `appearanceDark`: `Dark`

Missing languages fall back per existing strategy (usually key or English).

## 9. Error Handling
1. `localStorage` read/write exception:
   - Catch exception and downgrade to only updating body class.
   - Keep control operable to avoid blocking.
2. body class missing/abnormal:
   - Use `remove('light-theme','dark-theme') + add(target)` fallback.
3. Invalid storage value:
   - Treat as `system` and rewrite a valid value.
4. Main world bridge not ready or event dispatch failed:
   - Automatically fall back to content script local write, not blocking theme switching.

## 10. Acceptance Criteria
1. Appearance segmented control appears in Theme Setting, located before Colors.
2. Options are `System` / `Light` / `Dark`, with specified `react-icons/md` icons.
3. When `Bard-Color-Theme` does not exist, control shows `System`.
4. When switching to `Light`:
   - body class is `light-theme`
   - `localStorage.theme=light`
   - `localStorage.Bard-Color-Theme=Bard-Light-Theme`
5. When switching to `Dark`:
   - body class is `dark-theme`
   - `localStorage.theme=dark`
   - `localStorage.Bard-Color-Theme=Bard-Dark-Theme`
6. When switching to `System`:
   - `Bard-Color-Theme` is removed
   - Write `theme` and update body class based on system theme
7. System theme changes automatically update page theme in `System` mode.
8. After refreshing the page, Appearance display matches Gemini's actual theme mode.
9. Does not affect existing Colors / Wallpaper functionality and persistence.
10. Theme should not rebound after switching SPA routes like chat.
11. When main world bridge is active, memory state sync is driven via `storage` events.

## 11. Test Plan

### 11.1 Unit Test (Suggested)
1. `getAppearanceState`:
   - Determination of `Bard-Color-Theme` existence/absence
   - Invalid value fallback
2. `setAppearanceMode`:
   - localStorage write assertions for all three modes
   - body class update assertions
3. `System` Monitoring:
   - Updates triggered only in `system` mode
4. Main World Bridge:
   - `setAppearanceMode` prioritizes dispatching `gem-ext:theme-appearance-apply` when ready flag exists
   - Fallback to local write when bridge is unavailable

### 11.2 Manual Regression
1. Appearance selected state is correct when opening Theme Setting.
2. Switching between three modes immediately changes page theme.
3. State persists after refresh.
4. Cross-test with Colors theme switching (change Appearance then Colors, and vice versa).
5. Verify `system` mode behavior during system light/dark switching.
6. Check theme does not rebound after switching chat routes.
7. Verify synthetic `storage` path:
   - Manual dispatch logic in Gemini Console works
   - Theme switching under extension chain stays stable in the same tab
