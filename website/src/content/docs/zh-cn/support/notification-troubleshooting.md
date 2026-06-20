---
title: 通知问题排查
description: Gemini Power Kit 通知没有出现时，检查浏览器与操作系统设置。
---

Gemini Power Kit 可以确认扩展是否拥有通知权限，但通知创建后，浏览器或操作系统仍可能将其隐藏。

请先在 **Gemini Power Kit** -> **Notifications** 中发送测试通知。如果测试通知没有出现，再按以下步骤检查。

## 先检查扩展设置

1. 打开 Gemini Power Kit 侧边栏。
2. 进入 **Notifications**。
3. 确认 **Gemini 回复完成时通知我** 已开启。
4. 点击 **发送测试通知**。
5. 如果扩展请求权限，请允许权限后再次测试。

如果测试通知可以正常显示，说明通知功能已工作。请注意：当 Gemini 页面可见且获得焦点时，回复完成通知会被抑制。

## Chrome

1. 打开 Chrome 设置。
2. 搜索 `通知` 或 `Notifications`。
3. 确认 Chrome 可以显示通知。
4. 确认扩展通知没有被阻止。
5. 再次发送测试通知。

官方指南：

- [Chrome 通知设置](https://support.google.com/chrome/answer/3220216?hl=zh-Hans)

## Firefox

1. 打开 Firefox 设置。
2. 搜索 `通知` 或 `Notifications`。
3. 确认通知和通知权限请求没有被阻止。
4. 再次发送测试通知。

官方指南：

- [Firefox 通知设置](https://support.mozilla.org/zh-CN/kb/firefox-push-notifications)

## macOS

1. 打开 **系统设置** -> **通知**。
2. 选择 Google Chrome 或 Firefox。
3. 开启 **允许通知**。
4. 确认提醒样式和通知中心选项符合你的需求。
5. 检查 **专注模式**，确认当前模式没有隐藏浏览器通知。
6. 再次发送测试通知。

官方指南：

- [Apple：更改 Mac 上的通知设置](https://support.apple.com/zh-cn/guide/mac-help/mh40583/mac)
- [Apple：在 Mac 上设置专注模式](https://support.apple.com/zh-cn/guide/mac-help/mchl613dc43f/mac)

## Windows

1. 打开 **设置** -> **系统** -> **通知**。
2. 开启通知。
3. 在应用列表中找到 Google Chrome 或 Firefox。
4. 确认已允许该浏览器发送通知。
5. 检查 **请勿打扰** 和 **专注** 设置。
6. 再次发送测试通知。

官方指南：

- [Microsoft：Windows 中的通知和请勿打扰](https://support.microsoft.com/zh-cn/windows/windows-%E4%B8%AD%E7%9A%84%E9%80%9A%E7%9F%A5%E5%92%8C%E8%AF%B7%E5%8B%BF%E6%89%93%E6%89%B0-feeca47f-0baf-5680-16f0-8801db1a8466)

## 没有播放提示音

- 独立的 **通知时播放声音** 选项适用于 Chromium 浏览器。
- 确认通知主开关和声音开关均已开启。
- 检查浏览器和系统的音频输出与音量设置。
- Firefox 使用浏览器和操作系统的默认通知行为，不使用独立的内置提示音。

## 重要限制

即使所有扩展级检查均正常，浏览器、操作系统、专注模式或设备管理策略仍可能隐藏通知。成功显示测试通知，是确认当前设备可以正常接收通知的最可靠方式。

## 相关指南

- [回复完成通知](/zh-cn/features/notifications/)
- [常见问题](/zh-cn/support/faq/)
