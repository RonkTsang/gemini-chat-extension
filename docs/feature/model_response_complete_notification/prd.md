# Model Response Complete Notification

| **Document Version** | **V1.0** |
| :--- | :--- |
| **Feature Name** | Model Response Complete Notification |
| **Created Date** | May 30, 2026 |
| **Status** | Draft |

技术实现方案：[`tech_plan.md`](./tech_plan.md)

## 1. 背景

用户在 Gemini 中提交较长问题、生成长文档、代码或调研结果时，经常会切换到其他窗口继续工作。由于 Gemini 回复完成没有明确的跨窗口提醒，用户需要反复切回 Gemini 页面确认状态，造成注意力打断。

这是一个已经线上运行的浏览器扩展，因此新增能力必须严格控制权限影响。系统通知需要 `notifications` 扩展权限，但该权限不应作为安装时必需权限出现，避免引发用户疑虑或商店审核风险。

## 2. 目标

为用户提供一个可主动开启的“模型回复完成通知”能力：

- 当 Gemini 模型回复完成时，主动发送系统通知。
- 功能默认关闭，不改变现有用户体验。
- 仅在用户主动打开开关时申请通知权限。
- 权限申请必须使用 Optional Permission，避免把 `notifications` 加入安装时必需权限。
- 用户拒绝授权后，功能保持关闭，并允许以后再次主动开启。

## 3. 非目标

- 不在安装、升级或首次打开扩展时主动申请通知权限。
- 不展示完整模型回复正文到系统通知中；通知只展示最新已完成模型回复的前 200 个字符摘要。
- 不在每次 Gemini 页面加载时检查并弹出权限请求。
- 不实现通知频率、自定义通知文案等高级设置，第一版只实现最小可用能力。
- 不实现自定义通知音效。通知声音交给浏览器和操作系统通知中心处理，不使用 Web Audio 或页面音频播放绕过系统通知设置。

## 4. 权限策略

### 4.1 Manifest 声明

在 WXT 生成的 manifest 中新增：

```json
{
  "optional_permissions": ["notifications"]
}
```

不得把 `notifications` 放进 `permissions` 必需权限数组。

参考文档：

- [Chrome permissions API](https://developer.chrome.com/docs/extensions/reference/permissions)
- [Chrome declare permissions](https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions)
- [MDN optional_permissions](https://developer.mozilla.org/en-US/Add-ons/WebExtensions/manifest.json/optional_permissions)

### 4.2 申请时机

只允许在用户主动打开“回复完成通知”开关时调用：

```ts
browser.permissions.request({ permissions: ['notifications'] })
```

推荐流程：

1. 用户点击开启开关。
2. 调用 `browser.permissions.contains({ permissions: ['notifications'] })` 检查权限。
3. 如果已有权限，直接保存开关为开启。
4. 如果没有权限，在当前用户手势内调用 `browser.permissions.request(...)`。
5. 授权成功后保存开关为开启。
6. 授权失败或用户取消时，开关保持关闭，并展示简短错误提示。

### 4.3 前置权限检查

开启开关后，扩展应尽量检查通知是否可用，但要明确系统级通知状态无法完全可靠读取。

建议状态模型：

```ts
type NotificationReadiness =
  | 'off'
  | 'missing-extension-permission'
  | 'blocked-by-browser'
  | 'allowed'
  | 'allowed-but-system-unknown'
```

状态含义：

- `off`：用户未开启“回复完成通知”。
- `missing-extension-permission`：未获得扩展 `notifications` optional permission。
- `blocked-by-browser`：浏览器层面禁止当前扩展显示通知。Chrome 可通过 `chrome.notifications.getPermissionLevel()` 判断。
- `allowed`：扩展权限与浏览器可检测状态均允许。
- `allowed-but-system-unknown`：扩展侧看起来可用，但操作系统通知、勿扰模式、企业策略等状态无法可靠确认。Firefox 或不支持 `getPermissionLevel()` 的环境应归入此类。

检查流程：

1. 先检查 `browser.permissions.contains({ permissions: ['notifications'] })`。
2. 如果没有扩展权限，返回 `missing-extension-permission`。
3. 如果运行环境支持 `browser.notifications.getPermissionLevel()`，继续读取浏览器通知权限。
4. 如果返回 `denied`，返回 `blocked-by-browser`。
5. 如果浏览器检查通过，返回 `allowed`。
6. 如果运行环境不支持浏览器级检查，返回 `allowed-but-system-unknown`。

注意：

- 不使用 Web `Notification.permission` 判断该功能状态。它检查的是网页 origin 权限，例如 `gemini.google.com`，不是扩展通知权限。
- 操作系统级通知开关、勿扰模式、Focus Assist、浏览器 app 通知设置等不能被扩展可靠读取。需要通过文档和测试通知引导用户排查。
- `enableResponseCompleteNotification` 只表示用户是否希望开启该能力。`getPermissionLevel()` 或其他 readiness 检查只用于最终状态提醒和发送前保护，不应把“用户意图”和“当前可用性”混为一个状态。
- 如果用户开启后又在浏览器扩展管理页撤销 `notifications` optional permission，存储项可以保持开启；Popup 和发送前检查应显示 `missing-extension-permission`，并禁止实际发送通知，直到用户再次主动授权。

### 4.4 关闭开关

第一版关闭开关时只保存功能状态为关闭，不主动调用 `permissions.remove()`。

原因：

- 用户关闭功能不一定等同于撤销浏览器权限。
- 保留权限可以避免下次开启时重复弹系统授权。
- 如需更强隐私控制，可在后续版本增加“撤销通知权限”的显式操作。

## 5. 用户体验

### 5.1 开关入口

第一版建议在 Popup 首页增加开关：

- Label: `Notify when Gemini finishes replying`
- 中文：`Gemini 回复完成时通知我`
- Description: `Show the chat title and a short response preview when Gemini finishes replying.`
- 中文：`Gemini 回复完成后，发送包含 chat 标题和回复摘要的系统通知。`

设置面板可以在第二阶段增加“通知”或“通用”设置区，并复用同一存储项与授权逻辑。

### 5.2 测试通知与排查入口

当功能开启后，Popup 中应提供轻量的“发送测试通知”入口，用于帮助用户确认系统层面是否真的能展示通知。

推荐交互：

- 功能关闭时隐藏或禁用测试通知入口。
- 功能开启后允许发送测试通知。
- 如果前置检查返回 `blocked-by-browser`，提示用户检查浏览器通知设置。
- 如果前置检查返回 `allowed-but-system-unknown`，提示用户通知显示仍取决于系统设置，并提供排查文档入口。

排查文档：

- [`notification-permission-troubleshooting.md`](./notification-permission-troubleshooting.md)

用户可见链接文案示例：

- `Notifications not showing? Check notification settings`
- `没有收到通知？查看通知权限排查指南`

### 5.3 权限说明

当用户打开开关但尚未授权时，浏览器会弹出权限确认。扩展内部文案需要清楚说明用途：

- 仅用于 Gemini 回复完成提醒。
- 通知会显示当前 chat 标题，以及最新已完成模型回复的前 200 个字符摘要。
- 用户可以随时关闭该功能。
- 通知能否最终展示还取决于浏览器和操作系统通知设置。

### 5.4 拒绝授权

如果用户拒绝：

- 开关保持关闭。
- 展示 Toast 或 Popup 内联提示：`Notification permission was not granted.`
- 不自动重试，不循环弹窗。

### 5.5 通知内容

系统通知内容应直接帮助用户判断是否需要切回 Gemini，同时控制展示长度：

- Title：当前 chat 标题。
- Message：最新已完成模型回复内容摘要，截取前 200 个字符。

创建通知时使用 `browser.notifications.create(notificationId, options)`。文本回复和图片回退通知使用 basic 模板：

```ts
const options = {
  type: 'basic',
  iconUrl: browser.runtime.getURL('/icon/512.png'),
  title: payload.title,
  message: payload.message,
}
```

图片回复在 Chrome 非 macOS 中可以尽力使用 image 模板：

```ts
const options = {
  type: 'image',
  iconUrl: browser.runtime.getURL('/icon/512.png'),
  imageUrl: payload.imageDataUrl,
  title: payload.title,
  message: payload.message,
}
```

Chrome macOS 中优先使用 basic 模板，并把本地生成的图片缩略图作为通知 icon：

```ts
const options = {
  type: 'basic',
  iconUrl: payload.imageDataUrl,
  title: payload.title,
  message: payload.message,
}
```

参数说明：

- `notificationId`：由后台生成，建议格式为 `response-complete:${tabId}:${timestamp}`，用于点击回跳和去重映射。
- `type`：文本回复固定为 `basic`；Chrome 非 macOS 图片回复在图片数据可用时使用 `image`，否则回退 `basic`；Chrome macOS 图片回复使用 `basic`。Firefox 固定使用 `basic`。
- `iconUrl`：默认使用扩展内已打包图标；Chrome macOS 图片回复在图片数据可用时使用内容脚本生成的 JPEG Data URL 作为缩略图 icon。不使用远程图片。
- `imageUrl`：仅用于 Chrome 非 macOS 图片通知，使用内容脚本从 Gemini 图片 Blob 本地生成的受限尺寸 JPEG Data URL，不使用原始 Gemini `blob:` URL。
- `title`：由内容脚本传入的当前 chat 标题；如果无法获取，则回退为 `Gemini finished replying`。
- `message`：由内容脚本传入的最新已完成模型回复摘要；最多 200 个字符。如果文本回复无法获取，则回退为 `Your response is ready.`；图片回复无法获取文字摘要时回退为 `Your image is ready.`。
- `priority`：第一版不设置，使用浏览器默认值。
- `silent`：第一版不设置，声音行为交给浏览器和操作系统通知设置控制。
- `requireInteraction`：第一版不设置，避免通知长期停留造成打扰。

内容提取规则：

- title 优先读取 Gemini 当前 chat 标题 DOM，例如 `top-bar-actions .conversation-title-container`。
- title 兜底使用 `document.title`，再兜底为 `Gemini finished replying`。
- message 在最新 active turn 完成后，优先从该 turn 中最后一个已完成且包含非空文字的 `model-response` 提取回复正文；图片无可用文字摘要时使用 `Your image is ready.` 兜底文案，其他回复无摘要时使用 `Your response is ready.`。
- 图片回复完成后，Chrome 最多等待 5 秒查找 `generated-image > single-image > div > div > button.image-button > img`，读取第一张图片并在本地缩放压缩为最长边 512px、最多约 500KB 的 JPEG Data URL。失败或超时时回退 basic 通知。
- message 需要先归一化空白字符，再截取前 200 个字符。
- message 不包含用户提示词、历史回复、隐藏 UI 文案或 thinking 内容。
- 后台在创建通知前再次对 `title` 和 `message` 做长度保护，避免异常 payload。

点击通知后，浏览器应聚焦对应 Gemini tab。

## 6. 触发规则

### 6.1 回复完成判断

内容脚本仅将监听启动后新增的、当前最新的 `div.conversation-container[id]` 视为 active turn。无 ID 节点和 `pending-request.conversation-container` 不参与识别。`turnId` 是单轮消息 ID，不视为 chat conversation ID。

回复完成采用“回答类型规则 + 类型完成策略”：

- active turn 内必须先出现 `structured-content-container [id*="model-response-message-content"]`，再在该回答内容容器范围内识别回答类型。
- 图片、音乐、视频等具有明确特征节点的类型优先匹配；非空文字作为最后的文本类型兜底。
- 每种回答类型独立定义识别条件与完成策略，但所有类型共用同一个 active turn observer，不为不同类型创建独立 observer 或新的 turn 状态机。
- 文本回答使用 `inactivity` 策略：任意文本回答内容发生子节点或文本变化时，共享的 5 秒静默计时器重新开始，整体连续静默 5 秒后完成。
- 图片回答使用 `immediate` 策略：在回答内容容器内出现 `generated-image` 时识别为图片类型，出现 `generated-image single-image` 时认为图片回答完成。
- 图片回答完成后可继续等待最终 `img` 用于通知预览；该等待不改变“回复已完成”的判断，只影响通知是否带图片。
- 图片类型一旦被识别，必须清除可能已经启动的文本静默计时器，不再使用文本静默规则完成该回答。
- 双模型或多候选回复仍由同一个 active turn 统一管理；具体完成规则需要按回答类型明确，避免为每个候选维护独立完成状态。
- 不使用 `message-actions`、send button 状态或 provisional turn 作为完成信号或兜底。

回答类型扩展原则：

- 类型规则至少包含 `type`、类型识别条件、类型完成条件和完成策略。
- 明确类型规则优先于文本兜底，避免图片生成过程中的提示文字被误判为已完成文本回答。
- 新增音乐、视频等类型时，只新增对应规则，不修改新 turn 识别和 active turn 监听主流程。
- 类型选择器应限定在当前 `model-response-message-content` 内，并优先使用稳定的语义节点；避免依赖动态 ID、`p > div` 等布局层级或完整 DOM 路径。

监听实现要求：

- 监听逻辑仅在 `enableResponseCompleteNotification === true` 时启动；开关关闭或内容脚本失效时必须停止监听并清理 observer。
- 不扫描全部历史 turn，不监听 `document.body`。
- 初始化时已有 turn 自然作为基线，不进行补追踪或通知。
- chat history observer 仅监听 `[data-test-id="chat-history-container"]` 的直接子节点新增。
- 仅发现新增的最新 `div.conversation-container[id]` 后启动 active turn；新 turn 出现时替换旧 active turn。
- 回答类型识别范围固定为 `structured-content-container [id*="model-response-message-content"]`；类型规则只在该范围内查询。
- 完成、替换、关闭或普通 chat change 后立即清理 active turn observer 与静默计时器。
- SPA 导航或 chat change 后重新绑定 chat history 并记录新基线，不触发历史通知；空白新 chat 首次发送后 URL 落盘时保留已发现的 active turn。

### 6.2 打扰控制

第一版推荐只在以下任一条件满足时发送系统通知：

- `document.visibilityState !== 'visible'`
- `document.hasFocus() === false`

如果用户正在当前 Gemini 页面查看回复，则不发送系统通知，避免重复打扰。

### 6.3 去重

同一轮回复完成或前台抑制后立即清理 active turn observer 与静默计时器，因此同一 active turn 最多处理一次。新 turn 出现时只追踪最新一轮。

## 7. 存储

新增同步设置项：

```ts
sync:enableResponseCompleteNotification
```

默认值：

```ts
false
```

该设置只代表用户是否开启功能，不代表浏览器权限一定存在。运行时仍需在发送通知前确认或容错处理权限状态。

## 8. 技术方案概览

### 8.1 内容脚本

职责：

- 读取 `enableResponseCompleteNotification`。
- 监听设置变化。
- 仅在设置开启时监听 Gemini 回复状态变化。
- 设置关闭时停止回复状态监听。
- 在满足触发规则时发送 runtime message 给后台脚本。

内容脚本不直接创建系统通知，避免页面侧逻辑和通知 API 耦合。

### 8.2 后台脚本

职责：

- 解开现有 background 入口只服务 Firefox 的限制，新增 Chrome MV3 与 Firefox 均可运行的通知后台逻辑。
- Firefox 既有 webRequest 逻辑继续保持 Firefox-only；通知逻辑应拆成 shared background module，避免把 Firefox webRequest 权限或实现带入 Chrome。
- 接收“模型回复完成”消息。
- 检查 `notifications` 权限。
- 尽量检查浏览器通知权限，例如 Chrome `notifications.getPermissionLevel()`。
- 调用 `browser.notifications.create()` 创建系统通知。
- 记录 notification id 与 tab id 的关系。
- 用户点击通知时聚焦对应 tab。
- 提供测试通知消息处理能力，供 Popup 触发。
- 使用 `sender.tab?.id` 作为真实 tab id，不信任内容脚本传入的 tab id。
- 可以使用内容脚本传入的 `title` 和 `message` 作为通知文案，但必须做长度保护和空值兜底。
- 在通知点击或关闭后清理 notification id 与 tab id 的映射。

### 8.3 Popup

职责：

- 展示功能开关。
- 在用户主动开启时执行权限申请。
- 授权后执行前置权限检查。
- 授权成功后保存设置。
- 授权失败时恢复关闭状态并提示。
- 展示测试通知入口。
- 展示通知权限排查文档入口。

### 8.4 Runtime Message

新增 runtime message 类型：

```ts
type ResponseCompleteNotificationMessage =
  | {
      type: 'response-complete-notification:create'
      payload: {
        title: string
        message: string
        timestamp: number
      }
    }
  | {
      type: 'response-complete-notification:test'
      payload: {
        timestamp: number
      }
    }
  | {
      type: 'response-complete-notification:get-readiness'
    }
```

约束：

- `create` 只由 Gemini content script 发送；后台使用 `sender.tab` 决定通知点击目标。
- `create.payload.title` 为当前 chat 标题，`create.payload.message` 为最新已完成模型回复前 200 个字符摘要。
- `test` 由 Popup 发送；后台创建同样不含对话内容的测试通知。
- `get-readiness` 由 Popup 调用，用于显示当前权限与浏览器通知状态。
- 后台对未知 message 或缺失权限必须安全忽略或返回错误状态，不影响其他 background 功能。

## 9. 兼容性

- Chrome MV3：使用 `optional_permissions` + `browser.permissions.request` + `browser.notifications`，并新增可运行的 Chrome background 通知路径。
- Firefox：同样支持 Optional Permission 与 `browser.notifications`，既有 Firefox background webRequest 逻辑保持隔离。
- 不新增 host permission。
- 不改变现有 `storage` 权限和 Gemini 页面注入范围。
- 实现后需要更新 `docs/platforms.md`，记录 Chrome 与 Firefox 的通知 background 差异和验证结论。

## 10. 验收标准

1. 新安装或升级后，扩展不会自动请求通知权限。
2. Manifest 中 `notifications` 只出现在 `optional_permissions`，不出现在必需 `permissions`。
3. 用户主动打开开关时才触发浏览器权限请求。
4. 用户授权后，扩展执行前置权限检查。
5. Chrome 下如果 `notifications.getPermissionLevel()` 返回 `denied`，`enableResponseCompleteNotification` 可以表示用户意图为开启，但 UI 必须提示当前被浏览器通知设置阻止，发送前检查不得创建通知。
6. 不支持浏览器级检查的环境，应提示通知显示仍取决于系统设置，并提供排查文档入口。
7. 用户授权且检查通过后，开关保持开启，并在 Chrome 与 Firefox 中，Gemini 回复完成且页面不在前台时收到系统通知。
8. 用户拒绝授权后，开关保持关闭，不重复弹窗。
9. 用户关闭开关后，不再发送回复完成通知。
10. 通知不包含用户提示词；通知 message 只包含最新已完成模型回复的前 200 个字符摘要。
11. 点击通知可以回到对应 Gemini tab。
12. 同一次模型回复最多只发送一条通知。
13. 功能开启后，用户可以发送测试通知。
14. 文档提供 macOS、Windows、Chrome、Firefox 的通知设置排查指引。
15. 关闭开关时，内容脚本不会继续运行回复完成监听 observer。
16. 开启开关后，detector 只监听 chat history 直接子节点与当前 active turn；新增最新 `div.conversation-container[id]` 中的文本回答连续静默 5 秒后识别为完成，图片回答出现 `generated-image single-image` 后识别为完成。
17. Chrome 生产构建 manifest 包含可运行的 background/service worker 通知入口；Firefox 生产构建保留 background 通知入口，且两者的 `notifications` 都只出现在 `optional_permissions`。

## 11. 风险与注意事项

- 权限变更风险：该功能必须保持 Optional Permission，不得引入安装时权限提示。
- 审核风险：商店说明和权限用途需要一致，避免让通知权限看起来与核心功能无关。
- 隐私风险：通知不得包含用户提示词、选中文本或历史对话；模型回复只展示最新已完成回复的前 200 个字符摘要。
- 内容展示风险：通知会展示最新模型回复摘要，用户切到其他窗口时可能被系统通知中心展示给旁人看到。需要在开关说明中明确这一点，并保持默认关闭。
- DOM 变更风险：Gemini 的 chat history、最终 conversation container、回答内容容器或各回答类型的语义节点变化后可能无法识别回复；方案优先选择漏通知而不是增加多个易受 DOM 更新影响的兜底判断。
- 提前完成风险：Gemini 生成过程中如果文字内容暂停更新超过 5 秒，可能被提前判断为完成。
- 图片完成风险：如果 `single-image` 表示单张图片就绪而不是整轮图片生成完成，多图回复可能在第一张图片出现时提前通知；需要通过真实 DOM 验证确认其终态语义。
- 类型切换风险：图片生成标志如果在提示文字静默超过 5 秒后才出现，文本兜底仍可能提前完成；应优先寻找更早且稳定的图片类型标志。
- 内容类型限制：当前规划支持文本与图片回答；音乐、视频和其他特殊组件需要补充稳定的类型识别与完成规则后才能触发通知。
- 通知可靠性：操作系统或浏览器可能关闭通知，扩展需要优雅失败，不影响 Gemini 页面功能。
- 图片通知展示风险：Chrome 的 `imageUrl` 已标记 deprecated，macOS 改用 basic `iconUrl` 作为小尺寸缩略图，非 macOS 仍尽力使用 `imageUrl`；Firefox 固定回退 basic。
- 图片数据风险：图片缩略图会在本地通过 Runtime Message 传给 background 创建通知，不持久化、不上传、不写日志，但系统通知中心可能展示图片给旁人看到。
- 系统状态不可见：扩展无法可靠判断 macOS、Windows、勿扰模式、Focus Assist、企业策略等最终通知展示状态。
- 音效风险：不使用自定义音频。即使系统通知可设为 `silent`，扩展也不通过 Web Audio 额外播放声音，避免绕开用户系统通知偏好。

## 12. 后续增强

- 设置面板新增“通知”分类。
- 支持用户选择“仅后台时通知”或“总是通知”。
- 支持撤销通知权限的显式操作。
- 支持通知冷却时间，避免连续多 tab 生成时过多通知。
- 支持页面内轻量提示，但需要另行评估打扰成本。
