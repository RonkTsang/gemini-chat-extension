# GitHub About Metadata

GitHub stores repository **Description**, **Website**, and **Topics** outside the Git repository. This document is the version-controlled source of truth for the public About panel of `RonkTsang/gemini-chat-extension`.

## Canonical values

| Field | Value |
| --- | --- |
| Description | Open-source browser extension for Google Gemini with themes, chat navigation, shortcuts, and prompt automation. |
| Website | `https://gpk.ronktsang.com/` |

### Topics

```text
browser-extension
chrome-extension
firefox-extension
gemini
google-gemini
productivity
prompt-automation
prompt-engineering
react
typescript
wxt
```

## How to update GitHub

1. Open the repository home page on GitHub.
2. In the **About** panel, select the settings button.
3. Replace the Description and Website with the canonical values above.
4. Replace the complete Topics list with the canonical list above, then save.
5. Confirm the live result:

   ```bash
   gh repo view RonkTsang/gemini-chat-extension \
     --json description,homepageUrl,repositoryTopics,url
   ```

The Website must point to the product documentation site, not directly to one browser store. Store links belong in the README and on the website, where both Chrome and Firefox are represented.

## Maintenance rules

- Update this file and GitHub About metadata in the same change when the product scope or canonical website changes.
- Use specific, user-facing product topics before framework topics; do not add generic or duplicate keywords only for search ranking.
- Keep the Description factual, concise, and within GitHub's current length limit.
