import { Button, type ButtonProps } from '@chakra-ui/react'
import { forwardRef } from 'react'
import { HiOutlineAdjustments } from 'react-icons/hi'
import { tt } from '@/utils/i18n'

interface OpenThemeStudioButtonProps extends ButtonProps {
  onClick: () => void
}

export const OpenThemeStudioButton = forwardRef<HTMLButtonElement, OpenThemeStudioButtonProps>(
  function OpenThemeStudioButton({ onClick, ...buttonProps }, ref) {
    return (
      <Button
        ref={ref}
        {...buttonProps}
        width="100%"
        size="md"
        variant="solid"
        bg="linear-gradient(135deg, color-mix(in srgb, var(--gem-sys-color--primary, #8e42f5) 94%, #ffffff 6%), color-mix(in srgb, var(--gem-sys-color--primary, #8e42f5) 82%, #1f1433 18%))"
        color="var(--gem-sys-color--on-primary, #ffffff)"
        border="1px solid"
        borderColor="color-mix(in srgb, var(--gem-sys-color--primary, #8e42f5) 54%, #ffffff 46%)"
        boxShadow="inset 0 1px 0 rgba(255,255,255,0.26), 0 0 0 1px color-mix(in srgb, var(--gem-sys-color--primary, #8e42f5) 28%, transparent), 0 16px 32px -24px var(--gem-sys-color--primary, #8e42f5)"
        onClick={onClick}
        _hover={{
          transform: 'translateY(-1px)',
          bg: 'linear-gradient(135deg, color-mix(in srgb, var(--gem-sys-color--primary, #8e42f5) 88%, #ffffff 12%), color-mix(in srgb, var(--gem-sys-color--primary, #8e42f5) 86%, #1f1433 14%))',
          borderColor: 'color-mix(in srgb, var(--gem-sys-color--primary, #8e42f5) 42%, #ffffff 58%)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.34), 0 0 0 1px color-mix(in srgb, var(--gem-sys-color--primary, #8e42f5) 38%, transparent), 0 18px 36px -24px var(--gem-sys-color--primary, #8e42f5)',
        }}
        _active={{
          transform: 'translateY(0)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.2), 0 0 0 1px color-mix(in srgb, var(--gem-sys-color--primary, #8e42f5) 24%, transparent), 0 12px 24px -22px var(--gem-sys-color--primary, #8e42f5)',
        }}
        transition="transform 0.18s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.18s cubic-bezier(0.16, 1, 0.3, 1), border-color 0.18s ease, background 0.18s ease"
      >
        <HiOutlineAdjustments />
        {tt('settingPanel.theme.customizeOnPage', 'Edit on Gemini page')}
      </Button>
    )
  },
)
