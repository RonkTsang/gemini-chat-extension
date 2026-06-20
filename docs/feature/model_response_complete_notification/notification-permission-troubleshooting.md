# Notification Permission Troubleshooting

This guide explains how to check notification settings when Gemini Power Kit is enabled but system notifications do not appear.

The user-facing version of this guide is published at:

- https://gpk.ronktsang.com/support/notification-troubleshooting/
- https://gpk.ronktsang.com/zh-cn/support/notification-troubleshooting/

## 1. What The Extension Can Check

Gemini Power Kit can reliably check these states:

1. Whether the extension has the `notifications` permission.
2. In Chrome, whether the browser reports extension notifications as `granted` or `denied` through `notifications.getPermissionLevel()`.

Gemini Power Kit cannot reliably check every operating system setting that may suppress notifications.

Examples that may block or hide notifications:

- macOS app notification settings for Chrome or Firefox.
- Windows notification settings for Chrome or Firefox.
- Do Not Disturb, Focus, or Focus Assist.
- Browser notification settings.
- Enterprise or device management policies.
- Browser or operating system bugs.

Use the test notification in the extension settings to confirm whether notifications can actually appear on your device.

## 2. Chrome

Check Chrome notification settings:

1. Open Chrome.
2. Go to Chrome Settings.
3. Search for `Notifications`.
4. Confirm Chrome allows notifications.
5. Confirm extension notifications are not blocked.

Official guide:

- [Chrome notification settings](https://support.google.com/chrome/answer/3220216)

## 3. Firefox

Check Firefox notification settings:

1. Open Firefox.
2. Open Firefox Settings.
3. Search for `Notifications`.
4. Confirm notifications are allowed.
5. Confirm notification prompts or notification delivery are not blocked by browser settings.

Official guide:

- [Firefox notification settings](https://support.mozilla.org/en-US/kb/push-notifications-firefox)

## 4. macOS

Check macOS notification settings:

1. Open System Settings.
2. Go to Notifications.
3. Select Google Chrome or Firefox.
4. Turn on Allow notifications.
5. Confirm the alert style and lock screen / notification center options match your preference.
6. Check Focus settings and make sure the active Focus mode is not hiding browser notifications.

Official guide:

- [Apple: Change Notifications settings on Mac](https://support.apple.com/guide/mac-help/change-notifications-settings-mh40583/mac)
- [Apple: Set up a Focus on Mac](https://support.apple.com/guide/mac-help/set-up-a-focus-to-stay-on-task-mchl613dc43f/mac)

## 5. Windows

Check Windows notification settings:

1. Open Settings.
2. Go to System > Notifications.
3. Turn on Notifications.
4. Find Google Chrome or Firefox in the app list.
5. Confirm notifications are enabled for that browser.
6. Check Do Not Disturb and Focus settings.

Official guide:

- [Microsoft: Notifications and Do Not Disturb in Windows](https://support.microsoft.com/windows/notifications-and-do-not-disturb-in-windows-feeca47f-0baf-5680-16f0-8801db1a8466)

## 6. Recommended Product Behavior

When the user enables response complete notifications, Gemini Power Kit should:

1. On Chrome, request the extension optional `notifications` permission. On
   Firefox, use the required notification permission granted at installation.
2. Check whether the extension has the permission.
3. In Chrome, call `notifications.getPermissionLevel()` when available.
4. If the browser reports notifications as denied, show a browser notification settings hint.
5. If checks pass, allow the feature to stay enabled.
6. Provide a test notification button.
7. Link to this troubleshooting guide when test notifications do not appear.

## 7. Important Limitations

Even when all extension-level checks pass, the operating system may still suppress notifications. The extension should not treat notification delivery as guaranteed.

The extension should not use Web `Notification.permission` for this feature. That API checks the current website origin, such as `gemini.google.com`, not the extension's notification permission.

Chromium system notifications are created with `silent: true`. Users can
optionally enable the bundled completion sound, which plays through an
Offscreen Document after notification creation succeeds. Firefox omits the
`silent` option for macOS compatibility and uses the browser's default
notification behavior.
