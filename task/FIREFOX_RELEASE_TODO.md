# Firefox Release TODO

## Manifest

- [x] Replace temporary Gecko ID in `wxt.config.ts`:
  `gemini-power-kit@ronktsang.com`.
- [x] Fix `browser_specific_settings.gecko.data_collection_permissions`.
  Project does not collect or transmit personal data; use:
  `required: ['none']`.
- [x] Set `strict_min_version: '140.0'`.
- [x] Review Firefox permissions:
  `storage`, `webRequest`, `webRequestBlocking`, `*://gemini.google.com/*`.
- [ ] Prepare AMO permission explanation for `webRequest` and host access.
可以附上开源代码链接，而且建议附上。
但注意：**AMO 审核通常仍要求上传 source package/build instructions**，GitHub 链接只能作为辅助说明，不能替代源码包，尤其 WXT/Vite 打包后的代码对 reviewer 不够直观。

可用说明如下。

**AMO Permission Explanation**
```text
This extension uses webRequest and host access for https://gemini.google.com/* only to support local experience-enhancement features on Gemini pages.

Specifically, the Firefox version observes Gemini network responses for the user's “My Stuff” media data so the extension can render enhanced local UI features. The extension does not modify, block, redirect, or replace any network request or response. Response data is only inspected locally in the browser extension runtime and is not collected, stored on any external server, sold, shared, or transmitted to the developer or any third party.

The webRequestBlocking permission is required in Firefox MV2 because response stream access is attached from a blocking webRequest listener before the response is completed. It is used only to attach the response filter and pass the original response through unchanged.

The host permission is limited to gemini.google.com because the extension only works on Gemini pages and does not need access to other websites.
```

**如果 AMO 有单独字段要求解释 `webRequest`**
```text
Used only on https://gemini.google.com/* to locally observe specific Gemini responses needed for experience-enhancement UI features. The extension does not modify, block, redirect, or replace requests or responses, and does not transmit the observed data outside the local browser.
```

**如果 AMO 有单独字段要求解释 host permission**
```text
Required because the extension only runs on Gemini and needs access to Gemini pages and related same-origin requests to provide its UI enhancements. Access is limited to https://gemini.google.com/* and is not used on other websites.
```

**如果 AMO 有单独字段要求解释 `webRequestBlocking`**
```text
Required by the Firefox MV2 implementation to attach a response stream filter at the correct lifecycle point. The listener passes the original response through unchanged and is not used to block, redirect, or alter traffic.
```

**可附加的开源说明**
```text
This is an open-source project. The Firefox-specific implementation can be reviewed here:
https://github.com/RonkTsang/gemini-chat-extension

Relevant files:
- src/entrypoints/background/firefox.ts
- wxt.config.ts
```

如果你想更强地降低审核风险，建议在源码链接后补一句：

```text
The submitted source package is built from the same repository/commit as the uploaded Firefox build.
```

依据：
- Mozilla 要求披露扩展是否收集或传输数据，并允许声明不收集数据：https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/
- AMO 对打包/压缩/构建后的扩展可能要求提交源码包和构建说明：https://extensionworkshop.com/documentation/publish/source-code-submission/
- Mozilla Add-on Policies 强调功能和数据行为不能让用户意外：https://extensionworkshop.com/documentation/publish/add-on-policies/


Permission review:

- `storage`: required by settings, badge state, quick follow settings, theme settings, and whats-new storage.
- `webRequest`: required by Firefox background interception for Gemini `/mystuff` batchexecute requests.
- `webRequestBlocking`: required because Firefox attaches `filterResponseData` from an `onHeadersReceived` listener registered with `['blocking']`.
- `*://gemini.google.com/*`: required in MV2 `permissions` so Firefox can observe and filter Gemini requests.

## Build And Checks

- [x] `pnpm run compile`
- [x] `pnpm test:run`
- [x] `pnpm run check:i18n`
- [x] `pnpm build`
- [x] `pnpm build:firefox`
- [x] `pnpm zip`
- [x] `pnpm zip:firefox`

## Artifact Checks

- [x] Chrome artifact must not include Gecko settings or Firefox webRequest logic.
- [x] Firefox artifact must include Gecko settings and Firefox permissions.
- [x] Firefox artifact must not include Chrome-only `xhr.content` entrypoint.
- [x] Check Chrome output:
  `rg -n "browser_specific_settings|gecko|filterResponseData|webRequest" .output/chrome-mv3`
- [x] Check Firefox output:
  `rg -n "content-scripts/xhr|world\\\":\\\"MAIN\\\"|startStuffMonitor" .output/firefox-mv2`

## GitHub Actions

- [x] Add Firefox package step to release workflow.
- [ ] Add Firefox build verification to release workflow.
- [ ] Add `pnpm run compile`, `pnpm test:run`, and `pnpm run check:i18n` before release packaging.
- [x] Package both browser targets:
  `pnpm run zip` and `pnpm run zip:firefox`.
- [x] Confirm `.output/*.zip` uploads both Chrome and Firefox zip files to GitHub Release.
- [optional] Add AMO publish/sign job after first manual AMO release is approved.
- [optional] Add GitHub Secrets if AMO automation is enabled:
  `AMO_JWT_ISSUER`, `AMO_JWT_SECRET`.

## AMO Submission

- [ ] Create or confirm Mozilla Developer account.
- [ ] Create Firefox add-on listing.
- [ ] Upload Firefox zip from `pnpm zip:firefox`.
- [ ] Fill description, categories, tags, screenshots, support/homepage links.
- [ ] Provide privacy policy link.
- [ ] Provide data collection declaration.
- [ ] Provide permission explanations.
- [ ] Prepare source package/build instructions if AMO requests source review.

## Manual Firefox QA

- [ ] `/mystuff` media data sync works on first load.
- [ ] `/mystuff` pagination continues to sync data.
- [ ] Switching conversations does not break media data sync.
- [ ] `Open in New Tab` works without Firefox popup blocker.
- [ ] Custom background upload works.
- [ ] Custom background preview works in settings panel.
- [ ] Background blur has no Firefox white-shadow artifact.
- [ ] Light/dark theme switching works.
- [ ] Quick Follow Up inserts quote and focuses Gemini input.
- [ ] Extension reload shows lightweight page refresh toast.
- [ ] Clicking reload toast action refreshes page and clears stale state.

## Release Risks

- [ ] AMO may require stronger justification for `webRequestBlocking`.
- [ ] Firefox MV2 is supported, but MV3 migration should remain tracked.
- [ ] First AMO release should be manual before enabling automated AMO submission.
- [ ] Do not change Gecko ID after release unless intentionally migrating extension identity.
