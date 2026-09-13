# Chakra Dialog

- In content-script Shadow DOM, wrap the backdrop and positioner in `Portal`; for editor or confirmation dialogs, set `closeOnInteractOutside={false}` to prevent unexpected dismissal after native-page focus changes.
- References: `src/entrypoints/content/overlay/folders/FolderDialogs.tsx`, `src/components/setting-panel/index.tsx`.
