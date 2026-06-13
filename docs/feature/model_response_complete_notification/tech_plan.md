# Model Response Complete Notification V2 Technical Plan

## Architecture

```text
StreamGenerate onCompleted
  -> shared background validates status, tab, setting, and permissions
  -> background requests content from originating tab
  -> content provider reports foreground state and extracts final DOM content
  -> background suppresses or creates system notification
```

`webRequest.onCompleted` is the only completion signal. The previous send-button, active-turn, MutationObserver, inactivity timer, and final-turn grace-window detector is removed.

## Manifest And Permissions

- Chrome:
  - `optional_permissions`: `notifications`, `webRequest`
  - existing content-script matches provide required Gemini host access;
  - enabling the setting requests both optional API permissions together.
- Firefox:
  - keeps required `webRequest`, `webRequestBlocking`, and Gemini host access;
  - requests only optional `notifications`.

Readiness checks the complete permission request for the current browser. Background watches setting and permission changes and serializes listener synchronization so concurrent events cannot register duplicate listeners.

## Shared Background

The shared response notification background owns:

- one filtered `webRequest.onCompleted` listener for `StreamGenerate*`;
- listener registration and removal;
- successful request validation;
- content request timeout and generic fallback;
- notification permission checks, creation, click focus, and click clear.

The request is ignored when `tabId < 0`, status is not `200`, the feature is disabled, or required permissions are missing.

Background sends `response-complete-notification:get-content` to the request tab. It uses `tabs.get(tabId).windowId` only for notification click targeting.

## Content Provider

The content provider registers one runtime message listener. On request it:

1. Returns `suppressed: true` immediately when the page is visible and focused.
2. Briefly retries while waiting for the final response DOM.
3. Extracts current title, latest response summary, response type, and optional image data.
4. Returns fallback content when the final DOM is unavailable.

The provider never sends a completion message and never observes DOM mutations to decide completion.

## Runtime Contract

Request:

```ts
{
  type: 'response-complete-notification:get-content'
}
```

Response:

```ts
{
  suppressed: boolean
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
- Firefox retains required WebRequest permissions and only optional `notifications`.
