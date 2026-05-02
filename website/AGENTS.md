# AGENTS.md (website)

This directory contains the documentation website for Gemini Power Kit.
It is built with Astro and the Starlight docs framework.

## Scope

These instructions apply only to the `website/` subtree.

## Commands (run inside `website/`)

- Install deps from repo root: `pnpm install`
- Dev server: `pnpm run dev` (http://localhost:4321)
- Build: `pnpm run build`
- Preview build: `pnpm run preview`

## Structure

- Content: `src/content/docs/` (Markdown/MDX)
- Chinese translations: `src/content/docs/zh-cn/`
- Assets: `src/assets/`
- Public static files: `public/`
- Styles: `src/styles/custom.css`
- Site config + sidebar + locales: `astro.config.mjs`

## Content Rules

- Preserve frontmatter at the top of `.md`/`.mdx` files.
- Keep slugs consistent with file paths and the sidebar config.
- When adding pages, update the `sidebar` in `astro.config.mjs`.
- For translations, keep the same structure under `zh-cn/` and align
  headings and key content with the English source.

## Notes for Agents

- Prefer minimal, targeted edits; avoid broad rewrites of marketing copy
  unless requested.
- Do not edit generated files or `node_modules/`.
