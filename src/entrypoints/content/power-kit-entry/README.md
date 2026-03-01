# Gemini Power Kit Entry (Content Script)

## Purpose
This module injects a `Gemini Power kit` entry into Gemini's side navigation, right above `Settings & help`.

It supports:
- Desktop side nav (`side-nav-action-button`)
- Mobile/drawer controls (`button` list in `.mobile-controls`)

Clicking the entry opens the extension theme settings panel via `eventBus`.

## File
- `index.ts`: full implementation (DOM injection, sync, observers, tooltip lifecycle)

## How It Works
1. Find the reference node (`Settings & help`) on desktop and mobile.
2. Clone that node to preserve native layout/class/style.
3. Replace icon/text/attrs to become `Gemini Power kit`.
4. Insert the cloned entry right before `Settings & help`.
5. Keep syncing when Gemini rerenders side nav.

## Open Theme Settings
The click handler emits:

```ts
eventBus.emitSync('settings:open', {
  from: 'prompt-entrance',
  open: true,
  module: 'theme',
})
```

## Tooltip Strategy
- Desktop collapsed state: use `tippy.js` tooltip with `gemini-tooltip` theme.
- Desktop expanded state: no tooltip.
- Mobile entry: keeps native `title` tooltip behavior.

Desktop tooltip config (current):
- `placement: 'top'`
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
- Global cleanup on `beforeunload`.

## Key Selectors / Test IDs
- Desktop settings anchor:
  - `side-nav-action-button[data-test-id="settings-and-help-button"]`
- Mobile settings anchor:
  - `button[data-test-id="mobile-settings-and-help-control"]`
- Injected desktop entry:
  - `side-nav-action-button[data-test-id="gemini-power-kit-button"]`
- Injected mobile entry:
  - `button[data-test-id="mobile-gemini-power-kit-control"]`

## Maintenance Notes
- Do not rely on visible text matching; structure selectors are primary.
- Keep icon size aligned with Material icon button sizing (`20px` in collapsed desktop).
- Avoid re-binding click listeners: guarded by `data-gpk-bound`.
- If Gemini updates DOM structure, update anchor selectors first.

## Quick Verification Checklist
1. Desktop collapsed: entry appears above `Settings & help`.
2. Desktop collapsed hover: tooltip appears at top and hides on mouse leave.
3. Desktop collapsed click: tooltip hides immediately and theme panel opens.
4. Desktop expanded: label is visible and no tooltip is shown.
5. Mobile/drawer: entry exists with icon + label, click opens theme panel.
6. Refresh/resize/expand-collapse loops do not duplicate entry.
