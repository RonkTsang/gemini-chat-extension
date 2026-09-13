import { Provider } from "@/components/ui/provider-shadow-dom"
import { StrictMode, memo } from "react"
import { createRoot } from "react-dom/client"
import { Toaster } from "@/components/ui/toaster"
import { SettingPanel } from "@/components/setting-panel"
import { PageShortcutController } from "@/components/page-shortcuts/PageShortcutController"
import { ThemeFloatingPanel } from "@/components/theme-floating-panel"
import { ChatSettingsPanel } from "@/components/chat-settings-panel"
import { useSyncColorMode } from "@/hooks/useSyncColorMode"
import QuickFollowUp from "./quick-follow-up"
import ExtensionUpdate from "./extension-update"
import WhatsNew from "./whats-new"
import { ThemeBloomOverlay } from '@/components/theme-bloom-overlay'
import { FolderDialogs } from './folders/FolderDialogs'
import { FolderPicker } from './folders/FolderPicker'
import { FolderActionMenu } from './folders/FolderActionMenu'
import { DevBuildBadge } from './DevBuildBadge'

function App() {
  useSyncColorMode()

  return (
    <>
      <PageShortcutController />
      <SettingPanel />
      <ThemeFloatingPanel />
      <ChatSettingsPanel />
      <Toaster />
      <QuickFollowUp />
      <ExtensionUpdate />
      <WhatsNew />
      <ThemeBloomOverlay />
      <FolderPicker />
      <FolderActionMenu />
      <FolderDialogs />
      <DevBuildBadge />
    </>
  )
}


export const renderOverlay = (container: HTMLElement) => {
  const overlay = document.createElement('div');
  container.append(overlay);
  createRoot(overlay).render(
    <StrictMode>
      <Provider>
        <App />
      </Provider>
    </StrictMode>,
  )
};
