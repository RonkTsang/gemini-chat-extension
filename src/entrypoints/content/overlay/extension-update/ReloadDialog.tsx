import { Button, Dialog, Stack, Text } from '@chakra-ui/react'
import { i18nCache, CACHE_KEYS } from '@/utils/i18nCache'

interface ReloadDialogProps {
  isOpen: boolean
  onClose: () => void
}

/**
 * Reload Dialog Component
 * Shows when extension context is invalidated (e.g., after extension reload)
 * Uses cached i18n strings since extension APIs are no longer available
 */
export function ReloadDialog({ isOpen, onClose }: ReloadDialogProps) {
  const handleReload = () => {
    // Reload the entire page to get fresh extension context
    window.location.reload()
  }
  
  return (
    <Dialog.Root
      open={isOpen}
      onOpenChange={(e) => !e.open && onClose()}
      placement="center"
      size="md"
      closeOnInteractOutside={false}
      closeOnEscape={false}
    >
      <Dialog.Backdrop />
      <Dialog.Positioner>
        <Dialog.Content>
          <Dialog.Header>
            <Dialog.Title>
              {i18nCache.get(CACHE_KEYS.EXTENSION_UPDATED_TITLE)}
            </Dialog.Title>
            <Dialog.CloseTrigger />
          </Dialog.Header>
          
          <Dialog.Body>
            <Text>{i18nCache.get(CACHE_KEYS.EXTENSION_UPDATED_BODY)}</Text>
          </Dialog.Body>
          
          <Dialog.Footer>
            <Stack direction="row" gap={2} width="100%" justify="flex-end">
              <Button
                variant="outline"
                onClick={onClose}
                size="sm"
              >
                {i18nCache.get(CACHE_KEYS.LATER)}
              </Button>
              <Button
                onClick={handleReload}
                size="sm"
              >
                {i18nCache.get(CACHE_KEYS.RELOAD_PAGE)}
              </Button>
            </Stack>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog.Positioner>
    </Dialog.Root>
  )
}

