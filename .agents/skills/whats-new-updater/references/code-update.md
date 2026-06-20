# Code Update Workflow

## Repo Paths

Default repo:

```text
/Users/ronktsang/projects/gemini-chrome-plugin
```

Primary files:

- `src/entrypoints/content/overlay/whats-new/config.ts`
- `src/entrypoints/content/overlay/whats-new/WhatsNewToast.tsx`
- `src/assets/whatsnew/`
- `src/locales/*.json`

## Pre-edit Inspection

Run:

```bash
git status --short --branch
sed -n '1,140p' src/entrypoints/content/overlay/whats-new/config.ts
find src/assets/whatsnew -maxdepth 1 -type f -print
```

Inspect existing `whatsnew` blocks in `en.json` and `zh_CN.json`. Always ask the user to confirm overwrite vs append before editing release-note config or locale keys. Do this even when the request appears to imply one mode.

```text
Current config: <brief summary of existing CURRENT_RELEASE_NOTES entries>
Config handling: should this overwrite the current What's New item(s), or append as another item in the toast?
Impact:
- overwrite: remove old release-note config entries and obsolete locale keys
- append: keep existing entries and add this item, as long as the toast stays at 2 items or fewer
Please confirm overwrite or append before I edit the config.
```

Do not change `CURRENT_RELEASE_NOTES`, imports, image references, or `whatsnew.<feature>` locale blocks until this confirmation is received.

## Config Pattern

Use local asset imports:

```ts
import notificationImagePath from '@/assets/whatsnew/notification.webp'
```

Use camelCase locale keys:

```ts
{
  titleKey: 'whatsnew.notification.title',
  descriptionKey: 'whatsnew.notification.description',
  actionLabelKey: 'whatsnew.notification.action',
  promoImagePath: notificationImagePath,
  promoAction: {
    action: 'setting-panel',
    params: {
      tab: 'notification',
    },
  },
}
```

Use `theme-floating-panel` only for opening the theme floating panel. Use `setting-panel` for settings sections registered in `src/components/setting-panel/config.ts`.

## Overwrite Mode

When overwriting:

1. Replace `CURRENT_RELEASE_NOTES` entries with the new item or items.
2. Remove unused image imports from `config.ts`.
3. Remove obsolete `whatsnew.<oldFeature>` locale blocks from every `src/locales/*.json`.
4. Keep shared keys such as `whatsnew.title` and `whatsnew.releaseNotes`.

## Append Mode

When appending:

1. Add the image import.
2. Add the new release-note entry after existing entries unless the user requests a different order.
3. Add the new `whatsnew.<featureSlug>` block to every locale file.
4. Confirm there are no more than 2 `CURRENT_RELEASE_NOTES` entries. If there would be 3+, ask which item to remove or convert the task to overwrite mode.

## Validation

Run:

```bash
python /Users/ronktsang/projects/gemini-chrome-plugin/.agents/skills/whats-new-updater/scripts/check_whats_new.py --repo /Users/ronktsang/projects/gemini-chrome-plugin
pnpm run check:i18n
pnpm compile
```

If `pnpm` is unavailable, run:

```bash
node scripts/check-i18n.js
./node_modules/.bin/tsc --noEmit
```

Report any command that could not run and why.
