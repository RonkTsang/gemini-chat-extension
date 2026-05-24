# Glass Transparency Feedback

## Context

After the Gemini adaptation in `3134ba7`, a user reported that the glass effect looks less transparent than before, even when the wallpaper blur value is set to `0`.

User later clarified:

```text
Sure you can dm me or if you have a discord better! Also i was JUST about to ask you about the chat box being white when it was transparent... i rathered transparent... and i meant specially chat bubbles but i love more transparent sidebar too
So yes is indeed whiter and i liked more transparent before even in sidebar Im weird my setting made it hard to read on sidebar but i didnt care
```

## User Impact

- User mainly means message bubbles.
- User also noticed the input/chat box became white instead of transparent.
- User also prefers a more transparent sidebar, even if sidebar readability becomes worse.
- The current `Blur` slider only controls wallpaper blur, not glass surface opacity, which can be confusing.

## Affected Areas

- Message glass effect setting:
  `src/components/setting-panel/views/theme/CustomBackground.tsx`
- User message bubble glass:
  `src/entrypoints/content/gemini-theme/background/style.css`
  - `user-query user-query-content span.user-query-bubble-with-background`
- Model response glass:
  `src/entrypoints/content/gemini-theme/background/style.css`
  - `model-response response-container > div.response-container`
- Input/chat box glass:
  `src/entrypoints/content/gemini-theme/background/style.css`
  - `input-container input-area-v2`
- Sidebar glass/scrim:
  `src/entrypoints/content/gemini-theme/background/style.css`
  - `bard-sidenav-container > bard-sidenav`
  - `--gpk-sidebar-scrim-alpha`

## Current Findings

- `3134ba7` did not directly change the glass opacity CSS percentages.
- `3134ba7` did update theme color variables used underneath the glass surfaces.
- In light theme, several presets changed `--gem-sys-color--surface-container-high` to lighter/whiter colors:
  - Example: orange changed from `--theme-50` (`#ffe7d9`) to `--theme-25` (`#fff5f0`).
- In dark theme, the same variable generally became darker:
  - Example: `--theme-700` to `--theme-900`.
- The user's "whiteish" report is most consistent with light theme plus a dark/warm wallpaper.

## SideNav Findings

SideNav glass is implemented in:

```css
:root[data-gpk-bg-enabled="true"] bard-sidenav-container>bard-sidenav {
  background: color-mix(in srgb, var(--bard-color-sidenav-background-desktop), transparent 60%) !important;
  backdrop-filter: blur(10px);
}
```

The SideNav glass percentage itself was not changed in `3134ba7`; it still mixes the base color with `transparent 60%`, and still applies `blur(10px)`.

However, `3134ba7` changed the SideNav base color for the warm/light presets:

| Preset | Before | After | Impact |
|---|---|---|---|
| green | `--theme-a25` (`#04b84c14`) | `--theme-25` (`#edfaf2`) | Much less transparent / much whiter |
| orange | `--theme-a25` (`#fb6a2212`) | `--theme-25` (`#fff5f0`) | Much less transparent / much whiter |
| pink | `--theme-a25` (`#ff66ad14`) | `--theme-25` (`#fff4f9`) | Much less transparent / much whiter |
| purple | `--theme-a25` (`#924ff70f`) | `--theme-25` (`#f9f5fe`) | Much less transparent / much whiter |
| red | `--theme-a25` (`#fa423e14`) | `--theme-25` (`#fff0f0`) | Much less transparent / much whiter |
| yellow | `--theme-a25` (`#ffc30014`) | `--theme-25` (`#fffbed`) | Much less transparent / much whiter |

This is a real transparency regression for those presets. Before `3134ba7`, the base color already had a very low alpha value (`0x0f`-`0x14`, roughly 6%-8% alpha). After being mixed with `transparent 60%`, the final SideNav layer was only around 2%-3% opacity. After `3134ba7`, the base color is fully opaque, so the same `transparent 60%` mix produces roughly 40% opacity.

The cyan, gray, and teal light presets did not change `--bard-color-sidenav-background-desktop`; they already used:

```css
--bard-color-sidenav-background-desktop: color-mix(in srgb, var(--theme-50), white 30%);
```

Dark theme SideNav did not materially change in this commit. It is still overridden by:

```css
:root[data-gpk-bg-enabled="true"] body.dark-theme bard-sidenav-container>bard-sidenav,
:root[data-gpk-bg-enabled="true"] :where(.theme-host):where(.dark-theme) bard-sidenav-container>bard-sidenav {
  background-color: color-mix(in srgb, var(--theme-600), transparent 80%) !important;
}
```

The sidebar readability scrim is separate from SideNav base transparency:

```css
:root[data-gpk-bg-enabled="true"][data-gpk-sidebar-scrim-enabled="true"] bard-sidenav-container>bard-sidenav {
  box-shadow: inset 0 0 0 9999px rgb(255 255 255 / var(--gpk-sidebar-scrim-alpha));
}
```

Default scrim intensity is `20`, so light mode can add another 20% white overlay on top of the SideNav background. This existed before `3134ba7`, but it makes the new opaque `--theme-25` SideNav base feel even whiter. The current scrim control can reduce or remove this white overlay, but it does not restore the old ultra-transparent SideNav base color.

## Product Direction

Decision:

- Restore the old SideNav transparency behavior for light presets that support `--theme-a25`.
  - Scope: wallpaper-enabled SideNav only.
  - Use `--theme-a25` as the SideNav glass base when available.
  - Keep cyan, gray, teal, and dark theme behavior unchanged unless further testing shows a regression.
- Fix `input-area-v2` glass background being overridden by Gemini's new UI rules.
  - Current observed behavior: our selector matches and `backdrop-filter: blur(10px)` applies, but the computed background stays `rgb(255, 255, 255)`.
  - Cause: Gemini's `.ui-improvements-phase-1...:has(.text-input-field.simplified-input-area)` / `.lm-input-redesign` background rules have higher specificity than our `input-container input-area-v2` background rule.
  - Expected behavior: input/chat box background should use the configured glass transparent color, not opaque white.
- When `Message Glass Effect` is enabled, add two independent sliders:
  - `Glass transparency`
  - `Glass blur`
- Do not overload the existing wallpaper `Blur` slider.
  - Existing `Blur` continues to control only wallpaper/background image blur.
  - New glass sliders control glass surfaces under `Message Glass Effect`.

Product scope:

- The new glass sliders should target only message surfaces:
  - user message bubbles
  - model responses
- The new glass sliders should not control:
  - edit message box
  - input/chat box (`input-area-v2`)
  - intent cards
- SideNav transparency is not part of the two new glass sliders for this fix. The current target is to restore old SideNav behavior first.

Implementation note:

- Current glass defaults are not uniform across all surfaces:
  - user bubble/edit box: `transparent 40%`; blur Light `20px`, Dark `10px`
  - model response: Light `transparent 40%`, Dark `transparent 90%`; blur `20px`
  - input/chat box and intent card: `transparent 40%`; blur `10px`
- Use two independent customized flags:
  - `messageGlassTransparencyCustomized`
  - `messageGlassBlurCustomized`
- Before customization, preserve legacy per-surface values:
  - Dark model response keeps `transparent 90%`.
  - Dark user message keeps `blur(10px)`.
- After the user changes a slider, apply that slider value as an absolute value across user/model message surfaces.
  - Customized transparency uses the same percentage for user messages, model responses, and dual model responses.
  - Customized blur uses the same px value for user messages, model responses, and dual model responses.
- Add `Reset glass settings`.
  - Reset restores legacy behavior by setting both customized flags to `false`.
  - Reset restores slider values to `Glass transparency = 40` and `Glass blur = 20`.
- SideNav transparency and sidebar readability scrim remain independent.
  - This iteration restores old SideNav transparency behavior but does not expose a SideNav transparency slider.
- UI copy uses `Glass transparency` and `Glass blur`.
- `dual-model-response` belongs to the model response family for the new sliders.

## Open Questions

- None for the current scope.

## Follow-up

- User agreed to DM and also mentioned Discord as a preferred channel.
- Confirm screenshots/settings before implementing:
  - theme preset
  - light/dark mode
  - wallpaper image type
  - current wallpaper blur value
  - message glass enabled state
- Requirements doc:
  `docs/feature/theme/glass-effect-controls-prd.md`
