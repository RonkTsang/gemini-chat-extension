---
name: whats-new-updater
description: Create or update Gemini Power Kit What's New releases. Use when Codex needs to plan or implement a What's New update for /Users/ronktsang/projects/gemini-chrome-plugin, including mandatory user confirmation of the promo image plan, mandatory user confirmation of whether to overwrite or append the existing config, 750x180 asset validation, concise release-note copy, locale updates via an i18n subagent, and code changes in src/entrypoints/content/overlay/whats-new/config.ts plus src/locales/*.json.
---

# What's New Updater

## Goal

Create a complete Gemini Power Kit What's New update: decide the promo image path, draft concise product copy, localize it, update code, and validate the result.

Core product direction: show how the feature makes the Gemini experience better. Keep the update practical, calm, and immediately understandable inside a small toast.

## Required Context

Work in `/Users/ronktsang/projects/gemini-chrome-plugin` unless the user gives another checkout.

Inspect these files before changing code:

- `src/entrypoints/content/overlay/whats-new/config.ts`
- `src/entrypoints/content/overlay/whats-new/WhatsNewToast.tsx`
- `src/locales/en.json`
- `src/locales/zh_CN.json`
- Existing files under `src/assets/whatsnew/`

## Workflow

1. Clarify the update target: feature name, feature slug, user-facing benefit, intended CTA destination, and whether there is an input image.
2. Run the image workflow and stop for explicit user confirmation of the image plan. See `references/asset-workflow.md`.
3. Draft the English and Chinese baseline copy, then use an i18n subagent for the remaining locales. See `references/copy-and-i18n.md`.
4. Inspect the current What's New config and stop for explicit user confirmation of overwrite vs append. See `references/code-update.md`.
5. Update assets, config imports, release-note entries, and locale keys.
6. Run validation:
   - `python /Users/ronktsang/projects/gemini-chrome-plugin/.agents/skills/whats-new-updater/scripts/check_whats_new.py --repo /Users/ronktsang/projects/gemini-chrome-plugin`
   - `pnpm run check:i18n` if `pnpm` is available; otherwise `node scripts/check-i18n.js`.
   - Run `pnpm compile` when TypeScript config or imports changed.

## Hard Confirmation Gates

Do not skip these gates. Do not treat a likely user preference, prior discussion, or implied intent as confirmation.

1. Image plan gate: before using, resizing, regenerating, or creating a promo image, summarize the chosen image path as one of `no image`, `use provided image directly`, `regenerate from provided image`, or `generate new image`, include the proposed visual type/content when relevant, and wait for the user to approve.
2. Config handling gate: after inspecting existing `CURRENT_RELEASE_NOTES`, ask whether to `overwrite` or `append`, summarize what will happen to existing release-note entries and locale keys, and wait for the user to approve.

Only continue past a gate after the user gives a clear answer for that gate.

## Image Workflow Rules

- If the user provided no image, ask whether they need a promo image. If no, confirm the image plan as `no image` before continuing.
- If the user provided an image, ask whether to use it directly or regenerate from it, then confirm the selected path before touching the image.
- If using directly, validate and resize/crop to `750x180` as needed before adding it to `src/assets/whatsnew/`.
- If regenerating or creating a new image, ask the user to choose a visual type and present a short content proposal for each relevant option:
  - single object close-up
  - abstract feature icon plus minimal state
  - local UI crop
  - before/after comparison
  - brand atmosphere plus one functional symbol
- Confirm the selected image idea before calling the `imagegen` skill. This confirmation is mandatory.
- When using `imagegen`, follow `/Users/ronktsang/.codex/skills/.system/imagegen/SKILL.md`. Save final project-bound images into `src/assets/whatsnew/`; never leave referenced assets only under `$CODEX_HOME/generated_images`.

## Copy Rules

Each release note has exactly three user-facing fields:

- `title`: one user benefit. English 4-8 words. Chinese 8-14 characters when possible.
- `description`: one concrete change. English 90-140 characters. Chinese 35-60 characters.
- `action`: short verb CTA. English 2-4 words. Chinese 2-5 characters.

Avoid changelog phrasing such as "Added support for..." or technical mechanism copy. Prefer direct product value.

## Code Update Rules

- Use `featureSlug` in camelCase for locale object keys and kebab-case for image filenames.
- Prefer local imported assets from `src/assets/whatsnew/`.
- Keep `CURRENT_RELEASE_NOTES` to at most 2 entries.
- For overwrite mode, remove old release-note entries, unused image imports, and obsolete `whatsnew.<key>` locale blocks only after the config handling gate is approved.
- For append mode, keep existing entries and add the new one after them only after the config handling gate is approved.
- Keep unrelated local changes intact.

## References

- `references/asset-workflow.md`: image decision tree, visual patterns, and generation prompt shape.
- `references/copy-and-i18n.md`: copy tone, examples, and i18n subagent instructions.
- `references/code-update.md`: repo-specific edit and validation checklist.
