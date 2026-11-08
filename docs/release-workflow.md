# Extension release workflow

`main` is the default development branch and the production source for the Cloudflare Pages website. `stable` is the only extension release branch. The GitHub Release provides the Chrome and Firefox packages; store submission and availability are separate.

For the initial rollout, put this workflow on `main` and `stable` before running it. If both branches still share the last release as their head and the only new changes on `main` are this migration, fast-forward `stable` to the reviewed migration commit. Otherwise, bring only the workflow migration to `stable` and merge that setup history back into `main` before preparing a candidate.

## Regular release

1. Confirm the intended `main` revision has passed [manual acceptance](manual-acceptance/release.md). In Actions, run **Prepare Release** on `main`. It opens a PR to `stable` from a fixed commit. If `stable` has a release that is missing from `main`, merge its sync PR first.
2. Review the candidate scope and run **Release Checks**. If GitHub requests approval for checks on a bot-created PR, approve the workflow run. Use **Create a merge commit** to preserve the original `feat:` and `fix:` commits for version analysis.
3. Run **Release** on `stable` with dry-run enabled. Review the predicted version and preview packages. To publish the verified revision, run **Release** again on `stable` with dry-run disabled. Leave `stable` unchanged between verification and publication.
4. Verify the GitHub Release tag and both browser packages. Merge the generated **sync** PR into `main` using a merge commit, so `main` receives the release commit, version, changelog, and any fixes together.

## Hotfix

Open the hotfix branch from `stable` and target `stable` in the PR. Use a `fix:` commit, run the same checks, and follow the same publish and sync steps. Do not promote `main` as part of the hotfix. If the browser store is still serving an older release than `stable`, use that store version's tag as the basis for a separate maintenance release; the standard workflow is not an older-version release lane.

## Recovery and settings

- If publication succeeded but the sync PR failed, run **Sync Release to Main** on `main` or `stable` with the published tag. This only opens the sync PR and can be retried without publishing again.
- If publication fails after pushing the release commit or tag, inspect `stable`, the tag, and the GitHub Release and its assets before retrying. Do not move or reuse a tag for different code.
- Keep force pushes and deletion disabled for `stable`. The release job needs to push the version commit with `GITHUB_TOKEN`; requiring a PR for every push needs a separately configured release identity with bypass access. GitHub Actions must be allowed to create PRs for the candidate and sync jobs. If that setting is unavailable, open the corresponding PR manually from the pinned commit or tag.
- The website remains on `main`. Preview documentation for unreleased features and publish it after the corresponding store release is available.
