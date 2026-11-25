# Extension release workflow

`main` is the default development branch and the production source for the Cloudflare Pages website. `stable` is the only extension release branch. The GitHub Release provides the Chrome and Firefox packages; store submission and availability are separate.

For the initial rollout, put this workflow on `main` and `stable` before running it. If both branches still share the last release as their head and the only new changes on `main` are this migration, fast-forward `stable` to the reviewed migration commit. Otherwise, bring only the workflow migration to `stable` and merge that setup history back into `main` before preparing a candidate.

## Regular release

1. Confirm the intended `main` revision has passed [manual acceptance](manual-acceptance/release.md). In Actions, run **Prepare Release** on `main`. It opens a PR to `stable` from a fixed commit. If `stable` has a release that is missing from `main`, merge its sync PR first.
2. **Prepare Release** checks the pinned candidate and merges the PR with a merge commit after the checks pass. If checks fail or the PR or `stable` changes during checks, review the open PR before retrying. Review the candidate scope before starting **Prepare Release**.
3. Run **Release** with dry-run enabled. Leave the branch selector on `main` to start the release run on `stable` automatically, or select `stable` to run it directly. Review the predicted version and preview packages in the `stable` run. To publish the verified revision, run **Release** again with dry-run disabled. Leave `stable` unchanged between verification and publication.
4. Verify the GitHub Release tag and both browser packages. The workflow opens a **sync** PR, checks the merged result with TypeScript and tests, then merges it into `main`. The merge brings back the release commit, version, changelog, and any fixes together. Conflicts, failed checks, or changes to `main` during verification leave the PR open. If the checked merge changes files under `.github/workflows/`, the run summary links to the PR for a maintainer to merge using **Create a merge commit**, because `GITHUB_TOKEN` cannot write those changes.

## Hotfix

Open the hotfix branch from `stable` and target `stable` in the PR. Use a `fix:` commit, run the same checks, and follow the same publish and sync steps. Do not promote `main` as part of the hotfix. If the browser store is still serving an older release than `stable`, use that store version's tag as the basis for a separate maintenance release; the standard workflow is not an older-version release lane.

## Recovery and settings

- After an automatic merge, the workflow deletes its temporary `release/candidate-*` or `release/sync-*` branch once GitHub confirms the PR is merged. Failed checks and merge conflicts leave the branch available for retry.
- If publication succeeded but sync did not finish, run **Sync Release to Main** on `main` or `stable` with the published tag. It reuses the open PR and checks the current merge without publishing again. Resolve conflicts manually using a merge commit. If `main` rules reject the workflow's push, merge the PR through GitHub after the checks and required approvals.
- If publication fails after pushing the release commit or tag, inspect `stable`, the tag, and the GitHub Release and its assets before retrying. Do not move or reuse a tag for different code.
- Keep force pushes and deletion disabled for `stable`. The release job needs to push the version commit with `GITHUB_TOKEN`; requiring a PR for every push needs a separately configured release identity with bypass access. GitHub Actions must be allowed to create PRs for the candidate and sync jobs. If that setting is unavailable, open the corresponding PR manually from the pinned commit or tag.
- The website remains on `main`. Preview documentation for unreleased features and publish it after the corresponding store release is available.
