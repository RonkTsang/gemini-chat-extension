# Setting Panel Component

Setting panel functionality implemented based on design drafts and requirements documents, providing a complete two-level navigation structure.

## Features

- **Sidebar Navigation**: Main navigation fixed on the left, containing all functional modules.
- **Two-level Page Structure**: Supports navigation between list views (L1) and detail views (L2).
- **State Management**: Global state management using Zustand.
- **Responsive Design**: Design system based on Chakra UI.

## Component Structure

```
setting-panel/
├── index.tsx          # Main setting panel component
├── Sidebar.tsx        # Sidebar navigation component
├── ContentArea.tsx    # Content area component
└── README.md
```

## Usage

### Basic Usage

```tsx
import { SettingPanel } from './components/setting-panel'

// The component automatically listens for the 'settings:open' event
function App() {
  return <SettingPanel />
}
```

### Opening the Setting Panel

```tsx
import { useEventEmitter } from './hooks/useEventBus'

function SomeComponent() {
  const { emit } = useEventEmitter()
  
  const openSettings = () => {
    emit('settings:open', { open: true })
  }
  
  return <button onClick={openSettings}>Open Settings</button>
}
```

## State Management

Use Zustand store to manage navigation state:

```tsx
import useSettingStore from './stores/settingStore'

// Usage in React components
const { activeSection, currentView, setActiveSection } = useSettingStore()

// Usage in non-React environments
import { getSettingState, setActiveSection } from './stores/settingStore'
```

## Navigation Structure

### Level 1 Navigation (Sidebar)

- **Prompt Group**
  - Chain Prompt
  - Quick Follow-up
- **Tools Group**
  - Chat outline
  - Theme
- **Others**
  - Support
  - Feedback

### Level 2 Pages

Each level 1 navigation item supports entering a level 2 detail page, which includes:
- Back button (top left corner)
- Page title
- Placeholder content area

## Extension Guide

### Adding a new navigation item

1. Add a new `NavigationSection` type in `src/stores/settingStore.ts`.
2. Add a new item to the `navigationItems` array in `Sidebar.tsx`.
3. Add configuration to `sectionConfigs` in `ContentArea.tsx`.

### Customizing Content Pages

Modify the `LevelOnePage` and `LevelTwoPage` components in `ContentArea.tsx` to replace placeholder content with actual functional components.

## Tech Stack

- **React**: UI Framework
- **Chakra UI v3**: UI Component Library
- **Zustand**: State Management
- **React Icons**: Icon Library
- **TypeScript**: Type Support
