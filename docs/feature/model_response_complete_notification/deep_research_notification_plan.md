# Deep Research Response Complete Notification Plan

## 1. Summary

Extend the existing response-complete notification feature to support Gemini
Deep Research without parsing private RPC response bodies.

The first release uses the following network lifecycle:

```text
kwDCne onBeforeRequest
  -> mark the conversation as an active Deep Research task
  -> suppress the next StreamGenerate completion from the same tab

matching hNvQHb onCompleted
  -> consume the active Deep Research task
  -> reuse the existing content, foreground-suppression, notification, and audio path
```

This design treats a successful `hNvQHb` request as the final report-ready
signal. It does not parse `kwDCne status_info[7]`, the `StreamGenerate` response,
or the final Markdown report.

## 2. Why This Fits The Existing Architecture

The current shared background already:

- dynamically registers WebRequest listeners only while notifications are
  enabled and permissions are available;
- validates `tabId` and successful HTTP status;
- requests notification content and foreground state from the originating tab;
- creates cross-browser notifications and optional Chromium audio;
- focuses and clears notifications when clicked.

The existing platform-specific response interception paths are not required:

- Chrome does not need the MAIN-world XHR interceptor in
  `src/entrypoints/xhr.content.tsx`;
- Firefox does not need `webRequest.filterResponseData` in
  `src/entrypoints/background/firefox.ts`;
- no new runtime bridge or content-script completion event is required.

Both Chrome and Firefox can observe the required request URLs through the
existing WebRequest permission.

## 3. Observed Deep Research Lifecycle

The captured successful request sequence is:

```text
StreamGenerate starts
kwDCne starts
kwDCne completes
StreamGenerate completes
... repeated kwDCne polling ...
final kwDCne completes
hNvQHb starts
hNvQHb completes with the final conversation report
```

Relevant endpoints:

```text
Standard/initial response:
/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate*

Deep Research polling:
/_/BardChatUi/data/batchexecute?rpcids=kwDCne&source-path=/app/<conversationId>*

Final report retrieval:
/_/BardChatUi/data/batchexecute?rpcids=hNvQHb&source-path=/app/<conversationId>*
```

`source-path` supplies the conversation identity needed to associate polling
with final report retrieval. The implementation must not rely on `_reqid`,
`f.sid`, build version, request body, response body, or the relative completion
time between the final `kwDCne` and `hNvQHb`.

## 4. Product Behavior

### Standard responses

Standard responses keep the current behavior:

```text
StreamGenerate onCompleted -> notify
```

### Deep Research responses

Deep Research uses:

```text
first valid kwDCne request
  -> mark active task
  -> arm one StreamGenerate suppression

next StreamGenerate completion in the same tab
  -> consume suppression
  -> do not notify

matching successful hNvQHb completion
  -> consume active task
  -> notify once
```

The notification continues to follow the existing foreground policy. If the
Gemini page is visible and focused when `hNvQHb` completes, the notification is
suppressed and the active task is still consumed.

If notification content is not rendered within the existing content-provider
retry window, send the existing generic notification. Final report parsing is
not required for notification correctness.

## 5. Request Classification

Add a small shared request-classification module:

```ts
type GeminiResponseRequest =
  | { kind: 'stream-generate' }
  | {
      kind: 'deep-research-poll'
      conversationId: string
    }
  | {
      kind: 'deep-research-report'
      conversationId: string
    }
  | { kind: 'other' }
```

Classification rules:

1. Parse with `new URL(details.url)`.
2. Require hostname `gemini.google.com`.
3. Match the exact expected pathname.
4. Read `rpcids` with `URL.searchParams.get`.
5. Parse `source-path` only when it matches `/app/<conversationId>`.
6. Ignore malformed URLs and requests without a conversation ID.

Do not use regular expressions over the complete query string. Query parameter
order is not stable.

Recommended file:

```text
src/entrypoints/background/geminiResponseRequest.ts
```

Keep the classifier pure and unit-test it independently.

## 6. Deep Research State

### State shape

Track one task per conversation:

```ts
interface DeepResearchTask {
  tabId: number
  conversationId: string
  startedAt: number
  lastPollAt: number
  suppressNextStreamGenerate: boolean
}
```

Use this stable key:

```text
<tabId>:<conversationId>
```

A tab-level lookup is also needed when processing `StreamGenerate`, because
that endpoint does not include `source-path`. If more than one task in a tab is
armed for suppression, consume only the task with the most recent `lastPollAt`.

### Persistence

Chrome uses an MV3 service worker that can stop during a multi-minute research
task. The task registry must not rely only on module-level memory.

Persist the registry in `browser.storage.session`:

```text
responseCompleteNotification.deepResearchTasks
```

Use an in-memory mirror for immediate request ordering, backed by serialized
session-storage writes. The in-memory mirror prevents the first `kwDCne` and
the initial `StreamGenerate` completion from racing on storage I/O. Session
storage allows a restarted background worker to recover before later polls or
`hNvQHb` completion.

Do not use synchronized storage. Deep Research task state is ephemeral and must
not move across browsers or devices.

### Expiry and cleanup

Each `kwDCne` request refreshes `lastPollAt`.

Remove tasks when:

- their matching successful `hNvQHb` is consumed;
- the tab closes;
- the notification feature is disabled;
- WebRequest permission is removed;
- `lastPollAt` is older than the task TTL.

Recommended TTL:

```text
30 minutes after the last observed kwDCne request
```

TTL cleanup should run opportunistically whenever the registry is read or
modified. A new alarms permission and scheduled cleanup job are unnecessary.

## 7. WebRequest Listener Design

Replace the current single-endpoint listener registration with one logical
notification monitor that owns:

```text
onBeforeRequest:
  batchexecute*

onCompleted:
  StreamGenerate*
  batchexecute*

onErrorOccurred:
  optional; not required for the first release
```

### `kwDCne onBeforeRequest`

For a valid tab and conversation:

1. Create the task if it does not exist.
2. Set `suppressNextStreamGenerate: true` only when creating a new task.
3. Refresh `lastPollAt` for subsequent polls.
4. Persist the updated registry.

Repeated polls must not re-arm StreamGenerate suppression after it has already
been consumed.

### `StreamGenerate onCompleted`

Before running the current notification path:

1. Ignore invalid tabs and unsuccessful requests as today.
2. Find an active task for the same tab with
   `suppressNextStreamGenerate === true`.
3. If multiple tasks match, choose the one with the most recent `lastPollAt`.
4. If found, atomically set suppression to `false`, persist, log, and return.
5. Otherwise, run the existing standard-response notification path.

The suppression is deliberately consumable. An abandoned Deep Research task
must not suppress later ordinary responses indefinitely.

### `hNvQHb onCompleted`

For a valid tab, successful status, and parsed conversation ID:

1. Find the exact `<tabId>:<conversationId>` task.
2. If no task exists, ignore the request. This prevents ordinary conversation
   history retrieval from creating notifications.
3. Remove the task before awaiting content extraction or notification creation.
4. Reuse the current notification path.

Removing the task before asynchronous work guarantees at-most-once notification
behavior if duplicate report requests complete close together.

## 8. Shared Notification Refactor

Extract the common part of `processStreamGenerateCompleted` into a source-neutral
function:

```ts
type CompletionKind = 'standard-response' | 'deep-research'

async function processResponseCompleted(
  details: WebRequestCompletedDetails,
  completionKind: CompletionKind,
): Promise<void>
```

It should continue to own:

- readiness validation;
- notification-content request;
- foreground suppression;
- tab/window lookup;
- notification creation;
- optional audio playback through the existing notification path.

Use completion-specific logging, but do not add a separate notification setting
or separate audio behavior for Deep Research in the first release.

Retain the current chat title and generic fallback behavior. For Deep Research,
use the final processing-card Title at
`immersive-entry-chip gem-processing-card .card-title` as notification details,
briefly retrying while the Title DOM is not yet rendered.

## 9. Files To Change

### Add

```text
src/entrypoints/background/geminiResponseRequest.ts
src/entrypoints/background/geminiResponseRequest.test.ts
src/entrypoints/background/deepResearchNotificationState.ts
src/entrypoints/background/deepResearchNotificationState.test.ts
```

### Modify

```text
src/entrypoints/background/responseCompleteNotification.ts
src/entrypoints/background/responseCompleteNotification.test.ts
docs/feature/model_response_complete_notification/prd.md
docs/feature/model_response_complete_notification/tech_plan.md
docs/platforms.md
```

No changes are required for:

```text
src/entrypoints/xhr.content.tsx
src/entrypoints/main-world/stuff-monitor.ts
src/entrypoints/background/firefox.ts
wxt.config.ts
src/types/runtime-messages.ts
src/services/responseCompleteNotificationContent.ts
```

## 10. Logging

Add structured background events:

```text
deep-research-started
deep-research-poll-observed
deep-research-stream-suppressed
deep-research-report-completed
deep-research-report-ignored-untracked
deep-research-task-expired
deep-research-task-cleared
```

Include only:

```text
tabId
conversationId
requestId
event timestamp
task age where relevant
```

Do not log request or response bodies.

## 11. Test Plan

### Request classifier

- Classifies `StreamGenerate`.
- Classifies `kwDCne` regardless of query-parameter order.
- Classifies `hNvQHb` regardless of query-parameter order.
- Extracts the conversation ID from encoded and decoded `source-path`.
- Rejects malformed, missing, and non-`/app/<conversationId>` source paths.
- Rejects other Gemini RPC IDs.

### State registry

- Creates one task on the first poll.
- Repeated polls refresh time without re-arming consumed suppression.
- Consumes StreamGenerate suppression once.
- Consumes the exact conversation task on report completion.
- Does not match another tab or conversation.
- Recovers state from session storage.
- Removes expired tasks.
- Clears tasks for a closed tab and when the feature is disabled.

### Background integration

- Standard `StreamGenerate` still creates one notification.
- First Deep Research `kwDCne` suppresses the initialization
  `StreamGenerate`.
- Repeated `kwDCne` requests do not create notifications.
- Matching successful `hNvQHb` creates one notification.
- Untracked `hNvQHb` does not notify.
- Non-200 `hNvQHb` keeps the task available for a later successful retry.
- Duplicate successful `hNvQHb` requests notify at most once.
- Foreground Deep Research completion is suppressed and consumed.
- Deep Research notification details use the final processing-card Title.
- Content extraction failure creates the existing generic fallback notification.
- Permission removal unregisters all notification-owned WebRequest listeners
  and clears ephemeral task state.

### Manual verification

Verify on Chrome and Firefox:

1. Start a standard response in a background tab: one completion notification.
2. Start Deep Research and leave the tab: no notification when initialization
   finishes; one notification when the final report is retrieved.
3. Keep the Deep Research tab focused: no system notification.
4. Disable notifications during research: no completion notification and no
   stale task after re-enabling.
5. Let the Chrome background service worker stop during research: final report
   retrieval still creates one notification.
6. Refresh or open a completed research conversation: no notification from an
   untracked `hNvQHb`.

Run:

```bash
pnpm test:run \
  src/entrypoints/background/geminiResponseRequest.test.ts \
  src/entrypoints/background/deepResearchNotificationState.test.ts \
  src/entrypoints/background/responseCompleteNotification.test.ts \
  src/services/responseCompleteNotificationContent.test.ts
pnpm compile
pnpm build
pnpm build:firefox
pnpm run check:i18n
```

## 12. Known Limitations

- The design assumes `kwDCne` continues to identify Deep Research polling and
  `hNvQHb` continues to retrieve the final report.
- If Gemini retrieves a completed report without a prior observable `kwDCne`
  request, the extension intentionally does not notify.
- The first release tracks one active Deep Research task per conversation and
  uses the next StreamGenerate completion in that tab as the initialization
  response to suppress.
- Notification click behavior continues to focus the originating tab. It does
  not navigate back to the tracked conversation if the user changed
  conversations within the same tab.
- Failed and cancelled research tasks are not classified. They expire after the
  last-poll TTL and do not create a completion notification.

## 13. Acceptance Criteria

1. Standard response notifications retain current behavior.
2. Deep Research initialization does not create an early notification.
3. A tracked successful `hNvQHb` completion creates exactly one notification.
4. An untracked `hNvQHb` completion never creates a notification.
5. No Deep Research request or response body is parsed.
6. Chrome and Firefox use the same shared background completion logic.
7. Chrome MV3 background suspension does not lose active Deep Research state.
8. Existing notification permissions, foreground suppression, content
   extraction, click handling, and audio behavior remain unchanged.
