---
title: 隐私政策
description: Gemini Power Kit 隐私政策
---

**最后更新：** 2026年7月4日

感谢您使用 Gemini Power Kit（以下简称“本插件”）。本隐私政策说明本插件会在本地处理哪些信息、会在您的浏览器中保存哪些数据，以及我们不会收集或共享哪些数据。

## 1. 开发者不收集数据

Gemini Power Kit 设计为在您的浏览器中本地运行，并且只作用于 `gemini.google.com`。

我们不为本插件运营后端服务。我们不会收集、接收、出售、共享或将您的 Gemini 对话、提示词、响应、上传文件、设置、浏览历史或账号信息用于广告或分析。

Gemini 本身由 Google 提供。您正常使用 Gemini 产生的网络通信仍然发生在您的浏览器与 Google 服务之间，并受 Google 自身条款和政策约束。Gemini Power Kit 不会把这些数据发送到开发者控制的服务器。

## 2. 本地处理的数据

为了提供功能，本插件可能会在本地读取或处理以下信息：

- Gemini 页面内容，例如对话标题、选中的文本、可见提示词、可见响应、生成媒体状态和 Deep Research 完成状态。
- Gemini Library 媒体元数据，例如对话 ID、响应 ID、标题、时间戳、资源 ID 和缩略图，用于“在新标签页打开”辅助功能。
- 通知内容，例如本地生成的简短标题/消息、页面前后台状态、响应类型、可选的本地图片预览和通知点击状态。
- 用户创建的提示词数据，包括 Quick Follow-up 提示词、Chain Prompt 工作流、变量和步骤文本。
- 用户偏好设置，包括功能开关、主题设置、通知设置、音频设置、版本说明状态、功能提示状态和入口徽标状态。
- 用户提供的文件，例如自定义主题背景图片和自定义通知音频文件。

这些信息只在您的浏览器中处理。本插件不会将其传输到开发者控制的服务器。

## 3. 本地存储

Gemini Power Kit 使用浏览器管理的存储来保留您的选择：

- `browser.storage.sync` 用于保存小型设置，例如功能开关、所选主题和通知偏好。根据您的浏览器设置，这些数据可能会通过您登录的浏览器账号进行同步。插件开发者不会接收这些数据。
- `browser.storage.local` 用于保存本地 UI 状态，例如功能提示、版本说明状态、入口徽标状态和主题背景设置。
- IndexedDB 用于在本地保存 Quick Follow-up 提示词、Chain Prompt 工作流、上传的主题背景图片和上传的通知音频文件。
- `browser.storage.session` 用于临时运行状态，例如响应完成通知的授权意图和 Deep Research 通知跟踪。
- 内存缓存用于临时保存 Gemini Library 元数据，并会在页面/模块停止或刷新时清除。
- Gemini 主题桥接代码可能会读取或更新 Gemini 页面 `localStorage` 中的主题键，以保持页面主题与插件主题同步。

您可以通过插件界面中提供的删除功能、清除浏览器的扩展/站点数据，或卸载本插件来移除已保存的数据。

## 4. 权限说明

本插件仅将权限用于提供 Gemini 生产力功能。

### 共享的 Gemini 访问权限

本插件只在 `gemini.google.com` 上运行。该访问权限用于加载内容脚本，并提供 Chat Outline、Quick Follow-up、Chain Prompt 控件、视觉主题、智能标签页标题、Library 辅助功能和通知内容提取等功能。

本插件不会在无关网站上运行，也不会收集 `gemini.google.com` 之外的浏览历史。

### Storage

`storage` 权限用于保存上文所述的设置和浏览器本地数据。它不会被用于收集、出售或共享个人信息。

### Chrome 权限

在 Chrome 中，响应完成通知是可选功能。只有在您明确启用该功能后，本插件才会请求相关权限：

- `notifications`：用于显示响应完成通知和测试通知、清除通知，并在可行时返回原始 Gemini 标签页。
- `webRequest`：用于观察 Gemini 请求生命周期，以判断标准响应、生成媒体和 Deep Research 是否完成。对于该通知功能，它只分类请求 URL 和完成事件；不会检查请求体或响应体。
- `*://gemini.google.com/*` 可选主机访问权限：Chrome 要求具备该主机访问权限后，`webRequest` 才能观察 Gemini 请求，因此会与通知功能一起请求。
- `offscreen`：仅在您启用通知声音时请求。它用于创建 Chrome Offscreen Document，以播放插件内置通知音或您本地上传的音频文件。

### Firefox 权限

在 Firefox 中，`notifications`、`webRequest`、`webRequestBlocking` 和 `*://gemini.google.com/*` 是必需权限。Firefox 无法在页面内设置流程中稳定保留后续请求权限所需的用户手势，因此 Firefox 版本会在安装时声明这些权限。

Firefox 使用 WebRequest API 提供响应完成通知，并解析 Gemini Library 媒体数据。Library 响应解析只在浏览器本地完成，并且仅用于“在新标签页打开”辅助功能。Firefox 不提供自定义通知音频设置。

## 5. 我们不会做的事

Gemini Power Kit 不会：

- 出售用户数据。
- 将用户数据用于广告或分析。
- 将用户数据转让给数据经纪商或广告平台。
- 收集 Google 账号信息。
- 收集认证凭据。
- 收集财务、支付、健康或位置信息。
- 收集 `gemini.google.com` 之外的网页浏览历史。
- 执行远程托管的 JavaScript。

如果您在 Gemini 中输入敏感信息，这些信息可能会出现在 Gemini 页面内。为了提供您启用的功能，本插件可能会在本地读取可见的 Gemini 页面内容，但不会单独收集、传输或共享这些内容。

## 6. 政策修订

如果本插件的功能、权限或存储行为发生变化，我们可能会更新本隐私政策。任何更新都会发布在此页面。

## 7. 联系我们

如果您对本隐私政策有任何疑问，请在我们的 [GitHub 仓库](https://github.com/RonkTsang/gemini-chat-extension) 中提交 Issue。
