# AGENTS.md - Agent Coding Guidelines

This document provides guidelines for agentic coding agents operating in this repository.

## Project Overview

This is a WXT-based MV3 browser extension using React and Chakra UI v3. The source code lives under `src/`, and WXT generates the final manifest at build time from `wxt.config.ts`.

---

## Build / Lint / Test Commands

### Install Dependencies
```bash
pnpm install
```
Project uses PNPM (pinned via `packageManager` in `package.json`).

### Development
```bash
pnpm dev            # Chromium-based browser
pnpm dev:firefox    # Firefox
```
Starts WXT in watch mode, loads the extension, and enables live reload.

### Build & Package
```bash
pnpm build          # Build for Chromium
pnpm build:firefox  # Build for Firefox
pnpm zip            # Zip Chromium build
pnpm zip:firefox    # Zip Firefox build
```

### Type Check & Lint
```bash
pnpm compile  # tsc --noEmit
pnpm lint     # alias to compile
```

### Tests (Vitest)
```bash
pnpm test         # Watch mode
pnpm test:run     # Single run
pnpm test:ui      # UI mode
pnpm test:coverage # With coverage
```

Run a **single test file**:
```bash
pnpm test:run src/components/setting-panel/__tests__/some.test.tsx
```

Run tests matching a pattern:
```bash
pnpm test:run --grep "some test name"
```

### i18n Consistency Check
```bash
pnpm run check:i18n
```
Verifies all locale files against English base.

---

## Code Style Guidelines

### General Principles

- **Naming**: Use descriptive names; avoid abbreviations; functions are verbs; variables are nouns
- **Formatting**: Match existing style; wrap long lines; do not reformat unrelated code
- **Comments**: Only for non-obvious rationale, invariants, or caveats; keep concise; always write comments in English

### TypeScript

- **Types**: Annotate exported/public APIs; avoid `any` and unsafe casts
- **Control Flow**: Prefer guard clauses and shallow nesting; avoid unnecessary try/catch and swallow-only handlers

### Imports

- Keep paths aligned with existing alias usage (e.g., `@/utils/...`)
- Example: `import { eventBus } from '@/utils/eventbus'`

---

## Architecture Conventions

### Entry Points (`src/entrypoints/`)
- Content script: `src/entrypoints/content/index.tsx`
- Main-world script: `src/entrypoints/url-monitor-main-world.ts`
- Popup app: `src/entrypoints/popup/`
- Background: `src/entrypoints/background.ts`

### Boot Sequence
1. Content script boots, injects main-world script
2. Starts `urlMonitor` then `chatChangeDetector`
3. Mounts UI overlay via `renderOverlay`

### Data Layer (Dexie/IndexedDB)
- Database: `src/data/db.ts` (name: `gemini_extension`)
- Access via repositories in `src/data/repositories`
- Use zod schemas for validation at repository boundaries
- Domain types in `src/domain`
- Keep timestamps (`createdAt`, `updatedAt`)

### Event Communication
- Use global `eventBus` from `src/utils/eventbus.ts`
- Define event names and types in `src/common/event.ts`
- Example:
  ```ts
  import { eventBus } from '@/utils/eventbus'
  eventBus.on('settings:open', (payload) => { /* ... */ })
  ```

### UI (Shadow DOM + Chakra)
- Mount UI inside Shadow DOM using `Provider` from `src/components/ui/provider-shadow-dom.tsx`
- Use Chakra components and the configured system theme from `src/components/ui/theme`
- Keep UI rendering within the Shadow DOM subtree
- Common modules:
  - Settings panel: `src/components/setting-panel`
  - Toaster: `src/components/ui/toaster.tsx`

### i18n
- Use helper in `src/utils/i18n.ts`: `t(id, substitutions?)`
- Store translation keys in `src/locales/*.json`
- English (`en.json`) is the base; keep keys aligned in other locales

### Multi-Platform Differences
- Before changing Chrome/Firefox-specific behavior, check [`docs/platforms.md`](docs/platforms.md).
- Keep browser-specific code isolated with WXT `include`/`exclude` or `import.meta.env.FIREFOX`.

---

## Error Handling

- Prefer guard clauses over try/catch for control flow
- Avoid swallow-only catch handlers
- Validate inputs with zod schemas at repository boundaries
- Use zod for runtime validation

---

## Testing Guidelines

- Tests use Vitest with happy-dom
- Keep tests colocated with components (e.g., `src/components/setting-panel/__tests__/some.test.tsx`)
- Follow existing test patterns in the codebase

---

## Important Notes

- **Manifest**: Generated from `wxt.config.ts`. Do not edit the legacy root `manifest.json` for WXT builds.
- **Post-install**: `postinstall` runs `wxt prepare` automatically.
- **Legacy files**: See `.cursor/rules/legacy-files-note.mdc` for deprecated files to avoid modifying.
