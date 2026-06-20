# Model Response Complete Notification V2 Technical Plan

## Architecture

```text
StreamGenerate onCompleted
  -> shared background validates status, tab, setting, and permissions
  -> background requests content from originating tab
  -> content provider reports foreground state and extracts final DOM content
  -> background suppresses or creates platform-compatible system notification
  -> Chromium optionally plays bundled audio through an Offscreen Document

Deep Research:

kwDCne onBeforeRequest
  -> persist active conversation and arm one StreamGenerate suppression
kwDCne onCompleted
  -> persist the conversation when onBeforeRequest was missed
matching hNvQHb onCompleted
  -> confirm the processing-card DOM is completed
  -> consume the active conversation
  -> reuse the shared content, suppression, notification, and audio path
```

Network request lifecycle is the only completion signal. The previous
send-button, active-turn, MutationObserver, inactivity timer, and final-turn
grace-window detector is removed.

## Manifest And Permissions

- Chrome:
  - `optional_permissions`: `notifications`, `webRequest`, `offscreen`
  - existing content-script matches provide required Gemini host access;
  - enabling the setting requests both optional API permissions together.
  - enabling audio separately requests optional `offscreen`.
  - Popup requests permissions directly. SettingPanel creates a short-lived
    permission intent, opens the extension action popup, and falls back to an
    extension popup window when `action.openPopup()` is unavailable.
- Firefox:
  - keeps required `notifications`, `webRequest`, `webRequestBlocking`, and Gemini host access;
  - enables the setting without a runtime permission request because Firefox
    cannot preserve the in-page SettingPanel user gesture through background.

Readiness checks the complete permission request for the current browser. Background watches setting and permission changes and serializes listener synchronization so concurrent events cannot register duplicate listeners.

The Chrome SettingPanel cannot call `permissions.request()` directly from the
content-script context, and forwarding the switch click to background does not
preserve the required user gesture. Instead, background stores a session-scoped
permission intent, opens the extension action popup, and falls back to a small
extension popup window. The popup reads the intent, presents the explicit
confirmation action, requests permissions from the extension-page context, then
enables the relevant setting after the grant.

The content UI polls readiness while the popup is open, and background also
reconciles pending intents from permission-change events and readiness checks.
Firefox keeps rendering the shared settings content directly because its
notification permissions are required at install time and do not need a runtime
prompt.

## Shared Background

The shared response notification background owns:

- one filtered `webRequest.onBeforeRequest` listener for Deep Research
  `batchexecute*` polling;
- one filtered `webRequest.onCompleted` listener for `StreamGenerate*` and
  Deep Research `batchexecute*` report retrieval;
- listener registration and removal;
- ephemeral Deep Research task persistence in `storage.session`;
- initialization suppression and at-most-once final report consumption;
- completed processing-card confirmation before consuming a report task;
- successful request validation;
- content request timeout and generic fallback;
- notification permission checks, creation, click focus, and click clear.
- silent Chromium notification creation followed by non-fatal Offscreen audio
  playback when enabled; Firefox omits the unreliable `silent` option.

The request is ignored when `tabId < 0`, status is not `200`, the feature is disabled, or required permissions are missing.

Deep Research request URLs are classified by exact pathname, `rpcids`, and
`source-path=/app/<conversationId>`. The background never parses request or
response bodies. See `deep_research_notification_plan.md` for the complete
state lifecycle and test matrix.

Background sends `response-complete-notification:get-content` to the request tab. It uses `tabs.get(tabId).windowId` only for notification click targeting.

## Content Provider

The content provider registers one runtime message listener. On request it:

1. Reports `isForeground: true` when the page is visible and focused.
2. Briefly retries while waiting for the final response DOM.
3. Extracts current chat title and either the latest standard-response summary
   or the final Deep Research processing-card Title from
   `immersive-entry-chip gem-processing-card .card-title`.
4. Extracts response type and optional image data.
5. Returns fallback content when the final DOM is unavailable.

The provider never sends a completion message, never observes DOM mutations to
decide completion, and does not apply the user foreground-suppression policy.
Background applies that policy with
`responseCompleteNotificationForegroundOnly && content.isForeground`.

## Runtime Contract

Request:

```ts
{
  type: 'response-complete-notification:get-content'
  payload: {
    completionKind: 'standard-response' | 'deep-research'
  }
}
```

Response:

```ts
{
  isForeground: boolean
  title: string
  message: string
  responseType: 'text' | 'image'
  imageDataUrl?: string
}
```

## Verification

Run:

```bash
./node_modules/.bin/vitest run \
  src/services/responseCompleteNotificationContent.test.ts \
  src/entrypoints/background/responseCompleteNotification.test.ts
./node_modules/.bin/tsc --noEmit
pnpm build
pnpm build:firefox
node scripts/check-i18n.js
```

Inspect generated manifests:

- Chrome contains optional `notifications` and optional `webRequest`, with no redundant optional Gemini origin declaration.
- Firefox retains required `notifications` and WebRequest permissions.
- Chrome contains optional `offscreen`; Firefox does not contain `offscreen` or
  the audio Offscreen page.
