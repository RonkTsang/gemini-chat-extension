import { Provider } from "@/components/ui/provider-shadow-dom"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { Toaster } from "@/components/ui/toaster"
import { SettingPanel } from "@/components/setting-panel"
import { useSyncColorMode } from "@/hooks/useSyncColorMode"
import QuickFollowUp from "./quick-follow-up"
import ExtensionUpdate from "./extension-update"

function App() {
  useSyncColorMode()

  return (
    <>
      <SettingPanel />
      <Toaster />
      <QuickFollowUp />
      <ExtensionUpdate />
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
