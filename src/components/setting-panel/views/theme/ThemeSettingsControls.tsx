import { AppearanceSelector } from './AppearanceSelector'
import { ColorPresets } from './ColorPresets'
import { CustomBackground } from './CustomBackground'
import type { ThemeSettingsController } from './useThemeSettingsController'

interface ThemeSettingsControlsProps {
  controller: ThemeSettingsController
  variant?: 'default' | 'compact'
}

export function ThemeSettingsControls({
  controller,
  variant = 'default',
}: ThemeSettingsControlsProps) {
  return (
    <>
      <AppearanceSelector
        variant={variant}
        value={controller.appearanceState.mode}
        onChange={controller.handleAppearanceChange}
        isLoading={false}
      />
      <ColorPresets
        variant={variant}
        activeKey={controller.activeKey}
        onSelect={controller.handleSelect}
        isLoading={false}
      />
      <CustomBackground
        variant={variant}
        state={controller.backgroundState}
        isLoading={controller.isBackgroundLoading}
        onToggleBackground={controller.handleToggleBackground}
        onBlurChange={controller.handleBlurChange}
        onToggleSidebarScrim={controller.handleToggleSidebarScrim}
        onSidebarScrimIntensityChange={controller.handleSidebarScrimIntensityChange}
        onToggleMessageGlass={controller.handleToggleMessageGlass}
        onMessageGlassTransparencyChange={
          controller.handleMessageGlassTransparencyChange
        }
        onMessageGlassBlurChange={controller.handleMessageGlassBlurChange}
        onResetGlassSettings={controller.handleResetGlassSettings}
        onWelcomeGreetingReadabilityModeChange={
          controller.handleWelcomeGreetingReadabilityModeChange
        }
        onUploadFile={controller.handleUploadFile}
        onRemoveImage={controller.handleRemoveImage}
      />
    </>
  )
}
