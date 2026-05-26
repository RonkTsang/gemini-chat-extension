import { Button } from '@chakra-ui/react'
import { HiOutlineAdjustments } from 'react-icons/hi'
import { tt } from '@/utils/i18n'

interface OpenThemeStudioButtonProps {
  onClick: () => void
}

export function OpenThemeStudioButton({ onClick }: OpenThemeStudioButtonProps) {
  return (
    <Button
      width="100%"
      size="md"
      variant="solid"
      colorPalette="colorPalette"
      shadow="sm"
      onClick={onClick}
      _hover={{
        transform: 'translateY(-1px)',
        shadow: 'md',
      }}
      _active={{
        transform: 'translateY(0)',
        shadow: 'sm',
      }}
      transition="transform 0.15s ease, box-shadow 0.15s ease"
    >
      <HiOutlineAdjustments />
      {tt('settingPanel.theme.customizeOnPage', 'Customize on page')}
    </Button>
  )
}
