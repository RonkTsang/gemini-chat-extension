# Response Complete Notification Audio Plan

## 1. Summary

Add an optional audio cue to response-complete system notifications.

The audio setting is subordinate to the existing response-complete notification
setting:

- Audio is off by default.
- The audio switch is shown only on Chromium builds.
- The audio switch can be edited only while response-complete notifications are
  enabled.
- A stored audio preference is preserved when the parent notification setting is
  turned off.
- Audio plays only after the extension successfully creates a system
  notification.
- Create every system notification with `silent: true`. Gemini Power Kit never
  uses the browser or operating-system default notification sound.
- Chromium plays audio from an Offscreen Document with the `AUDIO_PLAYBACK`
  reason.
- Firefox does not expose the audio switch in the first release because Firefox
  does not support the Chromium Offscreen API.

This changes the existing V2 non-goal that excludes custom notification sounds.
It does not use custom audio as a fallback for failed system notifications.

## 2. Product Goals

- Let users opt into a short, recognizable completion sound.
- Preserve the existing notification permission, foreground suppression, and
  completion detection behavior.
- Make the relationship between system notifications and audio explicit.
- Keep audio opt-in and avoid changing behavior for existing users.
- Avoid playing sounds for events that do not create a system notification.

## 3. Non-Goals

- Custom sound upload or sound selection.
- Volume control.
- Playing audio without also creating a system notification.
- Playing audio when a foreground response is suppressed.
- Configuring or using browser and operating-system notification sounds.
- Implementing a Firefox audio fallback in the first release.

## 4. Setting Panel Experience

The notification view contains two settings:

1. `Notify when Gemini finishes replying` (existing parent setting).
2. `Play a sound with notifications` (new child setting).

Recommended layout:

```text
Notify when Gemini finishes replying                         [on]
Show the chat title and a short response preview...

  Play a sound with notifications                            [off]
  Plays a short sound after a notification is created.

[Send test notification] [Troubleshooting]
```

Behavior:

| Parent notification | Stored audio | Audio switch | Effective audio |
| --- | --- | --- | --- |
| Off | Off | Disabled | Off |
| Off | On | Disabled, visually on | Off |
| On | Off | Editable, off | Off |
| On | On | Editable, on | On |

The parent switch does not erase the stored audio preference. If a user turns
notifications off and back on, their previous audio choice is restored.

The existing `Send test notification` action follows the same production path:
when audio is enabled, a successfully created test notification also plays the
sound.

On Firefox, do not render the audio row. Do not show an unsupported control that
can never take effect.

## 5. State And Permissions

Add a synchronized preference:

```ts
enableResponseCompleteNotificationAudio: boolean // fallback: false
```

Effective audio is:

```ts
notificationEnabled
  && audioEnabled
  && offscreenPermissionAvailable
  && !import.meta.env.FIREFOX
```

### Chromium permissions

Declare `offscreen` as an optional permission. Request it only from the user
gesture that turns on the audio switch.

The parent notification switch continues to request only `notifications` and
`webRequest`. Audio permission failure must not turn off the parent notification
feature.

If the `offscreen` permission request fails:

- keep the audio setting off;
- keep response-complete notifications enabled;
- show a short setting-panel error for the audio row.

### Firefox permissions

Do not add `offscreen` to the Firefox manifest. Firefox keeps the existing
notification behavior unchanged.

## 6. Notification And Audio Behavior

Audio is coupled to successful extension notification creation, not directly to
`StreamGenerate` completion.

```text
StreamGenerate onCompleted
  -> validate request, setting, and notification permission
  -> request content and apply foreground suppression
  -> resolve effective audio state
  -> create system notification with silent: true
  -> if creation succeeded and effective audio is on
       -> request Offscreen Document playback
```

The WebExtensions notification option is named `silent`, not `muted`.
`muted: true` is not part of `notifications.NotificationCreateOptions` and must
not be used.

Always set `silent: true`, regardless of the custom audio setting or Offscreen
availability. When custom audio is disabled or unavailable, the notification is
visual-only.

All notification creation paths must use `silent: true`, including basic
notifications, image notifications, image-to-basic fallback, and test
notifications.

Do not play audio when:

- the Gemini page is visible and focused;
- the request is invalid, failed, cancelled, or non-200;
- notification permissions/readiness block creation;
- system notification creation rejects;
- the notification feature is disabled;
- the audio setting is disabled;
- the Offscreen API or permission is unavailable.

The browser API cannot confirm that the operating system visibly delivered a
created notification. Therefore, audio may still play when the OS suppresses the
visual notification because of Focus or Do Not Disturb.

Audio playback failure is non-fatal. A successfully created system notification
must remain successful even if audio cannot play.

## 7. Offscreen Audio Architecture

### Components

- `responseCompleteNotification.ts`
  - remains the owner of notification creation;
  - asks the audio service to play only after `notifications.create()` resolves.
- `responseCompleteNotificationAudio.ts`
  - checks effective audio state;
  - ensures exactly one Offscreen Document exists;
  - sends a targeted playback message;
  - logs and swallows playback failures.
- Chromium-only WXT unlisted page at
  `src/entrypoints/notification-audio-offscreen/index.html`
  - listens only for the targeted playback message;
  - reuses one `HTMLAudioElement`;
  - restarts the short sound from `currentTime = 0`.
- `src/assets/sound/notification-96k-hq.mp3`
  - default bundled local audio asset;
  - 96 kbps, 48 kHz stereo, approximately 24 KB;
  - not exposed through `web_accessible_resources`.

### Offscreen lifecycle

Create the document with:

```ts
{
  url: OFFSCREEN_DOCUMENT_PATH,
  reasons: ['AUDIO_PLAYBACK'],
  justification: 'Play an optional sound after response-complete notifications',
}
```

Use one module-level creation promise to serialize concurrent creation attempts.
Before creating, check for the exact Offscreen Document URL with
`runtime.getContexts()`.

`AUDIO_PLAYBACK` Offscreen Documents close automatically after a period without
audio. The audio service must therefore ensure the document exists before every
playback request.

### Playback policy

Use a single reusable audio element rather than creating an element per event.
For repeated events:

- reset `currentTime` to `0`;
- call `play()` again;
- do not overlap multiple copies of the same sound.

No manual Offscreen Document close is required for normal playback.

### Message contract

Add a dedicated message that cannot be confused with regular runtime messages:

```ts
{
  type: 'response-complete-notification-audio:play'
  target: 'offscreen'
}
```

The Offscreen listener must validate both `type` and `target`.

## 8. Failure Handling And Logging

Audio failures must not change the result returned by
`handleCreateNotification()`.

Log structured events:

- `notification-audio-skipped`
  - reason: `disabled`, `unsupported`, or `missing-permission`
- `notification-audio-offscreen-created`
- `notification-audio-play-requested`
- `notification-audio-play-failed`

Do not log normal `disabled` skips for every notification in production if that
creates excessive noise.

## 9. Required Code Changes

| Area | Change |
| --- | --- |
| `wxt.config.ts` | Add Chromium-only optional `offscreen` permission. |
| `responseCompleteNotificationSettings.ts` | Add audio preference and Offscreen permission helpers. |
| `useResponseCompleteNotificationSettings.ts` | Load/watch/toggle audio and request permission on enable. |
| Setting panel notification view | Add the dependent audio switch on Chromium. |
| Popup | No new control; test notifications still honor the stored audio preference. |
| Runtime message types | Add the targeted Offscreen playback message contract. |
| Background notification module | Pass `silent: true` to every notification template, resolve effective custom audio independently, then trigger custom audio only after successful creation. |
| Audio background service | Serialize Offscreen creation and send play messages. |
| Chromium WXT unlisted page | Add `notification-audio-offscreen/index.html` and its bundled playback script; exclude or omit it from Firefox output. |
| Locales | Add audio label, description, and permission failure text to every locale. |
| Existing notification docs | Remove custom audio from non-goals and document the new behavior. |
| Platform docs | Document Chromium Offscreen support and Firefox omission. |

## 10. Test Plan

### Unit tests

- Audio preference defaults to false and persists independently of the parent
  setting.
- Enabling audio requests only the optional `offscreen` permission.
- Permission denial leaves parent notifications enabled and audio disabled.
- Audio is not requested before `notifications.create()` resolves.
- Notifications always use `silent: true`, including when custom audio is
  disabled or unavailable.
- Basic, image, image-fallback, and test notifications all use `silent: true`.
- Notification creation rejection does not request audio.
- Foreground suppression does not request audio.
- Test notification plays audio when enabled.
- Disabled audio does not create an Offscreen Document.
- Concurrent play requests create at most one Offscreen Document.
- Playback service failures do not turn notification success into failure.
- Firefox never requests Offscreen playback.

### Build and manifest verification

```bash
pnpm test:run
pnpm compile
pnpm build
pnpm build:firefox
pnpm run check:i18n
```

Generated manifests:

- Chromium contains optional `notifications`, `webRequest`, and `offscreen`.
- Firefox contains optional `notifications` and does not contain `offscreen`.

### Manual acceptance

1. Existing and new users have audio off by default.
2. Audio switch is disabled while the parent notification setting is off.
3. Turning audio on requests the needed Chromium capability and preserves the
   parent notification setting if permission fails.
4. A background Gemini completion creates one system notification and plays one
   custom sound without also playing the system notification sound.
5. A foreground Gemini completion creates neither notification nor sound.
6. Turning audio off preserves visual notifications without sound.
7. Turning the parent setting off and on preserves the audio preference.
8. The test notification follows the same audio setting.
9. Rapid notifications restart the sound without overlapping copies.
10. Firefox notification behavior remains unchanged and has no audio control.

## 11. Product Risks

- Platform support for suppressing system notification sounds should be manually
  verified on supported operating systems even though the WebExtensions option
  is `silent: true`.
- A notification API success does not guarantee visible OS delivery, so Focus
  modes can produce audio without a visible notification.
- Adding optional `offscreen` permission changes the Chromium manifest and must
  be verified against Chrome Web Store review behavior.
- The audio asset affects package size and should remain short and compressed.
  The default asset is `src/assets/sound/notification-96k-hq.mp3`.
