---
name: gemini-power-kit-verify
description: Live browser verification workflow for Gemini Power Kit on gemini.google.com. Use when Codex has completed a feature, fixed a UI/runtime issue, or the user asks to verify plugin behavior on the live Gemini page, including settingPanel, SideNav entry, chat flows, temporary chats, model selection, quick follow-up, user-query/model-response interactions, or Gemini DOM selector checks. Prefer the Chrome plugin/@chrome for logged-in live verification; fall back to agent-browser with --auto-connect when Chrome tooling is unavailable or explicitly requested.
---

# Gemini Power Kit Verify

## Overview

Verify Gemini Power Kit behavior on the live Gemini page with the user's logged-in Chrome session and installed extension state. Use this as the product-specific path guide; use browser tools for mechanics.

## Tool Priority

Prefer the Chrome plugin (`@chrome`) for live verification because it can use the user's real Chrome profile, Gemini login, and installed extension. If Chrome plugin capabilities are unavailable or the user explicitly asks for agent-browser, use the `agent-browser` skill with `--auto-connect` against the running Chrome instance.

For the fallback path, keep commands connected to existing Chrome:

```bash
agent-browser --auto-connect open https://gemini.google.com/app
agent-browser --auto-connect snapshot -i
agent-browser --auto-connect eval --stdin
```

Do not replace an explicit `@chrome` request with a fresh headless browser. A clean browser usually lacks the logged-in Gemini session and extension context needed for this repo.

## Safety Rules

- Before sending any prompt to Gemini, ensure the selected model text in `<bard-mode-switcher>` is a `*-Lite` model.
- If a Lite model cannot be found or selected, stop before sending a prompt and report that verification is blocked.
- Prefer temporary chats via `<temp-chat-button>` when a test needs to send a prompt, so history is not polluted.
- Do not inspect unrelated chat history. Enter only the chat needed for the requested verification.
- When selectors are likely to drift, inspect both current repo code and live DOM before deciding on interactions or fixes.

## Gemini DOM Map

- SideNav root: `<bard-sidenav>`.
- Chat history links: `bard-sidenav a[href="/app/{chat_id}"]`; the chat title is commonly on `aria-label`.
- Gems page link: `bard-sidenav a[href="/gems/view"]`.
- Chat root: `<chat-window>`.
- New chat page: `https://gemini.google.com/app` without a chat id.
- Temporary chat entry: `<temp-chat-button>`.
- Model switcher: `<bard-mode-switcher>`; its visible text is the selected model name.
- Model menu: a Google popover inside `<bard-mode-switcher>` with `data-test-id="bard-mode-desktop-gem-menu"`.
- Plugin SideNav entry: `[data-test-id="gemini-power-kit-mavatar-container"]`.
- User messages: `<user-query>`.
- Model replies: `<model-response>`.

## Source Pointers

Check the relevant source before relying on selectors that are not listed in the DOM map:

- Setting panel: `src/components/setting-panel/`.
- Overlay mount and cross-feature UI: `src/entrypoints/content/overlay/index.tsx`.
- Quick follow-up overlay: `src/entrypoints/content/overlay/quick-follow-up/`.
- Legacy chat DOM transforms: `src/entrypoints/content/lagecy/`.
- Gemini message helpers: `src/utils/messageUtils.ts`.
- Gemini editor/send helpers: `src/utils/editorUtils.ts`.
- Event names and payloads: `src/common/event.ts`.

## Setting Panel Verification

1. Open `https://gemini.google.com/app` in Chrome.
2. Find `<bard-sidenav>`.
3. Find and click `[data-test-id="gemini-power-kit-mavatar-container"]`.
4. Verify that the setting panel from `src/components/setting-panel/` opens in the extension Shadow DOM.
5. If verifying a specific setting view, navigate to that view and confirm state is reflected in the live Gemini page when applicable.

## Chat Feature Verification

1. Select a concrete chat from `<bard-sidenav>` using an `a[href^="/app/"]` history link, or start a temporary chat when the test requires a fresh prompt.
2. Use `<chat-window>` as the scope for message inspection.
3. Treat `<user-query>` as user messages and `<model-response>` as model replies.
4. For input boxes, send buttons, stop buttons, quote UI, and other volatile Gemini controls, read current selectors from repo code and confirm against live DOM before interacting.

## Temporary Chat and Lite Model Flow

Use this flow before any verification that sends a prompt:

1. Open `https://gemini.google.com/app`.
2. Enter temporary chat using `<temp-chat-button>` when available.
3. Inspect `<bard-mode-switcher>` and read the selected model text.
4. If the model is not a `*-Lite` model, click `<bard-mode-switcher>`.
5. In the menu under `data-test-id="bard-mode-desktop-gem-menu"`, choose the Flash-Lite or other Lite model, commonly the first list item.
6. Confirm `<bard-mode-switcher>` now shows a `*-Lite` model before sending.

## Quick Follow-Up Example

Use this as the reference path for quick follow-up or selection-based chat features:

1. Open `https://gemini.google.com/app`.
2. Enter temporary chat.
3. Ensure the selected model is Flash-Lite or another `*-Lite` model.
4. Send a low-cost prompt such as `What is Gemini Power Kit?`.
5. Wait until a `<model-response>` has finished rendering.
6. Select a paragraph inside the latest `<model-response>`.
7. Verify that the quick follow-up UI appears and can perform the requested action.

## Reporting

Report the verification path, the exact live selectors or components inspected, and whether the result was confirmed, blocked, or flaky. If Gemini DOM drift is found, include the observed DOM shape and the source file that should own the fix.
