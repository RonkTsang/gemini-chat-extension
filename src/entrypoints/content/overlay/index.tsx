import { Provider } from "@/components/ui/provider-shadow-dom"
import { StrictMode, useCallback, useState } from "react"
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
import { Onboarding } from './onboarding'

function App() {
  useSyncColorMode()
  const [onboardingFinished, setOnboardingFinished] = useState(false)
  const dismissOnboarding = useCallback(() => setOnboardingFinished(true), [])

  return (
    <>
      <PageShortcutController />
      <SettingPanel />
      {!onboardingFinished && <Onboarding onDismiss={dismissOnboarding} />}
      <ThemeFloatingPanel />
      <ChatSettingsPanel />
      <Toaster />
      <QuickFollowUp />
      <ExtensionUpdate />
      <WhatsNew />
      <ThemeBloomOverlay />
    </>
  )
}


export const renderOverlay = (container: HTMLElement) => {
  const overlay = document.createElement('div');
  container.append(overlay);
  const root = createRoot(overlay);
  let mounted = true;
  root.render(
    <StrictMode>
      <Provider>
        <App />
      </Provider>
    </StrictMode>,
  )

  return () => {
    if (!mounted) return;
    mounted = false;
    root.unmount();
    overlay.remove();
  };
};
