# Gemini Power Kit Entry (Content Script)

## Purpose
This module injects a `Gemini Power kit` entry into Gemini's side navigation, right above `Settings & help`.

It supports:
- Desktop side nav (`sidenav-mavatar-footer`, with legacy `side-nav-action-button` fallback)
- Mobile/drawer controls (`button` list in `.mobile-controls`)

Clicking the entry opens the extension Enhancements settings page via `eventBus`.

## File
- `index.ts`: full implementation (DOM injection, sync, observers, tooltip lifecycle)

## How It Works
1. Resolve the Gemini-owned placement anchor (`Settings & help`) and current desktop variant.
2. Render the current mavatar entry as GPK-owned light DOM: container, native button, SVG, styles, tooltip, and click handler.
3. Insert the owned entry before Settings when expanded, or as an aligned rail item above Settings when collapsed.
4. Keep Gemini selectors and placement decisions at the adapter boundary; the entry never clones Gemini's custom elements, Angular attributes, classes, or event behavior.
5. Keep syncing when Gemini rerenders side nav.

## Open Enhancements Settings
The click handler emits:

```ts
eventBus.emitSync('settings:open', {
  from: 'prompt-entrance',
  open: true,
  module: 'enhancements',
})
```

## Tooltip Strategy
- Desktop collapsed state: use `tippy.js` on the owned button, placed to the right.
- Desktop expanded state: use `tippy.js` on the owned button, placed above.
- Mobile entry: keeps native `title` tooltip behavior.
- Desktop tooltips explicitly append to `document.body` so side-nav overflow cannot clip them.

Desktop tooltip config (current):
- `placement: 'right'` when collapsed, `'top'` when expanded
- `appendTo: () => document.body`
- `animation: 'shift-away-subtle'`
- `arrow: false`
- `duration: [null, 0]`

## Stability and Lifecycle
To survive Gemini UI rerenders:
- Multiple `MutationObserver`s watch layout, side nav, desktop list, desktop settings attrs, and mobile controls.
- Sync is debounced with `requestAnimationFrame`.
- Bootstrap retries are scheduled when anchors are temporarily missing.

Tooltip lifecycle safety:
- Reuse existing instance when possible.
- Destroy on variant switch (`collapsed -> expanded`).
- Destroy on host replacement/removal.
- Sweep detached/out-of-scope instances every sync.
- Global cleanup on `beforeunload`, including observers, tooltip instances, injected DOM, and module-owned styles.

## Key Selectors / Test IDs
- Desktop settings anchor:
  - `gem-icon-button[data-test-id="mavatar-footer-settings-button"]`
  - `button[data-test-id="mavatar-footer-settings-button"]`
  - Legacy fallback: `side-nav-action-button[data-test-id="settings-and-help-button"]`
- Mobile settings anchor:
  - `button[data-test-id="mobile-settings-and-help-control"]`
- Injected desktop entry:
  - `[data-test-id="gemini-power-kit-mavatar-container"]`
  - `button[data-test-id="gemini-power-kit-button"]`
  - `side-nav-action-button[data-test-id="gemini-power-kit-button"]`
- Injected mobile entry:
  - `button[data-test-id="mobile-gemini-power-kit-control"]`

## Maintenance Notes
- Do not rely on visible text matching; structure selectors are primary.
- Gemini dependencies stop at placement and variant detection. Do not clone Gemini controls for the current mavatar entry.
- Keep the owned host/button geometry aligned with Gemini (`32px` host, `36px` button, `20px` icon box).
- Avoid re-binding click listeners: guarded by `data-gpk-bound`.
- If Gemini updates DOM structure, update anchor selectors first.
- Current desktop layout uses `.mavatar-footer-row.collapsed` for the rail state and a non-collapsed footer row for expanded state.

## Quick Verification Checklist
1. Desktop collapsed: entry appears above `Settings & help`.
2. Desktop collapsed hover: tooltip appears to the right and is not clipped by the side nav.
3. Desktop collapsed click: tooltip hides immediately and the Enhancements page opens.
4. Desktop expanded: entry is aligned immediately before Settings and its tooltip appears above.
5. Mobile/drawer: entry exists with icon + label, click opens the Enhancements page.
6. Refresh/resize/expand-collapse loops do not duplicate entry.
