---
title: Notification Troubleshooting
description: Check browser and operating-system settings when Gemini Power Kit notifications do not appear.
---

Gemini Power Kit can confirm whether the extension has notification permission, but browsers and operating systems may still suppress an alert after it is created.

Start with the test notification in **Gemini Power Kit** -> **Notifications**. If it does not appear, follow the checks below.

## Check the Extension First

1. Open the Gemini Power Kit sidebar.
2. Go to **Notifications**.
3. Confirm **Notify when Gemini finishes replying** is enabled.
4. Click **Send test notification**.
5. If the extension asks for permission, approve the request and test again.

If the test notification appears, the notification feature is working. Remember that reply-complete notifications are suppressed while the Gemini page is visible and focused.

## Chrome

1. Open Chrome Settings.
2. Search for `Notifications`.
3. Confirm Chrome is allowed to show notifications.
4. Confirm extension notifications are not blocked.
5. Send another test notification.

Official guide:

- [Chrome notification settings](https://support.google.com/chrome/answer/3220216)

## Firefox

1. Open Firefox Settings.
2. Search for `Notifications`.
3. Confirm notifications and notification prompts are not blocked.
4. Send another test notification.

Official guide:

- [Firefox notification settings](https://support.mozilla.org/en-US/kb/push-notifications-firefox)

## macOS

1. Open **System Settings** -> **Notifications**.
2. Select Google Chrome or Firefox.
3. Turn on **Allow notifications**.
4. Confirm the alert style and Notification Center options match your preference.
5. Check **Focus** settings and make sure the active Focus mode is not hiding browser notifications.
6. Send another test notification.

Official guides:

- [Apple: Change Notifications settings on Mac](https://support.apple.com/guide/mac-help/change-notifications-settings-mh40583/mac)
- [Apple: Set up a Focus on Mac](https://support.apple.com/guide/mac-help/set-up-a-focus-to-stay-on-task-mchl613dc43f/mac)

## Windows

1. Open **Settings** -> **System** -> **Notifications**.
2. Turn on notifications.
3. Find Google Chrome or Firefox in the app list.
4. Confirm notifications are enabled for that browser.
5. Check **Do Not Disturb** and **Focus** settings.
6. Send another test notification.

Official guide:

- [Microsoft: Notifications and Do Not Disturb in Windows](https://support.microsoft.com/windows/notifications-and-do-not-disturb-in-windows-feeca47f-0baf-5680-16f0-8801db1a8466)

## Sound Does Not Play

- The separate **Play a sound with notifications** option is available on Chromium browsers.
- Confirm the main notification switch and the sound switch are both enabled.
- Check browser and system audio output and volume settings.
- Firefox uses the browser and operating system's default notification behavior instead of the separate bundled sound.

## Important Limitations

Even when all extension-level checks pass, the browser, operating system, Focus mode, or device-management policy may still hide notifications. A successful test notification is the most reliable way to confirm delivery on your device.

## Related Guides

- [Notifications](/features/notifications/)
- [FAQ](/support/faq/)
