---
title: Privacy Policy
description: Privacy policy for Gemini Power Kit
---

**Last Updated:** July 4, 2026

Thank you for using Gemini Power Kit ("the Extension"). This Privacy Policy explains what the Extension handles locally, what it stores in your browser, and what it does not collect or share.

## 1. No Developer Data Collection

Gemini Power Kit is designed to run locally in your browser on `gemini.google.com`.

We do not operate a backend service for the Extension. We do not collect, receive, sell, share, or use your Gemini conversations, prompts, responses, uploaded files, settings, browsing history, or account information for advertising or analytics.

Gemini itself is provided by Google. Your normal Gemini traffic remains between your browser and Google's services according to Google's own terms and policies. Gemini Power Kit does not send that data to developer-controlled servers.

## 2. Data Handled Locally

The Extension reads or handles the following information locally only when needed to provide its features:

- Gemini page content, such as conversation titles, selected text, visible prompts, visible responses, generated media state, and Deep Research completion state.
- Gemini Library media metadata, such as conversation IDs, response IDs, titles, timestamps, resource IDs, and thumbnails, used for the open-in-new-tab helper.
- Notification content, such as a short local title/message, page foreground state, response type, optional local image preview, and notification click state.
- User-created prompt data, including Quick Follow-up prompts, Chain Prompt workflows, variables, and step text.
- User preferences, including feature toggles, theme settings, notification settings, audio settings, release-note state, onboarding hints, and badge state.
- User-provided files, such as custom theme background images and custom notification audio files.

This information is processed in your browser. The Extension does not transmit it to developer-controlled servers.

## 3. Local Storage

Gemini Power Kit stores data in browser-managed storage so your choices persist:

- `browser.storage.sync` is used for small settings such as feature toggles, selected theme key, and notification preferences. Depending on your browser settings, the browser may sync this data through your signed-in browser account. The Extension developer does not receive it.
- `browser.storage.local` is used for local UI state such as feature hints, release-note state, badge state, and theme background settings.
- IndexedDB is used for locally stored Quick Follow-up prompts, Chain Prompt workflows, uploaded theme background images, and uploaded notification audio files.
- `browser.storage.session` is used for temporary runtime state, such as response-complete notification permission intent and Deep Research notification tracking.
- In-memory caches are used for temporary Gemini Library metadata and are cleared when the page/module stops or reloads.
- Gemini theme bridge code may read or update Gemini page `localStorage` theme keys so the page and Extension theme stay in sync.

You can remove stored Extension data by deleting it inside the Extension UI where available, clearing the browser's extension/site data, or uninstalling the Extension.

## 4. Permissions

The Extension uses permissions only to provide its Gemini productivity features.

### Shared Gemini Access

The Extension runs only on `gemini.google.com`. This access is required to load the content script and provide features such as Chat Outline, Quick Follow-up, Chain Prompt controls, visual themes, smarter tab titles, Library helpers, and notification content extraction.

The Extension does not run on unrelated websites and does not collect browsing history outside `gemini.google.com`.

### Storage

The `storage` permission is required to save settings and browser-local data described above. It is not used to collect, sell, or share personal information.

### Chrome Permissions

On Chrome, response-complete notifications are optional. The Extension requests notification-related permissions only after you explicitly enable the feature:

- `notifications`: shows response-complete and test notifications, clears notifications, and returns you to the originating Gemini tab when possible.
- `webRequest`: observes Gemini request lifecycle events needed to detect standard response, generated media, and Deep Research completion. For this notification feature, it classifies request URLs and completion events; it does not inspect request bodies or response bodies.
- Optional host access for `*://gemini.google.com/*`: required by Chrome so `webRequest` can observe Gemini requests for response-complete notifications.
- `offscreen`: requested only when notification sound is enabled. It creates a Chrome Offscreen Document to play the bundled notification sound or your locally uploaded audio file.

### Firefox Permissions

On Firefox, `notifications`, `webRequest`, `webRequestBlocking`, and `*://gemini.google.com/*` are required permissions. Firefox cannot reliably preserve the user gesture needed to request these permissions later from the in-page settings flow, so they are declared upfront for the Firefox build.

Firefox uses WebRequest APIs for response-complete notifications and for Gemini Library media parsing. Library response parsing is handled locally in the browser and is used only to power the Library open-in-new-tab helper. Firefox does not expose the custom notification audio setting.

## 5. What We Do Not Do

Gemini Power Kit does not:

- Sell user data.
- Use user data for advertising or analytics.
- Transfer user data to data brokers or advertising platforms.
- Collect Google account information.
- Collect authentication credentials.
- Collect financial, payment, health, or location information.
- Collect web browsing history outside `gemini.google.com`.
- Execute remotely hosted JavaScript.

Sensitive information may appear inside Gemini if you enter it there. The Extension may read visible Gemini page content locally to provide the features you requested, but it does not separately collect, transmit, or share that content.

## 6. Changes to This Policy

We may update this Privacy Policy if the Extension's functionality, permissions, or storage behavior changes. Updates will be posted on this page.

## 7. Contact Us

If you have any questions about this Privacy Policy, please open an issue on our [GitHub repository](https://github.com/RonkTsang/gemini-chat-extension).
