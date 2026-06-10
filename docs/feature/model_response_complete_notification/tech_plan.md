# Model Response Complete Notification 技术实现方案

| 项目 | 内容 |
| :--- | :--- |
| 文档版本 | V1.0 |
| 功能名称 | 模型回复完成通知 |
| 创建日期 | June 4, 2026 |
| 状态 | Draft |

## 1. 目标与边界

本方案基于 [`prd.md`](./prd.md)，目标是在 Chrome MV3 与 Firefox MV2 中同时实现 Gemini 回复完成系统通知。

核心目标：

1. 功能默认关闭。
2. 仅在用户主动打开开关时申请 `notifications` optional permission。
3. 不新增 `tabs`、`activeTab` 或 host permission。
4. Chrome 与 Firefox 都支持系统通知、测试通知、点击通知回到对应 Gemini tab。
5. 仅在开关开启时启动 Gemini 回复状态监听；关闭后停止监听并清理 observer。
6. 仅识别监听启动后新增的最新 `div.conversation-container[id]`；在其回答内容容器内按回答类型规则判断完成，文本使用 5 秒静默，图片使用终态语义节点。

不在首版范围内：

1. 自定义通知文案。
2. 通知频率配置或冷却时间。
3. 撤销通知权限按钮。
4. 自定义通知音效。
5. 展示用户提示词、历史对话或完整模型回复正文。

## 2. 权限与 Manifest

### 2.1 Manifest 变更

文件：`wxt.config.ts`

在生成 manifest 时新增：

```ts
optional_permissions: ['notifications']
```

要求：

1. `notifications` 只能出现在 `optional_permissions`。
2. 不把 `notifications` 放入 `permissions`。
3. 不新增 `tabs` permission。
4. 不新增 `activeTab` permission。
5. 不新增 host permission。

Chrome / Firefox 都生成同样的 optional permission。Firefox 既有 `webRequest`、`webRequestBlocking`、`*://gemini.google.com/*` 仍只保留在 Firefox 分支。

### 2.2 为什么不需要 `tabs` 权限

本功能点击通知后只需要回到原 Gemini tab：

```ts
await browser.tabs.update(tabId, { active: true })
await browser.windows.update(windowId, { focused: true })
```

实现只保存 `sender.tab.id` 与 `sender.tab.windowId`，不读取 tab `url`、`title`、`favIconUrl`，也不通过 `tabs.query({ url: ... })` 按 URL 查询 tab。因此不需要 `tabs` permission。

通知 title 使用当前 chat 标题，但由 content script 从 Gemini DOM 中提取后随 runtime message 传给后台，不由后台读取 browser tab title。

约束：

1. 后台不得读取 `tab.url`、`tab.title`、`tab.favIconUrl`。
2. 后台不得使用 `tabs.query()` 按 `url`、`title` 过滤。
3. 如果未来需要按 URL 查找 Gemini tab 或展示 tab title，需要重新评估 `tabs` 或 host permission。

## 3. 文件与模块规划

新增文件：

```text
src/services/responseCompleteNotificationDetector.ts
src/services/responseCompleteNotificationSettings.ts
src/entrypoints/background/responseCompleteNotification.ts
```

修改文件：

```text
wxt.config.ts
src/types/runtime-messages.ts
src/entrypoints/background/index.ts
src/entrypoints/content/index.tsx
src/entrypoints/popup/storage.ts
src/entrypoints/popup/App.tsx
src/locales/en.json
src/locales/zh_CN.json
src/locales/zh_TW.json
src/locales/de.json
src/locales/es.json
src/locales/fr.json
src/locales/ja.json
src/locales/ko.json
src/locales/pt_BR.json
docs/platforms.md
```

说明：

- `responseCompleteNotificationSettings.ts` 负责 storage item 与权限 readiness helper。
- `responseCompleteNotificationDetector.ts` 负责 Gemini chat history、active turn 与完成信号监听。
- `background/responseCompleteNotification.ts` 负责 notification message、权限检查、创建通知、点击回跳。
- `background/index.ts` 解开现有 Chrome 不运行 background 的限制，但 Firefox webRequest 逻辑继续 Firefox-only。

## 4. Storage 与设置语义

### 4.1 Storage item

文件：`src/services/responseCompleteNotificationSettings.ts`

```ts
import { storage } from '#imports'

export const enableResponseCompleteNotification = storage.defineItem<boolean>(
  'sync:enableResponseCompleteNotification',
  { fallback: false },
)

export const getResponseCompleteNotificationEnabled = () =>
  enableResponseCompleteNotification.getValue()

export const setResponseCompleteNotificationEnabled = (enabled: boolean) =>
  enableResponseCompleteNotification.setValue(enabled)
```

`enableResponseCompleteNotification` 表示用户意图：

- `false`：用户不希望启用通知。
- `true`：用户希望启用通知。

它不表示通知当前一定可用。实际可用性由 readiness 决定。

### 4.2 Readiness 类型

```ts
export type NotificationReadiness =
  | 'off'
  | 'missing-extension-permission'
  | 'blocked-by-browser'
  | 'allowed'
  | 'allowed-but-system-unknown'
```

检查逻辑：

1. 如果用户意图为关闭，返回 `off`。
2. 调用 `browser.permissions.contains({ permissions: ['notifications'] })`。
3. 如果没有 optional permission，返回 `missing-extension-permission`。
4. 如果支持 `browser.notifications.getPermissionLevel()`，读取浏览器通知状态。
5. 返回 `denied` 时返回 `blocked-by-browser`。
6. 返回 `granted` 时返回 `allowed`。
7. 不支持 `getPermissionLevel()` 时返回 `allowed-but-system-unknown`。

注意：

- 不使用 Web `Notification.permission`。
- 发送通知前必须再次检查 permission，不能只信任 Popup 的检查结果。

## 5. Runtime Message

文件：`src/types/runtime-messages.ts`

新增常量：

```ts
export const RESPONSE_COMPLETE_NOTIFICATION_CREATE_MESSAGE =
  'response-complete-notification:create' as const
export const RESPONSE_COMPLETE_NOTIFICATION_TEST_MESSAGE =
  'response-complete-notification:test' as const
export const RESPONSE_COMPLETE_NOTIFICATION_GET_READINESS_MESSAGE =
  'response-complete-notification:get-readiness' as const
```

新增类型：

```ts
export interface ResponseCompleteNotificationCreateMessage {
  type: typeof RESPONSE_COMPLETE_NOTIFICATION_CREATE_MESSAGE
  payload: {
    title: string
    message: string
    timestamp: number
  }
}

export interface ResponseCompleteNotificationTestMessage {
  type: typeof RESPONSE_COMPLETE_NOTIFICATION_TEST_MESSAGE
  payload: {
    timestamp: number
  }
}

export interface ResponseCompleteNotificationGetReadinessMessage {
  type: typeof RESPONSE_COMPLETE_NOTIFICATION_GET_READINESS_MESSAGE
}

export interface ResponseCompleteNotificationResponse {
  ok: boolean
  readiness?: NotificationReadiness
  error?: 'missing-tab' | 'permission-denied' | 'notification-failed'
}
```

新增 type guard：

```ts
export function isResponseCompleteNotificationCreateMessage(
  message: unknown,
): message is ResponseCompleteNotificationCreateMessage
```

同理补齐 `test` 与 `get-readiness`。

约束：

1. `create` 只由 Gemini content script 发送。
2. `create.payload.title` 是当前 chat 标题。
3. `create.payload.message` 是最新已完成模型回复内容摘要，最多 200 个字符。
4. 后台用 `sender.tab?.id` 和 `sender.tab?.windowId` 决定点击回跳目标。
5. 后台不信任 content script payload 中的 tab 相关字段。
6. 未知 message 不影响既有 Firefox background message。

## 6. Background 实现

### 6.1 解开 Chrome background 限制

文件：`src/entrypoints/background/index.ts`

当前 production include 只有 Firefox。需要改为 Chrome 与 Firefox 都包含 background：

```ts
const includeBrowsers = import.meta.env.COMMAND === 'serve'
  ? [import.meta.env.BROWSER]
  : ['chrome', 'firefox']

export default defineBackground({
  include: includeBrowsers,
  persistent: import.meta.env.FIREFOX,
  main() {
    startResponseCompleteNotificationBackground()

    if (import.meta.env.FIREFOX) {
      startFirefoxBackground()
    }
  },
})
```

实现要求：

- `startResponseCompleteNotificationBackground()` 是 shared background 逻辑。
- `startFirefoxBackground()` 仍只在 Firefox 执行。
- Chrome manifest 应生成 MV3 service worker。
- Firefox manifest 应保留 MV2 persistent background。

如果 WXT 对 `persistent` 在 Chrome MV3 类型上有约束，以实际 WXT build 输出为准调整，但验收目标不变：Chrome 生产构建必须包含可运行 background/service worker。

### 6.2 通知后台模块

文件：`src/entrypoints/background/responseCompleteNotification.ts`

状态：

```ts
let hasStarted = false
const notificationTargets = new Map<string, { tabId: number; windowId?: number }>()
```

启动函数：

```ts
export function startResponseCompleteNotificationBackground(): void {
  if (hasStarted) return
  hasStarted = true

  browser.runtime.onMessage.addListener(handleRuntimeMessage)
  browser.notifications.onClicked.addListener(handleNotificationClicked)
  browser.notifications.onClosed.addListener(handleNotificationClosed)
}
```

创建通知：

```ts
async function createResponseCompleteNotification(target: {
  tabId: number
  windowId?: number
  title: string
  message: string
  timestamp: number
  source: 'response-complete' | 'test'
}) {
  const notificationId = `${target.source}:${target.tabId}:${target.timestamp}`
  notificationTargets.set(notificationId, {
    tabId: target.tabId,
    windowId: target.windowId,
  })

  await browser.notifications.create(notificationId, {
    type: 'basic',
    iconUrl: browser.runtime.getURL('/icon/512.png'),
    title: normalizeNotificationTitle(target.title),
    message: normalizeNotificationMessage(target.message),
  })

  return notificationId
}
```

点击回跳：

```ts
async function focusNotificationTarget(notificationId: string): Promise<void> {
  const target = notificationTargets.get(notificationId)
  if (!target) return

  try {
    if (typeof target.windowId === 'number') {
      await browser.windows.update(target.windowId, { focused: true })
    }
    await browser.tabs.update(target.tabId, { active: true })
  } finally {
    notificationTargets.delete(notificationId)
  }
}
```

关闭通知：

```ts
function handleNotificationClosed(notificationId: string): void {
  notificationTargets.delete(notificationId)
}
```

错误处理：

- 缺少 `sender.tab?.id` 时返回 `{ ok: false, error: 'missing-tab' }`。
- readiness 为 `missing-extension-permission` 或 `blocked-by-browser` 时不创建通知。
- `title` 为空时回退为 `Gemini finished replying`。
- `message` 为空时回退为 `Your response is ready.`。
- 后台再次限制 `title` 与 `message` 长度；`message` 最多 200 个字符。
- `browser.notifications.create()` 抛错时返回 `{ ok: false, error: 'notification-failed' }`。
- 不把错误抛回影响其他 background listener。

### 6.3 Test notification

Popup 发送 `response-complete-notification:test`。

目标选择：

1. 如果 `sender.tab?.id` 存在，测试通知点击后回到 Popup 所在窗口的当前 tab。
2. 如果没有 sender tab，测试通知仍可创建，但不记录回跳 target。

测试通知文案可以复用首版固定文案，或使用更明确的固定文案：

```ts
title: 'Gemini Power Kit notification test'
message: 'Notifications are working.'
```

首版如果选择测试专用文案，需要同步补充 i18n key。

## 7. Content Detector 实现

文件：`src/services/responseCompleteNotificationDetector.ts`

### 7.1 生命周期

content script 启动时只启动 settings watcher，不立即启动 DOM observer。

```ts
class ResponseCompleteNotificationDetector {
  private isStarted = false
  private isMonitoring = false
  private chatHistoryObserver: MutationObserver | null = null
  private activeTurn: ActiveResponseTurn | null = null

  async start(): Promise<void>
  stop(): void
}
```

启动流程：

1. `start()` 读取 `getResponseCompleteNotificationEnabled()`。
2. 如果为 true，调用 `startMonitoring()` 并绑定 chat history。
3. 注册 `enableResponseCompleteNotification.watch(...)`。
4. storage 变为 true 时启动 DOM observer。
5. storage 变为 false 时停止 DOM observer 并 reset 状态。
6. content invalidated 时调用 `stop()`。

### 7.2 Observer 策略

使用局部、按需 observer，不扫描全部历史，也不监听 `document.body`：

1. 初始化定位 `[data-test-id="chat-history-container"]`；当前已有 turn 自然作为基线，不补追踪。
2. chat history observer 仅使用 `{ childList: true, subtree: false }`，只检查 mutation 的 `addedNodes`。
3. 新增节点必须是当前最新的 `div.conversation-container[id]`；无 ID 与 provisional 节点不参与识别。
4. 新 turn 出现时清理旧 active turn，只追踪最新一轮。
5. active turn observer 使用 `{ childList: true, characterData: true, subtree: true }`。
6. 每次 active turn 变化时，在回答内容容器内重新评估回答类型及其完成策略；文本内容变化时重置共享的 5 秒静默计时器，明确终态类型满足条件时直接完成。
7. 完成、替换、关闭或普通 chat change 后立即断开 observer 并清理计时器。

### 7.3 状态机

主状态机：

```text
等待新 turn
  -> 新增最新 div.conversation-container[id]
  -> active turn
  -> 出现 model-response-message-content
  -> 按优先级识别回答类型
  -> 使用该类型的完成策略
  -> completed
```

完成规则：

1. active turn 内至少存在一个 `structured-content-container [id*="model-response-message-content"]`，所有回答类型规则仅在该容器范围内评估。
2. 图片、音乐、视频等明确类型规则优先，非空文字规则最后匹配，作为文本兜底。
3. 文本回答使用 `inactivity` 策略；子节点或文本节点变化都会重置共享的 5 秒静默计时器，不监听属性变化。
4. 图片回答在出现 `generated-image` 时识别类型，在出现 `generated-image single-image` 时使用 `immediate` 策略直接完成。
5. 回答从文本兜底识别为明确类型时，必须清理文本静默计时器，避免旧策略继续触发。
6. 多候选回复仍由一个 active turn 和一个 observer 管理；摘要优先取 DOM 顺序最后一个非空文字候选，无文字时使用通知兜底文案。
7. 完成后清理 active turn；页面前台时完成但不发送通知。
8. 不使用 `message-actions`、send button、内容签名、provisional turn 或多完成信号去重。
9. SPA chat change 清理 active turn 并重新绑定 chat history；空白新 chat 首次发送后 URL 落盘时，如果已有 active turn，则保留该 turn。

### 7.4 回答类型规则

回答类型能力使用规则表扩展，避免将图片、音乐、视频判断散落在 active turn 主流程中：

```ts
type ResponseType = 'text' | 'image' | 'music' | 'video'

interface ResponseTypeRule {
  type: ResponseType
  detect(content: Element): boolean
  isComplete(content: Element): boolean
  completionMode: 'immediate' | 'inactivity'
}
```

首批规则：

| 类型 | 识别条件 | 完成条件 | 完成策略 |
| :--- | :--- | :--- | :--- |
| `image` | 当前回答内容容器内存在 `generated-image` | 存在 `generated-image single-image` | `immediate` |
| `text` | 当前回答内容容器存在非空文字 | 回答内容整体连续静默 5 秒 | `inactivity` |

规则约束：

1. 按规则表顺序匹配，明确媒体类型必须排在文本兜底之前。
2. 选择器从当前 `model-response-message-content` 开始查询，不依赖动态 ID、完整 DOM 路径或 `p > div` 等布局层级。
3. Active Turn 仍只创建一个 `MutationObserver`；规则只负责解释当前 DOM，不自行创建 observer 或计时器。
4. `immediate` 表示终态条件出现时立即完成；`inactivity` 表示满足识别条件后使用 active turn 共享静默计时器。
5. 后续新增音乐、视频类型时，只增加对应规则与定向测试，不修改 turn 识别与 observer 生命周期。
6. 类型识别与完成使用通用日志事件 `response-type-detected` 和 `response-type-completed`，并携带 `turnId` 与 `responseType`；不为每种类型建立独立日志事件体系。
7. 图片完成后进入一次性 completing 状态，最多等待 5 秒查找 `generated-image > single-image > div > div > button.image-button > img`；等待只用于通知预览，不改变完成判断。
8. 图片预览在 Chrome 中本地处理：fetch `img.currentSrc || img.src`，校验 image Blob，Canvas 缩放至最长边 512px，JPEG 压缩至最多约 500KB，再转为 Data URL。失败、超时、Firefox 或前台抑制时不处理图片数据。
9. Chrome macOS 使用 `basic` 通知并把图片 Data URL 放入 `iconUrl`；Chrome 非 macOS 继续使用 `image` 通知和 `imageUrl`；Firefox 固定 basic。

### 7.5 通知内容提取

title 提取：

```ts
function getCurrentChatNotificationTitle(): string {
  const titleElement = document.querySelector<HTMLElement>(
    'top-bar-actions .conversation-title-container',
  )
  const title = titleElement?.textContent?.trim()

  if (title) return title
  if (document.title.trim()) return document.title.trim()
  return 'Gemini finished replying'
}
```

message 提取：

```ts
import { extractModelResponseContent } from '@/utils/messageUtils'

const MAX_NOTIFICATION_MESSAGE_LENGTH = 200

function getCompletedModelResponseSummary(modelResponse: Element): string {
  const content = extractModelResponseContent(modelResponse)
  const normalized = content.replace(/\s+/g, ' ').trim()

  if (!normalized) {
    return 'Your response is ready.'
  }

  return normalized.slice(0, MAX_NOTIFICATION_MESSAGE_LENGTH)
}
```

要求：

1. message 优先从 active turn 中最后一个非空文字回答容器所属的 `model-response` 提取。
2. 图片回答没有可用文字摘要时使用 `Your image is ready.`；其他无摘要回答使用 `Your response is ready.`。
3. 双模型或多候选回复使用 DOM 顺序中最后一个非空候选。
4. message 不读取用户提示词，不拼接历史回复。
5. message 不包含隐藏 UI 文案或 thinking 内容；如果现有 `messageUtils` 提取结果会包含不需要的 UI 文案，需要在本功能中补充过滤。
6. content script 先截取到 200 个字符，background 再做一次长度保护。

图片通知 payload：

```ts
type ResponseNotificationContentType = 'text' | 'image'

interface ResponseCompleteNotificationCreateMessage {
  payload: {
    title: string
    message: string
    timestamp: number
    responseType: ResponseNotificationContentType
    imageDataUrl?: string
  }
}
```

要求：

1. 文本回复传 `responseType: 'text'`。
2. 图片回复传 `responseType: 'image'`，图片缩略图成功时附带 JPEG Data URL。
3. background 仅接受 `data:image/jpeg;base64,` 且长度不超过约 750KB 的图片数据。
4. Chrome 非 macOS 有效图片数据使用通知 `type: 'image'` 与 `imageUrl`；Chrome macOS 有效图片数据使用通知 `type: 'basic'` 与 `iconUrl`；Firefox、无效图片数据或图片模板创建失败时回退扩展默认图标的 `type: 'basic'`。
5. 日志只记录模板类型、图片尺寸、压缩后字节数和回退原因，不记录 Blob URL、Data URL 或图片内容。

### 7.6 与 content boot sequence 集成

文件：`src/entrypoints/content/index.tsx`

在服务启动阶段加入：

```ts
responseCompleteNotificationDetector.start()
ctx.onInvalidated(() => {
  responseCompleteNotificationDetector.stop()
  stopPowerKitEntry()
})
```

如果当前已有多个 `ctx.onInvalidated` 调用，需要合并，避免后注册覆盖前注册的预期行为。

## 8. Popup 实现

文件：

- `src/entrypoints/popup/storage.ts`
- `src/entrypoints/popup/App.tsx`

### 8.1 Storage 接入

`storage.ts` 需要导出：

```ts
export {
  getResponseCompleteNotificationEnabled,
  setResponseCompleteNotificationEnabled,
} from '@/services/responseCompleteNotificationSettings'
```

`getAllSettings()` 增加 `enableResponseCompleteNotification`。

### 8.2 开关行为

开启流程：

1. 用户点击 Switch 开启。
2. 调用 `browser.permissions.contains({ permissions: ['notifications'] })`。
3. 如果没有 permission，立即在当前用户手势内调用 `browser.permissions.request({ permissions: ['notifications'] })`。
4. 如果 request 返回 false，保持 switch off，并显示错误提示。
5. 如果授权成功，写入 `enableResponseCompleteNotification = true`。
6. 发送 `get-readiness`，根据结果展示状态提示。

关闭流程：

1. 写入 `enableResponseCompleteNotification = false`。
2. 不调用 `browser.permissions.remove()`。
3. 隐藏或禁用测试通知按钮。

### 8.3 UI 入口

Popup 当前宽度为 320px，设置项较少。新增项应保持紧凑：

- Label：`Notify when Gemini finishes replying`
- Description：`Show the chat title and a short response preview when Gemini finishes replying.`
- 中文：`Gemini 回复完成时通知我`
- 中文描述：`Gemini 回复完成后，发送包含 chat 标题和回复摘要的系统通知。`

测试通知入口：

- 仅在用户意图开启时显示。
- readiness 为 `missing-extension-permission` 或 `blocked-by-browser` 时禁用。
- 点击后发送 `response-complete-notification:test`。

状态提示：

- `missing-extension-permission`：提示重新开启以授权通知。
- `blocked-by-browser`：提示检查浏览器通知设置。
- `allowed-but-system-unknown`：提示系统通知设置仍可能阻止通知。

排查链接：

- 第一版可打开 GitHub 上的排查文档 URL。
- 如果不希望依赖外部链接，需要后续实现 extension 内帮助页，本方案首版不做。

## 9. i18n

新增 key 建议：

```json
{
  "responseNotificationLabel": "Notify when Gemini finishes replying",
  "responseNotificationDescription": "Show the chat title and a short response preview when Gemini finishes replying.",
  "responseNotificationPermissionDenied": "Notification permission was not granted.",
  "responseNotificationBlocked": "Notifications are blocked by your browser settings.",
  "responseNotificationSystemUnknown": "Notifications may still depend on your system settings.",
  "responseNotificationTest": "Send test notification",
  "responseNotificationTroubleshooting": "Notifications not showing? Check notification settings",
  "responseNotificationTestTitle": "Gemini Power Kit notification test",
  "responseNotificationTestMessage": "Notifications are working.",
  "responseNotificationTitle": "Gemini finished replying",
  "responseNotificationMessage": "Your response is ready."
}
```

要求：

1. 英文为 base。
2. 所有 locale 文件保持 key 对齐。
3. 运行 `node scripts/check-i18n.js` 或 `pnpm run check:i18n`。

## 10. docs/platforms.md 更新

新增一节 `Notifications`：

```md
## Notifications

- Chrome and Firefox both declare `notifications` only in `optional_permissions`.
- Chrome MV3 now includes a production background service worker for notification message handling.
- Firefox keeps the MV2 persistent background and reuses the same notification background module.
- The feature does not request `tabs`; notification click handling only uses stored `sender.tab.id/windowId`.
```

同时更新 `Background Runtime`：

- Chrome 不再是“无生产 background path”，而是“有 shared notification service worker；Firefox webRequest 仍为 Firefox-only”。

## 11. 测试计划

### 11.1 单元测试

建议新增：

```text
src/services/responseCompleteNotificationDetector.test.ts
src/entrypoints/background/responseCompleteNotification.test.ts
```

Detector 测试：

1. 默认 disabled 时不创建 observer。
2. 初始化只记录最新 turn 基线，已有 turn 后续完成不通知。
3. 新增最新 turn 后启动 active turn observer。
4. 新增非最新历史 turn 不通知。
5. provisional、无 ID 和非最新 turn 不参与识别。
6. 新增最新最终 turn 后启动 active turn observer。
7. 空回答容器不启动静默计时器；出现非空文字内容后开始计时。
8. 新增子节点与修改现有文本节点都会重置静默计时器。
9. 双模型或多候选共用静默计时器，并使用最后一个非空候选摘要。
10. active turn 替换后旧 turn 变化不通知。
11. visible 且 focused 时完成并清理 active turn，但不发送 message。
12. chat change、disabled 和 content invalidated 后清理 observer 与静默计时器。
13. 空白新 chat 首次发送后 URL 落盘时保留 active turn。
14. 回复摘要归一化空白并截取到 200 个字符。

Background 测试：

1. readiness missing permission 时不创建通知。
2. readiness blocked 时不创建通知。
3. allowed 时创建 basic notification。
4. notification id 记录 tab target。
5. 点击通知调用 `windows.update` 和 `tabs.update`。
6. notification closed 后清理 Map。
7. 不读取 tab `url/title/favIconUrl`。
8. 创建通知时使用 payload title/message。
9. payload title/message 为空或过长时执行 fallback 与长度保护。

### 11.2 本地验证命令

优先使用：

```bash
node scripts/check-i18n.js
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/vitest run src/services/responseCompleteNotificationDetector.test.ts src/entrypoints/background/responseCompleteNotification.test.ts
```

如果本机 `pnpm` 可用，再运行：

```bash
pnpm run check:i18n
pnpm compile
pnpm test:run src/services/responseCompleteNotificationDetector.test.ts src/entrypoints/background/responseCompleteNotification.test.ts
```

### 11.3 构建与 Manifest 验证

```bash
pnpm build
pnpm build:firefox
```

检查 Chrome：

```bash
node -e "const m=require('./.output/chrome-mv3/manifest.json'); console.log(m.permissions, m.optional_permissions, m.background)"
```

期望：

- `permissions` 不含 `notifications`。
- `optional_permissions` 含 `notifications`。
- 存在 Chrome MV3 background service worker。
- 不含 Firefox-only `webRequest` 权限。

检查 Firefox：

```bash
node -e "const m=require('./.output/firefox-mv2/manifest.json'); console.log(m.permissions, m.optional_permissions, m.background)"
```

期望：

- `optional_permissions` 含 `notifications`。
- `permissions` 不含 `notifications`。
- 保留 Firefox MV2 persistent background。
- Firefox-only webRequest 权限仍存在。

### 11.4 手工验证

Chrome：

1. 加载 `.output/chrome-mv3`。
2. 新安装后确认不会自动弹通知权限请求。
3. 打开 Popup，开启通知开关。
4. 授权后发送测试通知。
5. 在 Gemini 发起长回复，切到其他窗口，回复完成后收到通知。
6. 通知 title 显示当前 chat 标题。
7. 通知 message 显示最新已完成回复前 200 个字符摘要。
8. 点击通知回到原 Gemini tab。
9. 当前 Gemini tab 可见且 focused 时不发送通知。
10. 关闭开关后再次生成回复，不发送通知。

Firefox：

1. 加载 `.output/firefox-mv2`。
2. 重复 Chrome 验证流程。
3. 确认既有 My Stuff / webRequest 功能没有回归。

权限撤销：

1. 开启功能并授权。
2. 在浏览器扩展管理页撤销通知权限。
3. Popup 再次打开时显示 `missing-extension-permission`。
4. 回复完成时不创建通知。
5. 用户再次主动开启或授权后恢复。

## 12. 实施顺序

1. Manifest：添加 `optional_permissions: ['notifications']`。
2. Runtime message：补齐 message 常量、类型和 type guard。
3. Settings service：新增 storage item 与 readiness helper。
4. Background：新增 shared notification module，并解开 Chrome background include 限制。
5. Content detector：实现仅开关开启时运行的 chat history、active turn 局部监听和可扩展回答类型规则。
6. Content boot：接入 detector start/stop。
7. Popup：新增开关、授权流程、readiness 状态、测试通知入口。
8. i18n：补齐全部 locale key。
9. docs/platforms.md：更新 background 与 notifications 差异。
10. Tests：补 detector、文本与图片类型规则、类型切换和 background 单测。
11. Validation：运行 i18n、typecheck、targeted tests、Chrome/Firefox build 与 manifest 检查。

## 13. 风险与处理

### 13.1 Gemini DOM 变化

风险：chat history、最终 conversation container、回答内容容器或类型语义节点的 DOM 结构变化。

处理：

- detector 只监听 chat history 直接子节点和当前 active turn subtree。
- 新 turn 选择器只使用 `div.conversation-container[id]`，不识别 provisional 或无 ID 节点。
- 回答类型识别范围使用 `structured-content-container [id*="model-response-message-content"]`，active turn 只监听 `childList + characterData`。
- 图片规则只依赖 `generated-image` 与 `single-image` 语义节点，不依赖动态 ID、完整 DOM 路径或布局层级。
- 图片通知预览进一步依赖最终图片路径 `generated-image > single-image > div > div > button.image-button > img`；该路径失效时只回退 basic，不影响完成通知。
- 不增加 `message-actions`、send button 等易受 Gemini DOM 更新影响的兜底判断；选择器失效时优先漏通知而不是误通知。
- 接受文本生成过程中内容暂停超过 5 秒可能提前通知；图片类型需验证 `single-image` 是否代表整轮生成终态。
- 当前仅为文本与图片定义规则，音乐、视频和其他特殊组件在补充稳定规则前不会通知。
- Chrome 图片通知的 `imageUrl` 已被标记 deprecated；macOS 改用 basic `iconUrl` 小图预览，非 macOS 仍尽力使用 `imageUrl`；Firefox 固定 basic。
- 单测覆盖子节点变化、文本变化、图片类型识别与完成、文本转图片、多候选、空内容、active turn 替换、前台抑制和 chat change。

### 13.2 Background 拆分影响 Firefox

风险：Chrome background 解锁时误把 Firefox webRequest 逻辑带入 Chrome。

处理：

- notification background shared。
- webRequest background 继续 `if (import.meta.env.FIREFOX)`。
- Chrome build manifest 检查不应出现 `webRequest` 权限。

### 13.3 通知权限状态与用户意图混淆

风险：用户开启后外部撤销 permission，UI 仍显示正常。

处理：

- storage 只表达用户意图。
- Popup 每次打开与发送通知前都重新读取 readiness。
- readiness blocked/missing 时不创建通知。

### 13.4 通知最终不可见

风险：浏览器或系统通知设置、勿扰模式、企业策略阻止通知。

处理：

- 提供 test notification。
- 提供排查文档入口。
- `allowed-but-system-unknown` 文案明确最终展示取决于系统设置。

## 14. 官方参考

- [Chrome notifications API](https://developer.chrome.com/docs/extensions/reference/api/notifications)
- [Chrome tabs API](https://developer.chrome.com/docs/extensions/reference/tabs)
- [Chrome permissions API](https://developer.chrome.com/docs/extensions/reference/api/permissions)
- [MDN Notifications](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/user_interface/Notifications)
- [MDN NotificationOptions](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/notifications/NotificationOptions)
- [MDN tabs API](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/tabs)
