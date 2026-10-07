# Folder state previews

In a development build, open **Gemini Power kit → Folders**, scroll to the bottom,
and expand **Debug**. Choose a **Scenario** to inspect an exceptional state without
filling storage or modifying recovery records.

The preview reuses the real Browser Sync and local recovery warning components.
It covers healthy recovery, automatic cleanup, oversized points, temporarily protected history, automatic snapshot failure, current save failure, pre-operation protection failure, sync
capacity colors, pending writes, failures, capacity notices, measurement failure,
and unavailable/manual account states.

Expand **Storage data** to read actual background measurements for the current
account. This separate panel lists raw bytes and readable sizes, Folder/shared
sync quotas and remaining space, projected writes, organization counts, sync
timestamps and warnings, restore-point counts, the shared recovery budget, local
storage estimates, and the `unlimitedStorage` permission state. **Refresh
measurements** rereads both sources. Switching scenarios does not change these
actual measurements; failed reads show their own error and retain previous data.

Preview actions only show local feedback. They do not export
files, retry sync, or change Folder data. The regular settings above the preview
continue to operate normally. Closing the settings view or switching accounts
resets the preview; it is never saved to storage.

The entry is guarded by `import.meta.env.DEV` and loaded lazily. Production builds
exclude the preview module and its scenario list. Development controls use English
labels; the displayed product UI uses the selected extension language.

Run `pnpm dev` for the development build. After a new build, reload the unpacked
extension and the Gemini page if hot reload has not applied the change.

To add another preview, extend the scenarios in
`src/components/setting-panel/views/folders/FolderDebugPanel.tsx`. Reuse the actual
UI component and keep action callbacks local to the preview.
