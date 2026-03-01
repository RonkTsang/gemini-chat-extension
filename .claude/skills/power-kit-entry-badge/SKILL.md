---
name: power-kit-entry-badge
description: Configure and display the notification badge (small red dot) on the Power Kit entry button in the Gemini sidebar. Use when adding new feature announcements, bumping badge version to re-show for all users, or adjusting badge display modes (icon corner vs inline after text).
---

# Power Kit Entry Badge

## Files

- `src/entrypoints/content/power-kit-entry/badge.ts` — storage state (read/dismiss)
- `src/entrypoints/content/power-kit-entry/index.ts` — DOM injection & display logic

## Re-enable the badge after a new feature release

Increment `POWER_KIT_BADGE_VERSION` in `badge.ts`:

```ts
// badge.ts
export const POWER_KIT_BADGE_VERSION = '2'  // was '1'
```

All users (including those who dismissed) will see the dot again on next page load.

## Display modes

The badge supports two modes depending on the sidebar state (`DesktopVariant`):

| State | Mode | Appearance |
|-------|------|-----------|
| `collapsed` | `icon` | Red dot at top-right of `mat-icon` (`position: absolute; top: -3px; right: -3px`) |
| `expanded` | `inline` | Red dot appended after label text (`display: inline-block; margin-left: 6px`) |

The mode is set automatically in `decorateDesktopEntry` based on `variant`. Mobile always uses `icon` mode.

## CSS selectors

```css
/* Collapsed state — icon badge */
[data-gpk-badge="icon"] { position: absolute; top: -3px; right: -3px; ... }

/* Expanded state — inline after text */
[data-gpk-badge="inline"] { display: inline-block; margin-left: 6px; ... }
```

CSS is injected once via `injectBadgeStyle()` (idempotent, keyed by `#gpk-badge-style`).

## State management

```ts
shouldShowBadge()  // checks storage.local['powerKitBadgeSeenVersion'] !== POWER_KIT_BADGE_VERSION
dismissBadge()     // writes current version to storage
```

`badgeVisible` (module-level boolean) is set asynchronously at bootstrap and drives all `ensureBadgeDot` calls. Clicking the button sets `badgeVisible = false`, removes all dots, and calls `dismissBadge()`.

## Bootstrap flow

```ts
shouldShowBadge().then((show) => {
  badgeVisible = show
  if (show) {
    injectBadgeStyle()
    syncEntries()   // re-decorates existing entries to inject dot
  }
})
```
