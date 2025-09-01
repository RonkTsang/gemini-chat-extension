# Technical Documentation - v0.0.2

**Project Name:** Chat Outline for Gemini
**Version:** 0.0.2
**Date:** 2025-08-01

## 1. Architecture Overview

This project is a standard **Manifest V3** Chrome extension driven by a single content script (`content.js`). It is designed to run exclusively on `gemini.google.com`, injecting UI elements and providing functionality by directly manipulating the DOM.

The architecture follows these principles:
- **Structured & Buildable**: The project uses Node.js and Rollup for a formal build process, bundling scripts and managing dependencies.
- **Minimal Permissions**: The extension requests no special Chrome API permissions.
- **DOM Injection**: All UI elements (icon, popover) are dynamically created and injected into the page's `<chat-window>` component to ensure correct relative positioning and context awareness.
- **Event-Driven**: Functionality is driven by user interactions (icon clicks) and DOM changes (new messages appearing), which are monitored by a `MutationObserver`.
- **Local Dependencies**: Third-party libraries (Tippy.js, Popper.js) are included locally in the `vendor/` directory to comply with the target website's Content Security Policy (CSP).

---

## 2. File Structure & Core Components

```
.
├── content.js          # Core logic: UI injection, event handling, DOM observation
├── manifest.json       # Extension manifest (V3)
├── package.json        # Project metadata and npm scripts
├── rollup.config.js    # Rollup configuration for bundling
├── scripts/
│   └── zip.js          # Node.js script to package the extension
├── styles.css          # Main styles for UI, layout, and themes
├── vendor/             # Third-party libraries
├── images/             # Extension icons
└── dist/               # Build output directory (ignored by git)
```

### 2.1 `manifest.json`

- **`manifest_version`**: 3, adhering to the latest Chrome extension standard.
- **`name` & `description`**: Updated to be more descriptive for the Chrome Web Store.
- **`content_scripts`**:
    - `matches`: Specifies that the extension only activates on `https://gemini.google.com/*`.
    - `css` & `js`: Injects all necessary CSS and JS files. **The order is critical**: dependency libraries must be loaded before `content.js`.
- **`web_accessible_resources`**: Added to explicitly grant the Gemini website access to the extension's image resources (`.png` files), a requirement under Manifest V3.

### 2.2 `package.json`

- Defines the project's name, version, and dev dependencies (`rollup`, `archiver`, etc.).
- **`scripts`**:
    - `build:rollup`: Bundles the JavaScript using Rollup.
    - `build:zip`: Executes the `scripts/zip.js` script to create a distributable `.zip` file in the `releases/` directory.
    - `build`: A convenience script that runs both `build:rollup` and `build:zip` in sequence.

### 2.3 `rollup.config.js`

- Configures the Rollup bundler.
- It takes `content.js` as input and produces a minified version in the `dist/` directory.
- This helps reduce the script's size and slightly obfuscates the code.

### 2.4 `scripts/zip.js`

- A simple Node.js script that uses the `archiver` library to package the entire extension (including `manifest.json`, `dist/`, `vendor/`, `images/`, and `styles.css`) into a versioned zip file, ready for upload.

### 2.5 `content.js` (Core Logic)

- **Initialization (`MutationObserver` for UI)**:
    - Instead of a polling `setInterval`, the script now uses a `MutationObserver` at the root level (`document.body`) to wait for the `<chat-window>` element to be added to the DOM.
    - Once detected, the observer disconnects, and `initializeUI()` is called. This is a more robust and performant method for handling UI initialization in Single-Page Applications (SPAs).

- **UI Creation (`initializeUI`)**:
    - Creates the entry icon (`#gemini-entry-icon`) and the hidden TOC popover (`#gemini-toc-popover`).
    - A pin icon badge (`#gemini-pin-badge`) is added to the entry icon to control the popover's pinned state.
    - Sets `position: relative` on the `<chat-window>` to ensure the absolutely positioned UI elements are anchored correctly.
    - Initializes Tippy.js for the icon's hover tooltip.

- **Pinning Logic**:
    - Clicking the entry icon (`#gemini-entry-icon`) toggles the main visibility of the popover.
    - When the popover is visible, the pin badge also becomes visible.
    - Clicking the pin badge toggles a `.pinned` class on the `#gemini-toc-popover` element.
    - This class change is handled by CSS to keep the popover visible on the screen even when the mouse moves away. The state is not persisted between page loads.

- **TOC Updates (`updateTocList`)**:
    - Triggered by a `MutationObserver` that specifically watches for new `<user-query>` or `<model-response>` elements being added to the chat window.
    - This targeted observation prevents unnecessary updates when minor DOM changes (like streaming text) occur.
    - It extracts text from user prompts, creates list items, and attaches click event listeners for navigation.

### 2.6 `styles.css`

- **CSS Custom Properties (Variables)**:
    - Heavily utilizes CSS variables for colors, shadows, and spacing to simplify theming.
    - Defines two sets of variables: one for the default light theme (`:root`) and another for the dark theme (`body.dark-theme, :root[theme=dark]`), allowing automatic theme switching based on the Gemini website's own theme.
- **SVG Icon**:
    - The entry icon and pin badge icon are loaded via `background-image` variables (`--icon-svg`, `--icon-pin-badge-filled`), which contain **Data URIs**. This embeds the icons directly into the CSS, avoiding potential conflicts.
- **Pinned State**:
    - A `.pinned` class selector is used to apply styles that keep the popover visible (`position: absolute`) and enhance its appearance with a more prominent box shadow.
    - Animations (`@keyframes pop-in`) and transitions are used to provide smooth visual feedback when the popover is pinned or the badge appears.

### 2.7 Quick-Quote Logic

The "Quick-Quote" feature is a context-injection system that allows a user to select any text within the conversation and ask a follow-up question about it. The implementation is divided into three stages:

- **1. Triggering and UI Injection**:
    - An event listener on `mouseup` detects when a user finishes selecting text within a message.
    - If the selection is valid, a Tippy.js tooltip appears, prompting the user to "Ask Gemini".
    - Clicking this prompt triggers `addQuoteUI()`, which injects a visible quote summary above the main chat input box.
    - **Core Mechanism**: Crucially, `addQuoteUI()` also prepends **hidden, structured text** into the chat input's editor (`.ql-editor`). This text is formatted as: `Regarding this: [selected_text]
---------
`. This ensures the context is sent with the user's next prompt.

- **2. History Transformation**:
    - After the user sends their question, a `MutationObserver` detects the new `<user-query>` element appearing in the chat history.
    - The `transformQuoteInHistory()` function inspects the element's content. If it finds the special `Regarding this...` and `---------` format, it dynamically alters the element's DOM.
    - It hides the original raw text and inserts a new, formatted UI that visually separates the quoted text from the user's actual question, making the relationship clear.
    - For future reference (e.g., by the TOC), the parsed quote and question are stored in the `<user-query>` element's `dataset` attributes (`.dataset.isQuote`, `.dataset.quoteText`, etc.).

- **3. Table of Contents (TOC) Integration**:
    - When `updateTocList()` runs, it checks the `dataset` of each `<user-query>` element.
    - If `dataset.isQuote` is `'true'`, it creates a special multi-line list item in the outline.
    - This special item displays a snippet of the quoted text along with the user's question, providing clear context directly within the navigation outline.

---

## 3. Build & Dependency Management


- **Dependencies**: Third-party libraries (Popper, Tippy) are vendored in the `vendor/` directory. Project development dependencies are managed by npm and listed in `package.json`.
- **Installation**: Run `npm install` to download the required development tools.
- **Build Process**: Run `npm run build` to generate the final, distributable extension package. The process is:
    1.  Rollup bundles and minifies `content.js` into `dist/content.js`.
    2.  The `zip.js` script packages all necessary files (`manifest.json`, `dist/`, `styles.css`, etc.) into `releases/chat-outline-vX.X.X.zip`.

---

## 4. Development Guide

- **Modifying Styles**: Edit `styles.css`. Prioritize changing CSS variables for theme consistency.
- **Modifying Logic**: All interactive logic is in `content.js`.
- **DOM Structure Changes**: If the Gemini front-end updates, first inspect the query selectors in `updateTocList` and the initial observer in `content.js`.
- **Debugging**:
    1.  Run `npm run build:rollup` after making changes to `content.js`.
    2.  Go to `chrome://extensions`, enable "Developer mode", and click "Load unpacked", selecting the project's root directory.
    3.  Use the "Reload" button on the extension card after making changes.
    4.  Open the DevTools (F12) on the Gemini page to inspect injected elements and view console output from `content.js`.

---

## 5. Future Improvements

- **Persist Pinned State**: Use `chrome.storage.local` to remember the pinned state across sessions.
- **Refactor `content.js`**: As the script grows, consider breaking it down into smaller, more manageable modules (e.g., `ui.js`, `observer.js`).
- **Add Linter/Formatter**: Integrate a tool like ESLint or Prettier to enforce a consistent code style.
- **Improve Accessibility**: Add ARIA attributes to the injected UI elements to improve screen reader support.
