# Model Response Complete Notification V2 PRD

## 1. Summary

Gemini Power Kit can notify users when a standard Gemini response finishes while its tab is not visible or focused.

V2 uses the browser network layer as the single completion signal. A successful completion of the following streaming request means the standard Gemini response is complete:

```text
https://gemini.google.com/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate*
```

The content script does not decide when a response is complete. It only supplies notification content and foreground state after the background receives the WebRequest completion event.

## 2. Goals

- Reliably detect standard Gemini response completion in background tabs.
- Avoid completion logic tied to Gemini send-button or conversation DOM mutations.
- Keep the feature default-off and request permissions only after explicit user action.
- Preserve notification title, response summary, optional image preview, foreground suppression, test notification, and click-to-focus behavior.
- Send a generic completion notification when page content cannot be read.
- Keep system notifications silent and optionally play the bundled completion
  sound on Chromium through an Offscreen Document.

## 3. Non-Goals

- Detect Deep Research, Canvas, or other flows that do not use the standard `StreamGenerate` endpoint.
- Parse or inspect the streaming response body.
- Treat HTTP completion as a guarantee about response quality.
- Add custom sound selection, uploads, or volume controls.

## 4. Permissions

Chrome declares the following optional permissions:

```json
{
  "optional_permissions": ["notifications", "webRequest", "offscreen"]
}
```

Existing Gemini content-script matches already provide required Gemini host access. Declaring the same origin in `optional_host_permissions` is invalid because Chrome treats it as redundant.

When the user enables the feature, Chrome requests `notifications` and `webRequest` in one user gesture. If either is denied, the feature remains disabled.

Chrome requests optional `offscreen` permission only when the user enables the
audio setting. Audio permission denial does not disable visual notifications.

Firefox declares `notifications` together with its existing required
`webRequest`, `webRequestBlocking`, and Gemini host permissions. Firefox does
not preserve the user gesture when the in-page SettingPanel forwards an
optional-permission request to background, so the notification permission
cannot be requested reliably when that switch is enabled.

`missing-extension-permission` means any required capability for the current browser is missing. Permission changes must immediately resynchronize the WebRequest listener.

## 5. Completion And Notification Behavior

The shared background registers one `webRequest.onCompleted` listener only while:

- the response-complete notification setting is enabled; and
- all required permissions are available.

The listener handles only matching requests with a valid tab ID and `statusCode === 200`. Failed, cancelled, non-200, and non-tab requests do not create completion notifications.

After completion, background asks the originating content script for:

- whether the page is visible and focused;
- current chat title;
- latest final response summary;
- response type;
- optional image data.

If the page is visible and focused, notification is suppressed. If content extraction fails or times out, background sends a generic notification:

```text
Gemini finished replying
Your response is ready.
```

Chromium system notifications use `silent: true`. When Chromium audio is
enabled, the extension plays `notification-96k-hq.mp3` through an Offscreen
Document only after system notification creation succeeds. Firefox omits the
`silent` option because it can prevent `notifications.create()` from completing
on macOS and uses the browser's default notification behavior.

## 6. Content And Privacy Boundaries

- DOM access is used only to enrich notification content, not to detect completion.
- Background does not read the tab URL, title, favicon, or response body.
- Background may use `tabs.get(tabId).windowId` only to preserve click-to-focus behavior.
- Notification text is normalized and length-limited before display.
- Chrome may use a locally generated, size-limited JPEG data URL for image notification presentation. Firefox uses a basic notification.

## 7. Acceptance Criteria

1. Chrome new installs and upgrades do not automatically request notification or WebRequest permissions.
2. Chrome requests `notifications` and `webRequest` only when the user enables the feature.
3. Firefox has required `notifications` permission and enables the feature without making a runtime permission request.
4. A successful standard `StreamGenerate` request in a background tab creates one notification.
5. Foreground responses are suppressed.
6. Content extraction failure still creates a generic notification.
7. Disabling the setting or revoking permissions unregisters the WebRequest listener.
8. Re-enabling or restoring permissions registers exactly one listener.
9. Test notifications and click-to-focus plus click-to-clear continue to work.
10. Chromium system notifications are silent; enabled Chromium audio plays one
    bundled sound only after successful notification creation. Firefox
    notifications use the browser default behavior.
