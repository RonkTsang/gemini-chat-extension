# Top Bar Actions

## Purpose

This module injects the Gemini Power Kit Chat layout and Theme shortcuts into
`top-bar-actions .right-section`. Chat layout emits
`chat-settings-panel:toggle`; Theme emits `theme-floating-panel:open`.

## Startup

The Top Bar customization settings controller starts this module after the
integrated overlay has mounted. Each shortcut can be enabled independently.
The shared observer lifecycle stops only after both shortcuts are disabled or
the content-script context is invalidated.

## DOM Placement

The injected node is a dedicated `.buttons-container` with a stable
`data-test-id`.

- When `.right-section` already contains native children, the extension
  containers are kept immediately before the last native child.
- Chat layout is always placed directly left of Theme when both are enabled.
- When `.right-section` has no native children, the enabled extension
  containers are appended in the same order.
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
- `.right-section`: direct `childList` changes, so either entry is restored or
  repositioned when Gemini changes its action controls.
- A document-level bootstrap observer is used only while the app root is
  missing and is disconnected immediately after the app appears.

Observer callbacks never mutate synchronously. They share one
`requestAnimationFrame` reconciliation slot, which coalesces bursts of Angular
DOM updates. Mutations caused only by inserting the extension entry are ignored
to prevent observer feedback loops.

## Cleanup and Memory Safety

`stopTopBarAction()` and `stopChatSettingsTopBarAction()` remove only their own
entry while the other shortcut remains enabled. When both are disabled, the
module disconnects every observer, cancels the pending animation frame, clears
observed-node references, removes the shared style, and unregisters the
`beforeunload` listener. When Gemini replaces a watched node, the previous
observer is disconnected before the new node is registered.
