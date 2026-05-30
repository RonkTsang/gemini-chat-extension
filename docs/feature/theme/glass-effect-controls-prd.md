# Glass Effect Controls

| **Document Version** | **V1.0** |
| :--- | :--- |
| **Feature Name** | Glass Effect Controls |
| **Created Date** | May 24, 2026 |
| **Status** | Not Implemented |

## 1. Background

After the Gemini adaptation in `3134ba7`, a user reported that glass surfaces became less transparent and more white, especially message bubbles, the input/chat box, and SideNav.

The existing wallpaper `Blur` slider only controls wallpaper/background image blur. It does not control message glass transparency or message glass blur, which makes the UI confusing when users expect `0` blur to make glass surfaces clearer or more transparent.

The investigation found three separate technical issues:

1. SideNav light warm presets no longer use the old low-alpha `--theme-a25` base color.
2. `input-area-v2` matches our glass selector, but Gemini's newer input background rules override our transparent background.
3. Message-related glass surfaces use fixed transparency and blur values, with different defaults across Light/Dark and user/model messages.

## 2. Goals

1. Restore old SideNav transparency behavior for themes that support `--theme-a25`.
2. Make `input-area-v2` actually render as glass when `Message Glass Effect` is enabled.
3. Add two independent controls under `Message Glass Effect`:
   - `Glass transparency`
   - `Glass blur`
4. Keep wallpaper blur separate from glass controls.
5. Preserve current visual defaults until the user customizes the new controls.

## 3. Non-Goals

1. Do not make SideNav transparency part of the new message glass sliders in this iteration.
2. Do not make input box, edit box, or intent card glass part of the new sliders in this iteration.
3. Do not add separate Light/Dark sliders in the first version.
4. Do not change wallpaper image blur behavior.

## 4. Affected Surfaces

### 4.1 SideNav

Selector:

```css
bard-sidenav-container > bard-sidenav
```

Current SideNav glass rule:

```css
:root[data-gpk-bg-enabled="true"] bard-sidenav-container>bard-sidenav {
  background: color-mix(in srgb, var(--bard-color-sidenav-background-desktop), transparent 60%) !important;
  backdrop-filter: blur(10px);
}
```

Required behavior:

- In wallpaper-enabled Light theme, if the active theme defines `--theme-a25`, SideNav glass should use `--theme-a25` as its base color.
- This restores the old ultra-transparent behavior for warm presets such as green, orange, pink, purple, red, and yellow.
- If `--theme-a25` is not defined, keep the existing `--bard-color-sidenav-background-desktop` fallback.
- Do not change Dark theme SideNav behavior in this iteration.
- Keep sidebar readability scrim as a separate control.

Implementation direction:

```css
:root[data-gpk-bg-enabled="true"] :where(.theme-host):where(.light-theme) {
  --gpk-sidenav-glass-base: var(--theme-a25, var(--bard-color-sidenav-background-desktop));
}

:root[data-gpk-bg-enabled="true"] bard-sidenav-container>bard-sidenav {
  background: color-mix(
    in srgb,
    var(--gpk-sidenav-glass-base, var(--bard-color-sidenav-background-desktop)),
    transparent 60%
  ) !important;
  backdrop-filter: blur(10px);
}
```

### 4.2 Message Glass Slider Surfaces

The new `Glass transparency` and `Glass blur` sliders apply only to:

- User message bubble:
  `user-query user-query-content span.user-query-bubble-with-background`
- Model response:
  `model-response response-container > div.response-container`
- Dual model response:
  `dual-model-response`

The following surfaces may still need glass rendering fixes, but they are not controlled by these two sliders:

- User edit message box:
  `div.query-content.edit-mode div.edit-container > mat-form-field > div.mat-mdc-text-field-wrapper`
- Input/chat box:
  `input-container input-area-v2`
- Intent cards:
  `intent-card > button`

## 5. Settings

Extend `ThemeBackgroundSettings` with:

```ts
messageGlassTransparency: number
messageGlassBlurPx: number
messageGlassTransparencyCustomized: boolean
messageGlassBlurCustomized: boolean
```

Default values:

```ts
messageGlassTransparency: 40
messageGlassBlurPx: 20
messageGlassTransparencyCustomized: false
messageGlassBlurCustomized: false
```

Constraints:

- `messageGlassTransparency`: integer, `0-100`
  - `0` means fully opaque glass base.
  - `100` means fully transparent glass base.
- `messageGlassBlurPx`: integer, `0-20`
  - `0` disables message glass blur.
  - `20` is the current common maximum/default blur.

Normalization:

- Missing values should fall back to defaults.
- Invalid values should be clamped to the supported range.
- Existing users should migrate with both customized flags set to `false`.
- When `messageGlassTransparencyCustomized` is `false`, legacy transparency defaults remain visually unchanged.
- When `messageGlassBlurCustomized` is `false`, legacy blur defaults remain visually unchanged, including Dark user message blur `10px`.

## 6. UI Requirements

Location:

- Theme settings
- Wallpaper section
- Visible only when wallpaper is enabled and `Message Glass Effect` is enabled

Controls:

1. `Message Glass Effect`
   - Existing switch.
2. `Glass transparency`
   - Slider, `0-100`, step `1`
   - Show percent value.
   - Higher value means more transparent.
3. `Glass blur`
   - Slider, `0-20`, step `1`
   - Show `px` value.
   - Higher value means more blur.

Interaction:

- The existing wallpaper `Blur` slider remains unchanged and should continue to control only `backgroundBlurPx`.
- Moving `Glass transparency` sets `messageGlassTransparencyCustomized` to `true`.
- Moving `Glass blur` sets `messageGlassBlurCustomized` to `true`.
- `Reset glass settings` restores legacy defaults:
  - `messageGlassTransparency = 40`
  - `messageGlassBlurPx = 20`
  - `messageGlassTransparencyCustomized = false`
  - `messageGlassBlurCustomized = false`
- If `Message Glass Effect` is disabled, hide the new sliders and do not apply message glass CSS.
- Re-enabling `Message Glass Effect` should reuse the previously saved glass slider values.

Copy:

- English:
  - `Glass transparency`
  - `Glass blur`
- Chinese:
  - `玻璃透明度`
  - `玻璃模糊`

## 7. CSS Mapping

Expose root CSS variables from `applyThemeBackgroundStyle`:

```css
--gpk-msg-glass-transparency: 40%;
--gpk-msg-glass-blur: 20px;
--gpk-msg-glass-transparency-customized: 0;
--gpk-msg-glass-blur-customized: 0;
```

When `messageGlassTransparencyCustomized` is `false`, keep legacy per-surface transparency defaults:

| Surface | Light transparency | Dark transparency |
|---|---:|---:|
| User bubble | `40%` | `40%` |
| Model response | `40%` | `90%` |
| Dual model response | `40%` | `60%` |

When `messageGlassTransparencyCustomized` is `true`, apply the user's transparency value consistently to user/model message surfaces:

```css
background-color: color-mix(
  in srgb,
  var(--surface-token),
  transparent var(--gpk-msg-glass-transparency)
) !important;
```

When `messageGlassBlurCustomized` is `false`, keep legacy per-surface blur defaults:

| Surface | Light blur | Dark blur |
|---|---:|---:|
| User bubble | `20px` | `10px` |
| Model response | `20px` | `20px` |
| Dual model response | `20px` | `20px` |

When `messageGlassBlurCustomized` is `true`, apply the user's blur value consistently to user/model message surfaces:

```css
backdrop-filter: blur(var(--gpk-msg-glass-blur));
```

The old Dark user message blur is `10px`. This is preserved until the user customizes `Glass blur`. After customization, `Glass blur` is an absolute, predictable value across user and model messages. Users who prefer the older lower-blur Dark user message look can set `Glass blur` to `10px`.

For `input-area-v2`, the background rule must be strong enough to override Gemini's new UI input rules. This fix should use the current fixed input glass defaults, not the new user/model message slider values:

```css
:root[data-gpk-bg-enabled="true"][data-gpk-msg-glass="true"] input-container input-area-v2 {
  background-color: color-mix(
    in srgb,
    var(--gem-sys-color--surface-bright),
    transparent 40%
  ) !important;
  backdrop-filter: blur(10px);
}
```

`input-area-v2` is fixed to restore transparent glass rendering, but it is not controlled by the `Glass transparency` and `Glass blur` sliders in this iteration.

## 8. Acceptance Criteria

1. SideNav Light warm presets with wallpaper enabled use the old `--theme-a25`-based transparent look.
2. SideNav cyan, gray, teal, and Dark theme behavior do not regress.
3. With `Message Glass Effect` enabled, `input-area-v2` computed background is no longer opaque white.
4. Wallpaper `Blur = 0` does not disable message glass blur; only customized `Glass blur = 0` does.
5. Existing users keep legacy message transparency defaults until they move the transparency slider.
6. Existing users keep legacy message blur defaults until they move the blur slider, including Dark user message blur `10px`.
7. Moving `Glass transparency` visibly changes user/model message glass background opacity.
8. Moving `Glass blur` visibly changes user/model message glass blur to the same absolute value without changing wallpaper blur.
9. `Reset glass settings` restores legacy transparency/blur behavior by clearing both customized flags.
10. Settings persist across reloads and normalize invalid values.

## 9. Test Plan

Manual checks:

1. Light warm preset, wallpaper enabled, SideNav should be close to pre-`3134ba7` transparency.
2. Light warm preset, `Message Glass Effect` enabled, input/chat box should not be opaque white.
3. Drag `Glass transparency` from `40` to `90`; user/model messages should become more transparent.
4. Drag `Glass blur` from `20` to `0`; user/model message glass should become sharp while wallpaper blur remains unchanged.
5. Dark user message blur should stay at legacy `10px` before blur slider customization.
6. After moving `Glass blur` to `20`, Dark user message blur should become `20px`.
7. Dark model response should preserve legacy `90%` transparency before slider customization.
8. After moving `Glass transparency` to `40`, Dark model response transparency should become `40%`.
9. `Reset glass settings` should restore Dark user blur `10px` and Dark model transparency `90%`.

Automated checks:

1. Extend background settings normalization tests for the new fields.
2. Extend style controller tests for root CSS variables.
3. Add CSS regression coverage where practical for `input-area-v2` requiring `!important`.
4. Run `pnpm test:run` and `pnpm compile`.
