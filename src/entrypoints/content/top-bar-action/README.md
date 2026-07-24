# Theme Top Bar Action

## Purpose

This module injects the Gemini Power Kit Theme shortcut into
`top-bar-actions .right-section`. Clicking the icon emits
`theme-floating-panel:open` and opens the existing `ThemeFloatingPanel`.

## Startup

The Top Bar customization settings controller starts this module after the
integrated overlay has mounted, and stops it when the Theme shortcut setting is
disabled or the content-script context is invalidated. This keeps the injected
DOM and observers scoped to both the user preference and the active extension
context.

## DOM Placement

The injected node is a dedicated `.buttons-container` with a stable
`data-test-id`.

- When `.right-section` already contains native children, the extension
  container is kept immediately before the last native child.
- When `.right-section` has no native children, the extension container is
  appended as its only child.
- Reconciliation reuses the existing entry and only moves it when its actual
  position is wrong.

## Observation Strategy

The live Gemini hierarchy is observed in narrow layers:

```text
chat-app-orchestrator#app-root
└── chat-app
    └── main.chat-app
        └── top-bar-actions
            └── .right-section
```

Each observer watches only the minimum required scope:

- app root, `chat-app`, and `main.chat-app`: direct `childList` changes, so
  replacement of the next layer is detected.
- `top-bar-actions`: subtree `childList` changes, limited to the small top-bar
  component, so replacement of `.right-section` is detected.
- `.right-section`: direct `childList` changes, so the Theme entry is restored
  or repositioned when Gemini changes its action controls.
- A document-level bootstrap observer is used only while the app root is
  missing and is disconnected immediately after the app appears.

Observer callbacks never mutate synchronously. They share one
`requestAnimationFrame` reconciliation slot, which coalesces bursts of Angular
DOM updates. Mutations caused only by inserting the extension entry are ignored
to prevent observer feedback loops.

## Cleanup and Memory Safety

`stopTopBarAction()` disconnects every observer, cancels the pending animation
frame, clears observed-node references, removes the injected entry and style,
and unregisters the `beforeunload` listener. When Gemini replaces a watched
node, the previous observer is disconnected before the new node is registered.
