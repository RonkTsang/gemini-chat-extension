import { Provider } from "@/components/ui/provider-shadow-dom"
import { StrictMode, useEffect } from "react"
import { createRoot } from "react-dom/client"
import { Button, HStack, CloseButton, Dialog, Portal } from "@chakra-ui/react"
import { Toaster, toaster } from "@/components/ui/toaster"
import { SettingPanel } from "@/components/setting-panel"
import { ColorModeButton, useColorMode } from "@/components/ui/color-mode"
import QuickFollowUp from "./quick-follow-up"

function App() {
  const { setTheme } = useColorMode();

  useEffect(() => {
    setTheme('system');
  }, [])

  return (
    <>
      <SettingPanel />
      <Toaster />
      <QuickFollowUp />
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
