import { Button, Dialog, Stack } from '@chakra-ui/react'
import { t } from '@/utils/i18n'

export interface AlertDialogProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void | Promise<void>
  title?: string
  description?: string
  confirmText?: string
  cancelText?: string
  isLoading?: boolean
}

/**
 * A reusable alert dialog component for confirming dangerous actions.
 * 
 * @example
 * ```tsx
 * const [isOpen, setIsOpen] = useState(false)
 * 
 * <AlertDialog
 *   isOpen={isOpen}
 *   onClose={() => setIsOpen(false)}
 *   onConfirm={async () => {
 *     await deleteItem()
 *     setIsOpen(false)
 *   }}
 *   title="Delete Item"
 *   description="Are you sure you want to delete this item? This action cannot be undone."
 * />
 * ```
 */
export function AlertDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmText,
  cancelText,
  isLoading = false
}: AlertDialogProps) {
  const handleConfirm = async () => {
    await onConfirm()
  }

  return (
    <Dialog.Root 
      open={isOpen} 
      onOpenChange={(e) => !e.open && onClose()}
      placement="center"
      role="alertdialog"
      size="sm"
      closeOnInteractOutside={false}  // Alert dialogs require explicit user action
      closeOnEscape={true}
    >
      <Dialog.Backdrop />
      <Dialog.Positioner>
        <Dialog.Content>
          <Dialog.Header>
            <Dialog.Title>
              {title ?? t('common.confirmDialog.title')}
            </Dialog.Title>
            <Dialog.CloseTrigger />
          </Dialog.Header>

          <Dialog.Body>
            {description ?? t('common.confirmDialog.description')}
          </Dialog.Body>

          <Dialog.Footer>
            <Stack direction="row" gap={2} width="100%" justify="flex-end">
              <Button 
                variant="outline" 
                onClick={onClose}
                disabled={isLoading}
                size="sm"
              >
                {cancelText ?? t('common.confirmDialog.cancel')}
              </Button>
              <Button 
                colorPalette="red"
                onClick={handleConfirm}
                loading={isLoading}
                size="sm"
              >
                {confirmText ?? t('common.confirmDialog.confirm')}
              </Button>
            </Stack>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog.Positioner>
    </Dialog.Root>
  )
}

