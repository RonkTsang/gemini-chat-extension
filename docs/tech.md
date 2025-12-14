# Technical Documentation - v0.1.0

**Project Name:** Gemini Power Kit
**Version:** 0.1.0
**Last Updated:** 2025-12-14

## 1. Architecture Overview

This project is a **Manifest V3** Chrome extension built with **WXT**, **React 19**, and **Chakra UI v3**. It is designed to run exclusively on `gemini.google.com`, providing powerful features through a modern, component-based architecture.

### Core Architecture Principles

- **WXT Framework**: Modern browser extension development framework with TypeScript support, hot module replacement, and manifest generation
- **React + TypeScript**: Component-based UI architecture with full type safety
- **Shadow DOM Isolation**: All UI elements are rendered in Shadow DOM to prevent style conflicts with the host page
- **Event-Driven Architecture**: Uses a centralized event bus for cross-module communication
- **Layered Design**: Clear separation between UI, services, data layer, and domain logic
- **IndexedDB Storage**: Persistent data storage via Dexie.js with repository pattern
- **Multi-World Scripts**: Separates main-world (page context) and isolated-world (extension context) responsibilities

---

## 2. Project Structure

```
gemini-chrome-plugin/
├── src/
│   ├── entrypoints/              # Entry points for WXT
│   │   ├── content/              # Content script (main entry)
│   │   │   ├── index.tsx         # Boot sequence orchestration
│   │   │   ├── overlay/          # Shadow DOM UI overlay
│   │   │   │   ├── index.tsx     # Main overlay renderer
│   │   │   │   └── quick-follow-up/
│   │   │   ├── prompt/           # Prompt entrance UI
│   │   │   └── status/           # Status panel
│   │   ├── background.ts         # Background service worker
│   │   ├── popup/                # Extension popup UI
│   │   └── url-monitor-main-world.ts  # Main-world script for URL monitoring
│   ├── components/               # React components
│   │   ├── ui/                   # Base UI components
│   │   │   ├── provider-shadow-dom.tsx  # Shadow DOM provider
│   │   │   ├── theme.ts          # Chakra UI theme config
│   │   │   └── ...               # Other UI primitives
│   │   ├── setting-panel/        # Settings panel module
│   │   ├── run-status/           # Chain prompt execution status
│   │   ├── prompt-entrance/      # Prompt entrance button
│   │   └── quick-follow/         # Quick follow-up components
│   ├── services/                 # Business logic services
│   │   ├── urlMonitor.ts         # URL change monitoring
│   │   ├── chatChangeDetector.ts # Chat switch detection
│   │   ├── chainPromptExecutor.ts    # Chain prompt execution engine
│   │   ├── executionCoordinator.ts   # Execution coordination
│   │   └── templateEngine.ts     # Template variable substitution
│   ├── data/                     # Data layer
│   │   ├── db.ts                 # Dexie database definition
│   │   ├── repositories/         # Data access layer
│   │   │   ├── chainPromptRepository.ts
│   │   │   └── quickFollowRepository.ts
│   │   ├── sources/              # Data sources
│   │   └── templates/            # Built-in templates
│   ├── stores/                   # Zustand state management
│   │   ├── chainPromptStore.ts
│   │   ├── quickFollowStore.ts
│   │   └── settingStore.ts
│   ├── domain/                   # Domain types and models
│   │   ├── chain-prompt/
│   │   └── quick-follow/
│   ├── common/                   # Shared constants and events
│   │   ├── const.ts
│   │   └── event.ts              # Event type definitions
│   ├── utils/                    # Utility functions
│   │   ├── eventbus.ts           # Global event bus
│   │   ├── i18n.ts               # i18n helper
│   │   ├── chatActions.ts        # Chat interaction utilities
│   │   └── ...
│   ├── hooks/                    # Custom React hooks
│   └── locales/                  # i18n translation files
│       ├── en.json
│       ├── zh_CN.json
│       └── ...
├── public/                       # Static assets
│   └── icon/                     # Extension icons
├── wxt.config.ts                 # WXT configuration
├── tsconfig.json                 # TypeScript configuration
├── package.json                  # Dependencies and scripts
└── scripts/
    └── check-i18n.js             # i18n consistency checker
```

---

## 3. Core Modules and Architecture

### 3.1 Entry Point and Boot Sequence

**File**: `src/entrypoints/content/index.tsx`

The content script follows a strict initialization sequence:

1. **Inject Main-World Script**: Injects `url-monitor-main-world.js` to patch `history` API in page context
2. **Start URL Monitor**: Begins listening for URL change events from main world
3. **Start Chat Change Detector**: Monitors chat switching based on URL changes
4. **Mount Shadow DOM UI**: Creates isolated UI overlay with React and Chakra UI

```typescript
// Boot sequence
await injectScript('/url-monitor-main-world.js', { keepInDom: true })
urlMonitor.start()
chatChangeDetector.start()
const ui = createIntegratedUi(ctx, {
  position: 'modal',
  zIndex: 9999999999,
  onMount: (container) => renderOverlay(container)
})
ui.mount()
```

### 3.2 Multi-World Architecture

#### Main World Script (`url-monitor-main-world.ts`)
- Runs in page context (main world)
- Patches `history.pushState` and `history.replaceState`
- Dispatches `CustomEvent` with URL changes to isolated world
- **Never** accesses extension APIs or UI

#### Isolated World (Content Script)
- Runs in extension context
- Listens to events from main world
- Manages services, state, and UI rendering
- Access to extension APIs and IndexedDB

### 3.3 Event Bus Architecture

**File**: `src/utils/eventbus.ts`, `src/common/event.ts`

All cross-module communication flows through a centralized event bus:

```typescript
// Event definitions with types
export interface AppEvents {
  'urlchange': URLChangeEvent
  'chatchange': ChatChangeEvent
  'settings:open': { from: string, open: boolean, module?: string }
  'quick-follow-up:show': { text: string, event: {...} }
  // ... more events
}

// Usage
eventBus.on('urlchange', (data) => { /* handle */ })
eventBus.emit('settings:open', { from: 'popup', open: true })
```

**Benefits**:
- Decouples modules (services, UI, storage)
- Type-safe event handling with TypeScript
- Easy to trace data flow
- Supports async event listeners

### 3.4 Service Layer

#### URL Monitor Service (`urlMonitor.ts`)
- Subscribes to main-world URL change events
- Re-emits to event bus for isolated-world consumers
- Singleton pattern

#### Chat Change Detector (`chatChangeDetector.ts`)
- Detects when user switches between different chats
- Analyzes URL patterns to identify chat transitions
- Emits `chatchange` events for dependent features
- Critical for chain prompt execution abortion

#### Chain Prompt Executor (`chainPromptExecutor.ts`)
- Executes multi-step prompt sequences
- Handles variable substitution via template engine
- Monitors for chat switches to abort execution
- Reports progress via event bus

### 3.5 Data Layer (Repository Pattern)

**Database**: `src/data/db.ts` - Dexie wrapper around IndexedDB

```typescript
export class GeminiExtensionDB extends Dexie {
  chain_prompts!: Table<ChainPromptRow, string>
  quick_follow_prompts!: Table<QuickFollowPromptRow, string>
  quick_follow_settings!: Table<QuickFollowSettingsRow, string>
}
```

**Repositories**: Abstract data access with validation and mapping

- `chainPromptRepository.ts`: CRUD for chain prompts
- `quickFollowRepository.ts`: CRUD for quick follow-up templates

**Pattern**:
- ID generation with `nanoid`
- Zod schema validation at boundaries
- Row (DB) ↔ Domain model transformation
- Timestamp management (`createdAt`, `updatedAt`)

### 3.6 UI Layer (Shadow DOM + Chakra UI)

#### Shadow DOM Provider (`provider-shadow-dom.tsx`)
- Wraps entire UI in Shadow DOM for style isolation
- Configures Emotion cache to target Shadow root
- Syncs theme (light/dark) with host page
- Uses `react-shadow` and `next-themes`

```typescript
// CSS variables scoped to :host
const config = defineConfig({
  cssVarsRoot: ":host",
  conditions: {
    light: `:host &, .light &`,
    dark: `:host(.dark) &, .dark &`
  }
})
```

#### Main Overlay (`overlay/index.tsx`)
Renders key UI components:
- **SettingPanel**: Configuration and management interface
- **QuickFollowUp**: Text selection action bar
- **Toaster**: Notification system (Chakra UI)

#### Component Architecture
- **Chakra UI v3**: Component library with design system
- **TypeScript**: Full type safety
- **Composition**: Small, focused components
- **Zustand**: Client-side state management

---

## 4. Key Features Implementation

### 4.1 Chain Prompt

**Workflow**:
1. User creates chain prompt in settings panel with variables and steps
2. Saves to IndexedDB via repository
3. Executes via `chainPromptExecutor`
4. For each step:
   - Substitute variables with user input
   - Insert text into Gemini input box
   - Trigger send button
   - Wait for response
5. Monitor for chat switches → abort if detected

**Key Files**:
- `components/setting-panel/views/chain-prompt/`
- `services/chainPromptExecutor.ts`
- `services/templateEngine.ts`
- `data/repositories/chainPromptRepository.ts`

### 4.2 Quick Follow-Up

**Workflow**:
1. User selects text on page
2. `mouseup` event triggers position calculation
3. Shows floating action bar with custom prompts
4. User clicks prompt → text + template combined
5. Inserted into chat input for sending

**Key Files**:
- `components/quick-follow/`
- `entrypoints/content/overlay/quick-follow-up/`
- `data/repositories/quickFollowRepository.ts`

### 4.3 Chat Outline

**Legacy Feature**: Currently in maintenance mode. Original implementation used vanilla JS to inject outline UI. Migration to React-based architecture is planned.

**Key Files**:
- `entrypoints/content/lagecy/content.ts`

---

## 5. Build System and Development Tools

### 5.1 WXT Framework

WXT is the build system and development framework:

- **Hot Module Replacement**: Instant updates during development without full reload
- **Manifest Generation**: Generates `manifest.json` from `wxt.config.ts`
- **Multi-Browser Support**: Builds for Chromium and Firefox with unified codebase
- **TypeScript Native**: First-class TypeScript support with path aliases
- **Module System**: Pre-configured React and i18n modules

**Configuration**: `wxt.config.ts`

```typescript
export default defineConfig({
  modules: ['@wxt-dev/module-react', '@wxt-dev/i18n/module'],
  srcDir: 'src',
  vite: () => ({
    plugins: [svgr()],
  }),
  manifest: () => ({
    name: "Gemini Power Kit",
    default_locale: "en",
    permissions: ["storage"],
    web_accessible_resources: [...]
  })
})
```

### 5.2 Package Manager and Scripts

**Package Manager**: PNPM (pinned via `packageManager` field)

**Key Scripts**:

```bash
# Development
pnpm install          # Install dependencies
pnpm dev              # Start dev server for Chromium
pnpm dev:firefox      # Start dev server for Firefox

# Build and Package
pnpm build            # Production build for Chromium
pnpm build:firefox    # Production build for Firefox
pnpm zip              # Create distributable .zip for Chromium
pnpm zip:firefox      # Create distributable .zip for Firefox

# Quality Checks
pnpm compile          # TypeScript type check (no emit)
pnpm lint             # Alias for compile
pnpm check:i18n       # Validate i18n consistency across locales

# Post-Install
# (runs automatically after pnpm install)
pnpm wxt prepare      # WXT project setup
```

### 5.3 TypeScript Configuration

**File**: `tsconfig.json`

- Strict type checking enabled
- Path aliases configured (e.g., `@/` → `src/`)
- React 19 JSX transform
- ES module target

### 5.4 i18n System

**Framework**: WXT i18n module + browser.i18n API

**Structure**:
- Translation files: `src/locales/*.json`
- Base language: English (`en.json`)
- Helper wrapper: `src/utils/i18n.ts`

**Usage**:

```typescript
import { t } from '@/utils/i18n'

// Simple translation
const text = t('settings.title')

// With substitutions
const message = t('chain.step.count', ['3'])
```

**Validation**:

```bash
pnpm check:i18n
```

Checks all locale files against English base to ensure:
- No missing keys
- No extra keys
- Structural consistency

---

## 6. Development Guide

### 6.1 Setting Up Development Environment

1. **Prerequisites**:
   - Node.js 18+ (20+ recommended)
   - PNPM 10+ (pinned in package.json)
   - Chrome or Chromium browser

2. **Installation**:
   ```bash
   git clone <repository>
   cd gemini-chrome-plugin
   pnpm install
   ```

3. **Start Development**:
   ```bash
   pnpm dev
   ```
   - Opens browser with extension loaded
   - Watches for file changes
   - Hot reloads on save

4. **Load Extension Manually** (alternative):
   ```bash
   pnpm build
   ```
   - Go to `chrome://extensions`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select `.output/chrome-mv3` directory

### 6.2 Development Workflow

#### Adding a New Feature

1. **Plan Architecture**:
   - Identify affected layers (UI, service, data)
   - Define events if cross-module communication needed
   - Design data schema if persistence required

2. **Implement Data Layer** (if needed):
   - Update `db.ts` schema and version
   - Create/update repository
   - Define domain types in `src/domain/`

3. **Implement Service Layer** (if needed):
   - Create service singleton in `src/services/`
   - Subscribe/emit events via event bus
   - Coordinate with existing services

4. **Implement UI Layer**:
   - Create components in `src/components/`
   - Use Chakra UI for consistency
   - Connect to state via Zustand or props
   - Add i18n strings to locale files

5. **Test**:
   - Manual testing in dev mode
   - Test theme switching (light/dark)
   - Test across different chat scenarios
   - Verify type safety with `pnpm compile`

#### Modifying Existing Features

1. **Locate Files**:
   - Use project structure as guide
   - Check event definitions in `common/event.ts`
   - Check data schema in `data/db.ts`

2. **Understand Flow**:
   - Trace event flow through event bus
   - Identify service dependencies
   - Check UI composition hierarchy

3. **Make Changes**:
   - Preserve existing patterns
   - Maintain type safety
   - Update i18n if user-facing text changes

4. **Validate**:
   - Run `pnpm compile` for type errors
   - Run `pnpm check:i18n` if i18n modified
   - Manual testing

### 6.3 Debugging

#### Content Script Debugging

- Open DevTools on Gemini page (F12)
- Console logs prefixed with `[ContentScript]`, `[URLMonitor]`, etc.
- Check Network tab for failed resource loads
- Use React DevTools for component inspection

#### Background Script Debugging

- Go to `chrome://extensions`
- Click "Service Worker" link under extension
- Opens dedicated DevTools for background context

#### Storage Inspection

- Open DevTools → Application tab → IndexedDB
- Database name: `gemini_extension`
- Tables: `chain_prompts`, `quick_follow_prompts`, `quick_follow_settings`

#### Event Bus Tracing

Add temporary logging:

```typescript
eventBus.on('*', (eventName, data) => {
  console.log('[EventBus]', eventName, data)
})
```

### 6.4 Common Tasks

#### Adding a New i18n Locale

1. Copy `src/locales/en.json` to `src/locales/<code>.json`
2. Translate all strings
3. Run `pnpm check:i18n` to validate
4. Update `default_locale` in `wxt.config.ts` if making it default

#### Adding a New Component

1. Create file in appropriate directory:
   - Shared UI: `src/components/ui/`
   - Feature-specific: `src/components/<feature>/`
2. Use TypeScript for props interface
3. Use Chakra UI components for consistency
4. Export from parent `index.ts` if applicable

#### Adding a New Service

1. Create class in `src/services/<name>.ts`
2. Use singleton pattern:
   ```typescript
   class MyService {
     // ... implementation
   }
   export const myService = new MyService()
   ```
3. Define typed events in `common/event.ts`
4. Subscribe/emit via event bus
5. Initialize in `content/index.tsx` boot sequence

#### Adding IndexedDB Schema Changes

1. Update interfaces in `src/data/db.ts`
2. Increment database version:
   ```typescript
   this.version(3).stores({
     existing_table: '...',
     new_table: 'id, ...'
   })
   ```
3. Add upgrade logic if data migration needed
4. Create/update repository

---

## 7. Architecture Patterns and Best Practices

### 7.1 Code Organization

- **Single Responsibility**: Each module has one clear purpose
- **Separation of Concerns**: UI, logic, data are separated
- **Dependency Direction**: UI → Service → Repository → DB
- **No Circular Dependencies**: Use event bus to decouple

### 7.2 Naming Conventions

- **Files**: kebab-case (e.g., `chat-change-detector.ts`)
- **Components**: PascalCase (e.g., `SettingPanel`)
- **Functions**: camelCase, verbs (e.g., `handleURLChange`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `GEM_EXT_EVENTS`)
- **Types/Interfaces**: PascalCase (e.g., `URLChangeEvent`)

### 7.3 TypeScript Best Practices

- Annotate all exported functions and public APIs
- Avoid `any`; use `unknown` if type truly unknown
- Use `interface` for object shapes, `type` for unions/intersections
- Prefer type inference for local variables
- Use `satisfies` for type checking without widening

### 7.4 React Best Practices

- Prefer function components over class components
- Use hooks for state and effects
- Keep components small and focused
- Colocate related code (component + styles + tests)
- Use composition over prop drilling
- Memoize expensive computations with `useMemo`
- Avoid inline function definitions in JSX

### 7.5 Event Bus Patterns

**Good**:
```typescript
// Service A
eventBus.emit('feature:action', { data: 'value' })

// Service B
eventBus.on('feature:action', (data) => {
  // handle
})
```

**Bad**:
```typescript
// Direct coupling
import { serviceB } from './serviceB'
serviceB.handleAction({ data: 'value' })
```

### 7.6 Repository Patterns

- All database operations go through repositories
- Validate input with Zod at repository boundaries
- Map database rows to domain models
- Generate IDs and timestamps in repository
- Return domain types, not database rows

### 7.7 Shadow DOM Best Practices

- **Style Isolation**: All styles scoped to `:host`
- **Portal Usage**: Use Chakra's Portal for modals/tooltips
- **Environment Provider**: Required for Chakra components to find Shadow root
- **Theme Sync**: Use `ShadowThemeSync` component to mirror host page theme

---

## 8. Troubleshooting

### 8.1 Extension Not Loading

- Check `chrome://extensions` for errors
- Verify manifest generation: check `.output/chrome-mv3/manifest.json`
- Try rebuilding: `rm -rf .output && pnpm build`
- Check console for WXT build errors

### 8.2 Styles Not Applying

- Verify Shadow DOM is mounted: inspect element in DevTools
- Check Emotion cache is targeting Shadow root
- Verify `:host` selector in CSS
- Check for CSS specificity issues

### 8.3 Events Not Firing

- Check event name spelling (case-sensitive)
- Verify event listener is registered before emission
- Check event bus max listeners warning
- Use wildcard listener to debug: `eventBus.on('*', ...)`

### 8.4 Database Errors

- Open IndexedDB in DevTools to inspect data
- Check database version in `db.ts`
- Verify table schema matches interface
- Clear database for testing: DevTools → Application → Clear Storage

### 8.5 Hot Reload Not Working

- Check WXT dev server is running
- Refresh extension manually at `chrome://extensions`
- Restart dev server: Ctrl+C, then `pnpm dev`
- Check for TypeScript errors blocking build

---

## 9. Performance Considerations

### 9.1 Content Script Performance

- **Lazy Load Features**: Only initialize when needed
- **Debounce Events**: Avoid excessive event handling
- **Optimize Observers**: Use targeted selectors for MutationObserver
- **Minimize DOM Manipulation**: Batch updates when possible

### 9.2 React Performance

- **Memoization**: Use `React.memo` for expensive components
- **Virtual Lists**: For long lists (e.g., chain prompt steps)
- **Avoid Re-renders**: Split state to minimize component updates
- **Lazy Import**: Code-split heavy features

### 9.3 IndexedDB Performance

- **Indexed Queries**: Use indexed fields for queries
- **Batch Operations**: Use `bulkAdd`/`bulkPut` for multiple records
- **Pagination**: Load data in chunks, not all at once
- **Transactions**: Group related operations

### 9.4 Shadow DOM Performance

- **Emotion Cache**: Reuse cache, don't recreate
- **Style Deduplication**: Chakra UI handles automatically
- **Avoid Deep Nesting**: Keep Shadow DOM tree shallow

---

## 10. Security Considerations

### 10.1 Content Security Policy

- No inline scripts (enforced by MV3)
- No eval or Function constructor
- External resources must be declared in manifest
- Main-world script isolated from extension context

### 10.2 Data Sanitization

- Validate all user input with Zod
- Sanitize text before inserting into DOM
- Use React's JSX escaping (automatic)
- Never use `dangerouslySetInnerHTML` without sanitization

### 10.3 Permissions

- **Minimal Permissions**: Only request `storage`
- **No Host Permissions**: Extension runs only on gemini.google.com via matches
- **No Network Access**: No external API calls from extension

### 10.4 Data Privacy

- All data stored locally in IndexedDB
- No data transmitted to external servers
- No user tracking or analytics
- No access to Gemini API keys or credentials

---

## 11. Future Improvements and Roadmap

### 11.1 Planned Features

- **Export/Import**: Backup and restore user data
- **Preset Synchronization**: Sync settings across devices via Chrome Storage Sync API
- **Advanced Template Engine**: More powerful variable system with conditionals
- **Chat History Search**: Full-text search across saved chats
- **Custom Themes**: User-customizable color schemes

### 11.2 Technical Debt

- **Migrate Chat Outline**: Convert legacy vanilla JS to React components
- **Testing**: Add unit tests (Vitest) and E2E tests (Playwright)
- **Documentation**: Add JSDoc comments to all public APIs
- **Performance Monitoring**: Add telemetry for performance metrics
- **Accessibility**: Improve ARIA labels and keyboard navigation

### 11.3 Code Quality

- **Linting**: Add ESLint with strict rules
- **Formatting**: Add Prettier for consistent formatting
- **Pre-commit Hooks**: Husky for automatic checks
- **CI/CD**: GitHub Actions for automated testing and releases

---

## 12. Contributing

### 12.1 Getting Started

1. Read `CONTRIBUTING.md` in repository root
2. Set up development environment (see Section 6.1)
3. Check open issues for tasks
4. Fork repository and create feature branch

### 12.2 Pull Request Guidelines

- Follow existing code style and patterns
- Update i18n files for new user-facing strings
- Run `pnpm compile` and `pnpm check:i18n` before submitting
- Add descriptive commit messages
- Reference issue number in PR description

### 12.3 Code Review Process

- All PRs reviewed by maintainers
- Must pass type checking
- Must maintain i18n consistency
- Should follow architecture patterns documented here

---

## 13. License and Attribution

This project is open source. See `LICENSE` file for details.

**Third-Party Libraries**:
- React 19 - UI framework
- Chakra UI v3 - Component library
- Dexie.js - IndexedDB wrapper
- WXT - Extension framework
- Zustand - State management
- Zod - Schema validation
- Tippy.js - Tooltip library
- nanoid - ID generation

---

**Document Version**: 1.0  
**Last Updated**: 2025-12-14  
**Maintainer**: Gemini Power Kit Team