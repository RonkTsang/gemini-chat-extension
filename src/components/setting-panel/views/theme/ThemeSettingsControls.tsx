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
        onBackgroundPositionChange={controller.handleBackgroundPositionChange}
        onToggleSidebarScrim={controller.handleToggleSidebarScrim}
        onSidebarScrimIntensityChange={controller.handleSidebarScrimIntensityChange}
        onToggleMessageGlass={controller.handleToggleMessageGlass}
        onMessageGlassBackgroundVisibilityChange={
          controller.handleMessageGlassBackgroundVisibilityChange
        }
        onMessageGlassBlurChange={controller.handleMessageGlassBlurChange}
        onInputAreaTransparencyPreviewChange={
          controller.handleInputAreaTransparencyPreviewChange
        }
        onInputAreaTransparencyChange={
          controller.handleInputAreaTransparencyChange
        }
        onResetGlassSettings={controller.handleResetGlassSettings}
        effectiveTheme={controller.effectiveTheme}
        chatTextColor={controller.chatTextColor}
        defaultChatTextColor={controller.defaultChatTextColor}
        onChatTextColorChange={controller.handleChatTextColorChange}
        onResetChatTextColor={controller.handleResetChatTextColor}
        onWelcomeGreetingReadabilityModeChange={
          controller.handleWelcomeGreetingReadabilityModeChange
        }
        onUploadFile={controller.handleUploadFile}
        onRemoveImage={controller.handleRemoveImage}
      />
    </>
  )
}
