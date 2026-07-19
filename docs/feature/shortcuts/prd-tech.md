# Shortcut

| **Document Version** | **V1.0** |
| :--- | :--- |
| **Feature Name** | Shortcut |
| **Issue** | [#36](https://github.com/RonkTsang/gemini-chat-extension/issues/36) |
| **Status** | Draft |

## 1. 目标
在 Gemini 页面内提供可自定义快捷键，提升常用操作效率。

本期快捷键只在 `gemini.google.com` 页面中生效，不做浏览器全局快捷键。

## 2. 范围
本期包含：

1. SettingPanel > Tools > Shortcut 设置入口。
2. 快捷键展示、录制、删除、冲突校验。
3. 快捷键设置实时保存，并立即重新监听。
4. 十六个初始动作：
   - Open Gemini Power Kit Settings
   - Toggle Bulk Delete
   - Open New Chat
   - Open Temporary Chat
   - Open Library
   - Open Gems
   - Focus Input
   - Toggle Speech Dictation
   - Toggle Sidebar
   - Cycle Model
   - Create Image
   - Create Video
   - Create Music
   - Open Canvas
   - Open Deep Research
   - Upload Files

本期不包含：

1. 任意网页或浏览器全局快捷键。
2. 将已有普通聊天转换为 Temporary Chat。
3. 多套 shortcut profile 或按页面状态切换 shortcut set。

## 3. UI 与交互
### 3.1 入口
在 SettingPanel 左侧导航的 Tools 分组新增 **Shortcut**。

### 3.2 面板布局
Shortcut 面板按 action 分类展示。每个分类使用左对齐的小标题和无表头 Table，仅保留行分隔线：

```text
Gemini Power Kit
[Toggle Gemini Power Kit Settings] [Toggle Bulk Delete]

App
[Toggle Sidebar] [Open New Chat] [Toggle Temporary Chat] [Open Library] [Open Gems]

Prompt
[Focus Input] [Toggle Speech Dictation] [Cycle Model] [Upload Files] [Create Image] [Create Video] [Create Music] [Open Canvas] [Open Deep Research]
```

每行使用两列：命令名称，以及包含快捷键展示、编辑和删除操作的快捷键区域。

有快捷键时：

```text
[Command] [Shortcut display] [Delete icon]
```

无快捷键时：

```text
[Command] [Text: 未设置]
```

交互规则：

1. hover 行时，在快捷键区域后显示编辑 icon。
2. 点击编辑 icon 后进入录制状态。
3. 录制保存时机为输入框失焦。
4. 点击删除 icon 清空该命令的快捷键设定。
5. 录制报错在输入框下方展示 danger 提醒文案。
6. 重新输入或点击删除 icon 后，当前错误消失。

### 3.3 快捷键展示
按当前系统显示快捷键：

| Platform | Modifier Display | Joiner Example |
| :--- | :--- | :--- | :--- |
| macOS | `⌘` `⌥` `⇧` | `⌘⇧ S` |
| Windows | `Win` `Alt` `Shift` | `Ctrl + Shift + S` |

快捷键按键展示使用 Chakra `Kbd`。

## 4. 录制规则
技术选型：`react-hotkeys-hook`。

录制规则：

1. 不允许单字母。
2. 默认要求包含至少一个 modifier：`Alt` / `Ctrl` / `Meta` / `Shift`。
3. 明确允许的单键快捷键例外：`/`。
4. 不允许特殊键，录制时通过 blacklist 禁止：
   - `backspace`
   - `tab`
   - `clear`
   - `enter` / `return`
   - `esc` / `escape`
   - `space`
   - `up` / `down` / `left` / `right`
   - `pageup` / `pagedown`
   - `del` / `delete`
5. 不允许两个 action 使用同一个快捷键。
6. 录制期间必须暂停页面全局快捷键触发，避免录制完成后立即执行动作。

错误类型建议：

| Reason | UI Message |
| :--- | :--- |
| `missing-modifier` | 需要包含 Alt、Ctrl、Meta 或 Shift |
| `single-letter` | 不支持单字母快捷键 |
| `special-key` | 此按键不能作为快捷键 |
| `conflict` | 该快捷键已被其他命令使用 |

## 5. 初始快捷键

**浏览器可用性约束：** `Alt + I`（Windows/Linux）和 `Option + I`（macOS）无法作为可录入且可稳定触发的浏览器快捷键。因此 Tools 不使用该组合：Windows/Linux 统一使用 `Alt + Shift + 字母`，macOS 使用 `Ctrl + 字母`。

| Action | macOS | Windows / Linux | Behavior |
| :--- | :--- | :--- | :--- |
| `openSettings` | `ctrl + ,` | `alt + ,` | Toggle Gemini Power Kit Settings：已打开时关闭；未打开时打开并切换至 Shortcut 设置页 |
| `toggleBulkDelete` | `ctrl + shift + d` | `alt + shift + d` | 开启或退出 Bulk Delete 模式；仅在非文本输入状态触发 |
| `openNewChat` | `ctrl + n` | `alt + n` | 优先点击 Gemini 原生 New chat 入口，失败后切换至 `/app` 兜底 |
| `openTemporaryChat` | `ctrl + t` | `alt + t` | Toggle Temporary Chat：当前路径为 `/app` 时直接点击 `temp-chat-button > gem-icon-button`；其他页面复用 `openNewChat` 后延迟 500ms 点击 |
| `openLibrary` | `ctrl + l` | `alt + l` | 点击 SideNav 中原生的 Library 入口 |
| `openGems` | `ctrl + g` | `alt + g` | 点击 SideNav 中原生的 Gems 入口 |
| `focusInput` | `/` | `/` | 复用 `editorUtils` 聚焦 Gemini 输入框 |
| `toggleSidebar` | `ctrl + b` | `alt + b` | 根据当前侧边栏状态点击关闭或开启按钮 |
| `toggleSpeechDictation` | `ctrl + d` | `alt + d` | 切换 Gemini 原生听写；可在 Gemini 输入框聚焦时触发 |
| `cycleModel` | `ctrl + shift + m` | `alt + m` | 切换至模式菜单中当前顺序的下一个模型；可在 Gemini 输入框聚焦时触发 |
| `uploadFiles` | `ctrl + u` | `alt + u` | 打开 Upload & tools，并点击 `uploader button[data-test-id="local-images-files-uploader-button"]` |
| `createImage` | `ctrl + i` | `alt + shift + i` | 打开 Upload & tools，并点击图标名为 `image_create` 的原生工具项 |
| `createVideo` | `ctrl + v` | `alt + shift + v` | 打开 Upload & tools，并点击图标名为 `movie` 的原生工具项 |
| `createMusic` | `ctrl + m` | `alt + shift + m` | 打开 Upload & tools，并点击图标名为 `music` 的原生工具项 |
| `openCanvas` | `ctrl + c` | `alt + shift + c` | 打开 Upload & tools，并点击图标名为 `canvas` 的原生工具项 |
| `openDeepResearch` | `ctrl + r` | `alt + shift + r` | 打开 Upload & tools，并点击图标名为 `deep_research` 的原生工具项；能力不可用时不触发 |

## 6. 技术设计
### 6.1 数据结构
快捷键以 action 为中心，便于后续扩展。

```ts
export type ShortcutAction =
  | 'openSettings'
  | 'toggleBulkDelete'
  | 'openNewChat'
  | 'openTemporaryChat'
  | 'openLibrary'
  | 'openGems'
  | 'focusInput'
  | 'toggleSpeechDictation'
  | 'toggleSidebar'
  | 'cycleModel'
  | 'createImage'
  | 'createVideo'
  | 'createMusic'
  | 'openCanvas'
  | 'openDeepResearch'
  | 'uploadFiles'

export type ShortcutCategory = 'geminiPowerKit' | 'app' | 'prompt'

export interface ShortcutDefinition {
  action: ShortcutAction
  category: ShortcutCategory
  labelKey: string
  defaultShortcut: { default: string | null; mac?: string | null }
  enableOnFormTags: Options['enableOnFormTags']
  enableOnContentEditable: boolean
}

export interface ShortcutSettings {
  enabled: boolean
  bindings: Record<ShortcutAction, string | null>
}
```

`shortcutCategories` 定义分组显示顺序和标题 i18n key；`shortcutDefinitions` 通过 `category`
定义动作归属。设置页按该配置渲染，storage 仅保存 action bindings，因此分类调整不影响用户已有快捷键。

建议使用 WXT storage：

```ts
storage.defineItem<ShortcutSettings>('local:shortcutSettings', {
  fallback: {
    enabled: true,
    bindings: {
      openSettings: 'alt+comma', // macOS: ctrl+comma
      toggleBulkDelete: 'alt+shift+d', // macOS: ctrl+shift+d
      openNewChat: 'alt+n', // macOS: ctrl+n
      openTemporaryChat: 'alt+t', // macOS: ctrl+t
      openLibrary: 'alt+l', // macOS: ctrl+l
      openGems: 'alt+g', // macOS: ctrl+g
      focusInput: 'slash',
      toggleSpeechDictation: 'alt+d', // macOS: ctrl+d
      toggleSidebar: 'alt+b', // macOS: ctrl+b
      cycleModel: 'alt+m', // macOS: ctrl+shift+m
      createImage: 'alt+shift+i', // macOS: ctrl+i
      createVideo: 'alt+shift+v', // macOS: ctrl+v
      createMusic: 'alt+shift+m', // macOS: ctrl+m
      openCanvas: 'alt+shift+c', // macOS: ctrl+c
      openDeepResearch: 'alt+shift+r', // macOS: ctrl+r
      uploadFiles: 'alt+u',
    },
  },
})
```

### 6.2 注册与实时更新
使用一个无 UI 的 React controller 挂在 content overlay 中。

```tsx
function PageShortcutController() {
  const settings = useShortcutSettings()
  const isRecording = useShortcutRecordingState()

  if (!settings.enabled || isRecording) {
    return null
  }

  return shortcutDefinitions.map((definition) => (
    <ShortcutRegistration
      key={definition.action}
      definition={definition}
      shortcut={settings.bindings[definition.action]}
    />
  ))
}
```

每个 `ShortcutRegistration` 内部调用一次 `useHotkeys`。不要在循环中直接调用 hook。

`enableOnContentEditable` 与 `enableOnFormTags` 均由 action 定义控制。Gemini 输入框同时为
`contenteditable` 和 `role="textbox"`，因此 Prompt 分类中除 Focus Input 外的动作需配置前者为 `true`，并仅放行
`enableOnFormTags: ['textbox']`；这样用户为模型或工具自定义的组合键可在输入框聚焦时触发。

设置变化后：

1. SettingPanel 保存至 storage。
2. `PageShortcutController` 通过 storage `watch()` 获取新值。
3. React 重新渲染注册组件。
4. 旧快捷键监听自动清理，新快捷键立即生效。

### 6.3 模块建议
| Module | Responsibility |
| :--- | :--- |
| `src/services/shortcuts/settings.ts` | storage、默认值、类型 |
| `src/services/shortcuts/definitions.ts` | action 定义、label、默认快捷键 |
| `src/services/shortcuts/format.ts` | 按系统格式化展示 |
| `src/components/page-shortcuts/PageShortcutController.tsx` | 页面快捷键注册 |
| `src/components/setting-panel/views/shortcuts/` | Shortcut 设置 UI |
| `src/utils/chatActions.ts` | New Chat / Temporary Chat / Library / Gems 页面动作，优先点击原生入口 |
| `src/utils/editorUtils.ts` | 输入框聚焦等 Gemini editor 动作 |
| `src/utils/cycleModel.ts` | 读取 Gemini 当前模型菜单，并点击下一个可用模型 |
| `src/utils/toolboxActions.ts` | 打开 Upload & tools，并按 locale-neutral 图标名启动原生工具 |

## 7. 验收标准
1. SettingPanel > Tools 中可进入 Shortcut 页面。
2. 快捷键按 Gemini Power Kit、App、Prompt 三组展示，且不显示表头。
3. 所有十六个默认快捷键在 Gemini 页面内生效；macOS 使用 `Ctrl`，Windows/Linux 使用 `Alt`。Bulk Delete 两端均使用额外的 `Shift`；macOS Cycle Model 使用额外的 `Shift`；Windows/Linux Tools 使用额外的 `Shift`。
4. 修改或删除快捷键后无需刷新页面即可生效。
5. 录制期间不会触发已有快捷键动作。
5. 重复、单字母、特殊键等非法输入会显示 danger 提醒。
6. 快捷键按当前系统格式展示，并使用 Chakra `Kbd`。
7. Temporary Chat 动作复用 `openNewChat` 打开新聊天后点击 `temp-chat-button > gem-icon-button`，不描述为转换已有聊天。
8. Focus Input 使用 `/` 聚焦输入框；Toggle Sidebar 使用 `ctrl/alt + b` 切换侧边栏。
9. Toggle Speech Dictation 使用 `ctrl/alt + d`；Cycle Model 在 macOS 使用 `ctrl + shift + m`、在 Windows/Linux 使用 `alt + m`；输入框聚焦时仍可触发。
10. Open Library 使用 `ctrl/alt + l`，Open Gems 使用 `ctrl/alt + g`，均点击 Gemini SideNav 原生入口。
11. Create Image、Create Video、Create Music、Canvas、Deep Research 在 macOS 使用 `ctrl + i/v/m/c/r`，在 Windows/Linux 使用 `alt + shift + i/v/m/c/r`，并通过 Gemini 原生 Upload & tools 菜单启动；这是为避开浏览器中不可用的 `Alt + I`／`Option + I` 组合。
12. Upload Files 默认使用 `ctrl/alt + u`，并打开 Gemini 原生文件选择器；Bulk Delete 默认使用 `ctrl/alt + shift + d`，且不在文本输入时触发。
