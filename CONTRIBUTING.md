# Contributing to Gemini Power Kit

Thanks for helping improve Gemini Power Kit. Bug fixes, documentation improvements, tests, and focused feature proposals are all welcome.

## Before you start

- Search [open issues](https://github.com/RonkTsang/gemini-chat-extension/issues) before reporting a bug or proposing a feature.
- For a substantial feature or a change to Gemini-facing behavior, open an issue first so the intended user experience and browser scope can be discussed.
- Follow the project's [Code of Conduct](CODE_OF_CONDUCT.md).
- Do not include prompts, conversation content, account data, API keys, or other personal information in issues, commits, screenshots, or pull requests.

## Set up your development environment

This project uses Node.js 22 and the pnpm version pinned in `package.json`.

1. Fork the repository, then clone your fork.
2. Create a branch from the latest `main` branch.
3. Install dependencies and start the Chromium development build:

   ```bash
   corepack enable
   pnpm install
   git switch -c fix/short-description
   pnpm dev
   ```

Use `pnpm dev:firefox` when working on Firefox behavior. WXT writes development builds to `.output/`; see [Platform Differences](docs/platforms.md) for browser-specific entry points, permissions, and build outputs.

## Make a change

- Keep each pull request focused on one user-visible improvement or fix.
- Work in `src/`; WXT generates the browser manifests from `wxt.config.ts`. Do not edit generated build output or a legacy root manifest.
- Preserve Chrome/Firefox isolation with WXT `include` rules or `import.meta.env.FIREFOX` guards when behavior differs.
- For user-facing text, update the English base and every locale in `src/locales/`.
- Update the relevant user documentation when behavior, permissions, or supported workflows change. Use the documentation site for detailed feature guidance; keep the root README concise.
- Add or update focused tests when the change has testable behavior.

AI-assisted contributions are welcome, but the contributor remains responsible for reviewing the diff, validating behavior, and ensuring the submission does not contain secrets or copyrighted material that cannot be contributed.

## Verify your work

Run the checks that apply to your change before opening a pull request:

```bash
# Required for code changes
pnpm compile
pnpm test:run
git diff --check

# Required when localized strings change
pnpm run check:i18n

# Required when a browser-specific or build-time path changes
pnpm build
pnpm build:firefox
```

For Gemini UI changes, also test the affected path on `gemini.google.com`. If a change affects both browser targets, verify both. Automated checks do not replace manual verification for Gemini DOM integration.

## Open a pull request

1. Rebase or merge the latest `main` into your branch if needed.
2. Use a clear [Conventional Commit](https://www.conventionalcommits.org/) message, such as `fix: restore the sidebar entry` or `feat: add a shortcut action`.
3. In the pull request description, explain the user-facing outcome, link the related issue, and list the checks you ran.
4. Include screenshots or a short recording for visible UI changes, and describe any manual Gemini verification.
5. Keep unrelated refactors, formatting changes, generated files, and dependency updates out of the pull request unless they are necessary for the change.

Maintainers may ask for adjustments to scope, tests, copy, documentation, or cross-browser behavior before merging.

## Report a bug or suggest an improvement

Use [GitHub Issues](https://github.com/RonkTsang/gemini-chat-extension/issues) and include:

- Gemini Power Kit version and browser version.
- Clear steps to reproduce the behavior.
- Expected and actual results.
- Screenshots, console errors, or recordings when safe to share.
- Whether the issue reproduces after refreshing Gemini and reloading the extension.

For a feature proposal, describe the user problem and desired outcome before prescribing an implementation.
