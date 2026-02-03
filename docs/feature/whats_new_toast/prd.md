# "What's New" Toast PRD

| **Document Version** | **V1.0** |
| :--- | :--- |
| **Feature Name** | What's New Notification |
| **Created Date** | Feb 2, 2026 |
| **Status** | In Progress |

## 1. Background
When users upgrade the extension, they often don't notice the new features or improvements immediately. This lack of visibility prevents users from benefiting from the latest enhancements and slows down the adoption rate of new functionalities.

## 2. Goal
Ensure that new features and updates are immediately discoverable and accessible to users upon upgrading.

## 3. Solution
Implement a "What's New" toast notification that appears after an update.

### 3.1 Notification Logic
- **Storage**: Use local storage to track the last seen version number (`browser.runtime.getManifest().version`).
- **Trigger**: Check for updates when the page is activated and the system is in an `idle` state.
- **Validation Logic**:
  - If no version is stored locally: Skip (first-time install or cleared storage).
  - If the current version is less than or equal to the stored version: Skip.
  - If the current version is greater than the stored version:
    - If release notes are available for the current version: Display the "What's New" toast and update the stored version number.
    - If no release notes are available: Update the stored version number without showing the toast.

### 3.2 UI/UX Design
1.  **Placement**: Bottom-right corner of the page.
2.  **Component Structure & Content**:
    - **Header**: "✨ What's new" + Version Tag (consistent with the About page style).
    - **Close Button**: Located in the top-right corner.
    - **Feature List**: Display up to two items, each consisting of:
        - Feature Name
        - Brief Description
    - **Footer**: A "Release Notes" link that redirects users to the full changelog.
    - **Sizing**: Fixed width with a defined maximum height.
3.  **Components**: Built using Chakra UI. Evaluate if the existing `Toast` component can be reused or extended.
4.  **Requirements**:
    - Polished and high-quality UI.
    - Refer to the design mockup: `docs/feature/whats_new_toast/ui.png`.

### 3.3 Implementation Details
1.  Integrate the "What's New" toast component into `src/entrypoints/content/overlay/index.tsx`.
2.  Release notes content should be managed via a configuration file, manually updated by developers for each release.
3.  The component should dynamically render content based on the configuration file.
4.  Support for internationalization (i18n) is required:
    ```json
    {
      "whatsnew": {
        "title_1": "xxx",
        "description_1": "xxx"
      }
    }
    ```

## 4. Others
1.  All code comments must be in English.
2.  Code quality must meet production standards.
