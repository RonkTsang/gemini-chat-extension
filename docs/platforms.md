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
- Chrome builds must not include Gecko settings or Firefox webRequest logic.

## Background Runtime

- Chrome has an MV3 background service worker for shared notification message handling.
- Firefox has a persistent MV2 background entrypoint at `src/entrypoints/background/index.ts`.
- Firefox-only webRequest flow still stays behind `import.meta.env.FIREFOX` and must not be included in Chrome builds.

## Notifications

- Chrome and Firefox both declare `notifications` only in `optional_permissions`.
- The response complete notification feature does not request `tabs`; notification click handling only uses stored `sender.tab.id` and `sender.tab.windowId`.
- Notification title and message are extracted by the Gemini content script and passed to background; background must not read tab `url`, `title`, or `favIconUrl`.
- Image response notifications are platform-specific: Chrome macOS uses a `basic` notification with the generated image thumbnail in `iconUrl`; Chrome on other platforms uses the `image` template with `imageUrl`; Firefox always uses `basic`.

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
