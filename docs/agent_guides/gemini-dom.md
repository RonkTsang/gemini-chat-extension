# Gemini DOM Guide

Applies to code that queries, traverses, observes, or mutates Gemini-owned DOM.

- **Evidence:** Inspect the current live DOM or a captured fixture before changing selectors. Do not add selectors for an unobserved DOM shape.
- **Precise identity:** Resolve through a verified ownership chain, scoped at each step; for example, `conversation key -> unique row -> row-local action trigger -> native button`. Prefer stable technical attributes, element semantics, explicit ownership references, and route identity.
- **Candidates:** Each fallback must be a complete, observed selector contract, evaluated and validated independently in priority order. Do not use a broad union to hide which contract matched.
- **No guessing:** Do not identify nodes through arbitrary parent/sibling searches, keyword or icon scoring, localized text, transient classes, visibility, or geometry. Zero or multiple matches must fail; destructive operations must never widen the search.
- **Code boundary:** Keep Gemini selectors and pure resolvers in a feature-local `dom.ts`, `*.dom.ts`, or `selectors.ts`/`resolver.ts`. Workflow and UI code call named resolvers instead of embedding selectors.

