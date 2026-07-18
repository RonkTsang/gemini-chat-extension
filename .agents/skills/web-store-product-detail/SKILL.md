---
name: web-store-product-detail
description: Create, revise, review, or localize Gemini Power Kit Web Store product-detail copy in this repository. Use when a feature must be added to or rewritten in docs/web-store/product_detail/, including product positioning, English and Chinese draft approval, SEO-aware feature copy, i18n-subagent localization, and character-limit or locale-parity validation.
---

# Web Store Product Detail

Create precise, concise product-detail copy for the shared Web Store listing. Treat it as product information design, not a changelog or a literal translation exercise.

## Scope

- Product-detail copy lives in `docs/web-store/product_detail/` and is shared across browser listings. Do not frame it as Chrome-only unless the user explicitly asks for browser-specific copy.
- Keep browser-specific permission or privacy rationale in its dedicated documentation, not in product-detail copy.
- Preserve unrelated local changes. Do not stage or commit unless the user asks.

## Discover the Product Facts

Before drafting, inspect the existing English and Simplified Chinese product-detail files, then use `rg` to find the relevant feature documentation, entry point, tests, and user-visible locale strings.

Write a short internal evidence sheet containing:

- the user's job to be done and the feature's differentiator;
- exact visible labels, entry path, controls, supported values, and limits;
- destructive or irreversible consequences, confirmations, and progress feedback;
- any mismatch between requirements and current implementation.

Treat current user-visible implementation and tests as the authority. If a PRD or feature document conflicts with them, explain the discrepancy to the user before drafting; do not advertise the stale behavior.

## Draft and Review Gate

Do not edit product-detail files until the user confirms the English and Simplified Chinese baseline drafts.

For each proposed feature section:

1. Write one title and one value sentence. State the user outcome once; do not restate it in every bullet.
2. Use at most two feature bullets. Make them mutually distinct by user task or workflow stage.
3. Express each bullet as a user result followed by observable proof: exact control, supported value, or visible feedback.
4. Lead with the strongest differentiator when it matches the user's need. Use claims such as “faster” only when a real mechanism proves them. Do not use unsupported capability, safety, or competitor claims.
5. Use search terms naturally (for example, Gemini, chat history, bulk delete); do not keyword-stuff.

With the draft, report the intended insertion point and the projected character count for both baselines. If a product-detail file would exceed 3,500 characters, merge overlapping dimensions instead of trimming away a material capability.

## Localize After Approval

After the user approves the baseline, use the project i18n writer subagent for every supported locale in `docs/web-store/product_detail/`. Give it the approved baseline, insertion point, scope ownership, and the 3,500-character limit.

The locale set is derived from `src/locales/*.json`, not from a guessed list or only the already-edited files. Keep the new feature in the same relative location in every product-detail file. The main agent must review the resulting diff for lost capabilities or meaning caused by compression and send specific corrections back to the i18n subagent when needed.

## Validate Before Handoff

Run:

```bash
python .agents/skills/web-store-product-detail/scripts/check_product_detail.py --repo .
git diff --check
```

Also inspect the product-detail diff to confirm:

- the approved English and Simplified Chinese text is unchanged;
- each translation has the new section in the intended position;
- every approved, material capability remains represented;
- each feature section has no more than two bullets.

Report the edited files, the character-limit result, locale-parity result, and any user-visible limitation that shaped the copy.
