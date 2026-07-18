---
name: gemini-power-kit-website-feature-docs
description: Create or update public Gemini Power Kit website feature pages in this repository. Use when Codex is asked to document a new or changed feature on the Astro website, including user-facing feature explanations, screenshots, English and Chinese pages, SEO metadata, sidebar routes, and llms.txt updates.
---

# Gemini Power Kit Website Feature Docs

Create a clear, evidence-based feature page for ordinary Gemini users. Treat the product source as the authority for behavior; use screenshots only to explain visible UI.

## Required Discovery

1. Read `website/AGENTS.md` and inspect the current website structure before editing.
2. Inspect the relevant feature entry point, settings/storage, tests, and any relevant file in `docs/`. Use `rg` first to locate them.
3. Write a short internal evidence sheet before drafting: user-facing name, entry location, main workflow, settings/on-off path, important limits, safety consequences, and exact labels. Do not infer behavior from a screenshot alone.
4. Inspect a nearby feature page and `website/astro.config.mjs` for current page, locale, and sidebar conventions.

## Outline and Image Gate

Before updating website content, give the user a proposed outline and an image plan. Map every image to exactly one role:

- **Entry image:** where the user starts the feature.
- **Feature panel image:** the controls or main working state.
- **Settings image:** how to enable or disable the feature, when that path needs visual explanation.
- **Result/progress image:** the completion state, only when it materially clarifies the outcome.

For each image, state the intended caption, what it proves, and its local path. Reuse an existing local asset only when it depicts the exact feature and state being described.

If a required image does not exist locally, stop and ask the user to provide it. Do not fabricate UI, repurpose an unrelated screenshot, or silently omit a promised visual. Continue after the user provides assets or explicitly agrees to a no-image page.

## Write the Page

1. Create or update `website/src/content/docs/features/<slug>.mdx` and the aligned Chinese page under `website/src/content/docs/zh-cn/features/`. Update `website/astro.config.mjs` for a new route.
2. Keep English and Chinese headings, feature coverage, image roles, and safety notes aligned. Write both unless the user explicitly narrows the locale scope.
3. Explain the feature in this order when applicable: what it does, where to find it, how to use it, what each important control does, common scenarios, how to turn it on or off, and limits or irreversible actions.
4. Write for ordinary users. Use direct verbs, exact visible labels, short steps, and a concrete example for concepts that are not self-evident. Explain technical terms in plain language or omit them.
5. Do not describe a website documentation link as a Gemini product action. Use `https://gemini.google.com` for steps performed in Gemini; label internal website links as guides or related reading.
6. State destructive or irreversible outcomes before the final action. Do not claim that data can be restored unless source evidence confirms it.
7. Give every image precise alt text and a visible caption that identifies its role. Preserve full UI screenshots with an appropriate non-cropping display class when necessary.

## SEO and Discovery Requirements

For every new standalone feature page:

1. Add a concise, query-oriented `title` and `description` in frontmatter without keyword stuffing.
2. Add stable Open Graph and Twitter image metadata using a public asset in `website/public/og/<slug>.*`. If no appropriate share image exists, include it in the image gate.
3. Add page-accurate `TechArticle` JSON-LD: headline, description, canonical production URL, image, language, site, and Gemini Power Kit software context.
4. Use descriptive headings that cover the user intent naturally, such as “how to use”, “turn on or off”, and feature-specific scenarios.
5. Add a concise English feature entry to `website/public/llms.txt` whenever the page introduces a user-discoverable feature. Keep the product summary current when the feature is core enough to belong there.

## Validate Before Handoff

1. Run `./node_modules/.bin/astro build` from `website/`.
2. Run `git diff --check`.
3. Confirm the English and Chinese routes are generated, contain the expected title, image metadata, JSON-LD, and do not contain accidental localhost URLs.
4. Confirm the generated sitemap contains both language routes and `llms.txt` includes the new feature link.
5. Report the page paths, image paths and roles, SEO/discovery updates, and validation result. Do not commit or stage changes unless the user asks.
