# Platform Differences

This project builds separate Chrome and Firefox extension variants with WXT. Keep browser-specific behavior isolated by entrypoint, `include`, or `import.meta.env.FIREFOX` guards.

## Build Targets

- Chrome: `pnpm dev`, `pnpm build`, output under `.output/chrome-mv3*`.
- Firefox: `pnpm dev:firefox`, `pnpm build:firefox`, output under `.output/firefox-mv2*`.

## Request Interception

- Chrome uses `src/entrypoints/xhr.content.tsx` with `include: ['chrome']`, `world: 'MAIN'`, and `runAt: 'document_start'` to hook page XHR early.
- Firefox uses `src/entrypoints/background/index.ts` with `include: ['firefox']`, then `src/entrypoints/background/firefox.ts` with `webRequest` and `filterResponseData`.
- Both paths normalize data into `stuff-media:data-received` and feed `src/entrypoints/content/stuff-page/index.ts`.

## Manifest And Permissions

- Base manifest keeps shared permissions minimal, mainly `storage`.
- Firefox adds `webRequest`, `webRequestBlocking`, `*://gemini.google.com/*`, and `browser_specific_settings.gecko` in `wxt.config.ts`.
- Chrome builds must not include Gecko settings or Firefox-only response interception logic. Response-complete notifications may use optional `webRequest`.

## Background Runtime

- Chrome has an MV3 background service worker for shared notification message handling.
- Firefox has a persistent MV2 background entrypoint at `src/entrypoints/background/index.ts`.
- Firefox-only response interception with `filterResponseData` stays behind
  `import.meta.env.FIREFOX`. The shared response-complete notification monitor
  uses `webRequest.onBeforeRequest` and `webRequest.onCompleted` on both
  browsers, without reading response bodies.

## Notifications

- Chrome declares `notifications`, `webRequest`, and `offscreen` as optional
  permissions. It also declares `*://gemini.google.com/*` as optional host
  access because the `webRequest` API requires host access to observe Gemini
  requests.
- Chrome Popup requests optional notification permissions directly. The
  in-page SettingPanel opens the extension action popup, with a popup window
  fallback, because a content-script click forwarded to background does not
  preserve the user gesture required by `permissions.request()`.
- Firefox keeps `notifications`, WebRequest, and Gemini host permissions
  required. Firefox cannot preserve the user gesture when the in-page
  SettingPanel sends a permission request to background, so making
  `notifications` optional would cause the toggle to fail without showing a
  permission prompt. Its SettingPanel continues to render notification controls
  directly; the extension-page popup workflow is Chrome-only.
- The response complete notification feature does not request `tabs`; notification click handling only uses stored `sender.tab.id` and `sender.tab.windowId`.
- `StreamGenerate` completion is detected by shared background WebRequest monitoring. Notification title and message are requested from the Gemini content script; background must not read tab `url`, `title`, or `favIconUrl`.
- Deep Research uses shared background WebRequest URL monitoring:
  `kwDCne` marks an active conversation and suppresses its initialization
  `StreamGenerate`; a matching successful `hNvQHb` completion creates the final
  notification. Ephemeral task state is stored in `storage.session`.
- Image response notifications are platform-specific: Chrome macOS uses a `basic` notification with the generated image thumbnail in `iconUrl`; Chrome on other platforms uses the `image` template with `imageUrl`; Firefox always uses `basic`.
- Chromium system notifications use `silent: true` and can optionally play the
  bundled completion sound through a Chrome-only Offscreen Document after
  notification creation succeeds. Firefox omits the `silent` option because it
  can prevent `notifications.create()` from completing on macOS; Firefox does
  not expose the custom audio setting.

## Opening Tabs

- Chrome opens Stuff page targets from content script with `window.open`.
- Firefox sends `stuff-page:open-in-new-tab` to background and opens via `browser.tabs.create` to avoid popup blocking.

## Theme Background

- Firefox has special handling for Blob URL principal differences in setting-panel previews. See `resolveThemeBackgroundPreviewUrlForPanel` in `src/entrypoints/content/gemini-theme/background/service.ts`.
- Firefox marks `data-gpk-firefox="true"` and uses a `backdrop-filter` background blur path to avoid Firefox blur artifacts with `scale > 1`.
- Chrome keeps the original shared preview/background path and filter-based background blur.

## Extension Reload Notice

- Firefox uses an instance-id mismatch check: background exposes `firefox:get-instance-id`, content compares it with `data-gpk-firefox-instance-id`, then shows the lightweight reload toast when stale.
- Existing context invalidation monitoring remains a general fallback, but Firefox should not rely on WXT invalidation callbacks as the primary update signal.

## Quick Rules

- Prefer `browser.*` from `wxt/browser`; do not add new `chrome.*` calls.
- Keep Firefox-only code behind `include: ['firefox']` or `import.meta.env.FIREFOX`.
- Keep Chrome-only content script hooks behind `include: ['chrome']`.
- When changing cross-browser behavior, verify `pnpm run compile`, `pnpm build`, and `pnpm build:firefox`.
