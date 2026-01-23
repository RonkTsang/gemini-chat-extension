# Tab Title Sync Feature

| **Document Version** | **V1.0** |
| :--- | :--- |
| **Feature Name** | Tab Title Sync |
| **Created Date** | January 22, 2026 |
| **Status** | ✅ Implemented |

## 1. Background

When using Google Gemini in multiple browser tabs, all tabs display the same generic title "Google Gemini". This creates a significant usability issue:

- **Poor Tab Identification**: Users cannot distinguish between different conversations at a glance
- **Low Efficiency**: Finding the correct tab requires clicking through each one to check the content
- **Cognitive Overhead**: Users must remember which tab contains which conversation
- **Workflow Disruption**: Frequent context switching between multiple Gemini conversations becomes tedious

This problem is particularly acute for power users who:
- Work on multiple projects simultaneously
- Keep reference conversations open while starting new ones
- Need to quickly switch between different chat contexts
- Use Gemini for various tasks (coding, writing, research, etc.)

## 2. Goal

**Primary Goal**: Enable users to instantly identify the correct Gemini tab among multiple open tabs.

**Success Criteria**:
- Users can identify specific conversations without opening the tab
- Tab titles accurately reflect the current conversation
- Title updates happen in real-time as conversations change
- The solution works reliably across different Gemini pages (chat, mystuff, etc.)

## 3. Solution

**Automatically synchronize the current chat title to the browser tab title.**

### 3.1. Core Mechanism

The extension monitors the Gemini page DOM and updates `document.title` whenever a conversation title is detected or changed.

### 3.2. Supported Page Types

| Page Type | URL Pattern | Title Source | Example |
|-----------|-------------|--------------|---------|
| Chat Conversation | `/app/{chat_id}` | `.conversation-title.gds-title-m` | "Git Rebase -i: Code Surgery" |
| MyStuff Page | `/mystuff` | `.library-overview-page-container .headline.gds-headline-m` | "My Stuff" |
| Document Page | `/library/{doc_id}` | `library-page .headline.gds-headline-m` | Document title |
| New Chat | `/app` | (No title element) | Fallback to original "Gemini" |

### 3.3. Technical Architecture

**Layered MutationObserver Strategy**:

1. **Outer Observer (DOM Tree Monitor)**
   - Target: `#app-root` or `document.body`
   - Purpose: Detect title element appearance/disappearance
   - Configuration: `{ childList: true, subtree: true }`
   - Lifecycle: Runs continuously, never stops

2. **Inner Observer (Content Monitor)**
   - Target: The title element itself
   - Purpose: Detect text content changes
   - Configuration: `{ childList: true, characterData: true, subtree: true }`
   - Lifecycle: Created when title element appears, destroyed when it disappears

3. **Fallback Title**
   - Saves original `document.title` on first update
   - Restores fallback when no title element exists
   - Ensures consistent UX when switching to new chat

### 3.4. Key Features

- ✅ **Zero Polling**: Event-driven, no CPU overhead from timers
- ✅ **Auto-Recovery**: Automatically detects title elements appearing after DOM rebuilds
- ✅ **Memory Safe**: Observers are properly disconnected when no longer needed
- ✅ **Robust**: Handles Angular SPA re-renders and dynamic DOM changes
- ✅ **Debounced**: Prevents redundant updates for identical titles

### 3.5. Implementation Files

- **Service Module**: [`src/services/tabTitleSync.ts`](../../../src/services/tabTitleSync.ts)
- **Integration**: [`src/entrypoints/content/index.tsx`](../../../src/entrypoints/content/index.tsx)

### 3.6. User Experience

**Before**:
```
Tab 1: Google Gemini
Tab 2: Google Gemini
Tab 3: Google Gemini
Tab 4: Google Gemini
```
❌ Cannot identify which is which

**After**:
```
Tab 1: Git Rebase -i: Code Surgery
Tab 2: Python FastAPI Tutorial
Tab 3: My Stuff
Tab 4: Gemini  (new chat)
```
✅ Instantly identifiable

## 4. Benefits

- **Improved Productivity**: Reduced time spent searching for the right tab
- **Better UX**: Tab titles match user mental model (chat title = tab title)
- **Multi-tasking Support**: Enables efficient parallel work across conversations
- **Native Feel**: Aligns with browser conventions (tabs show page-specific titles)

## 5. Future Enhancements

- Support for additional Gemini page types (Activity, Settings, etc.)
- Custom title prefixes/suffixes (e.g., "Gemini: {chat_title}")
- User preference to enable/disable the feature
- i18n support for page type labels in logs
