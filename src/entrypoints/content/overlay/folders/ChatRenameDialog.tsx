import { CloseButton, Dialog, Field, HStack, Input, Portal } from '@chakra-ui/react'
import { useRef, useState } from 'react'

import { GeminiDialogButton, GeminiDialogContent } from '@/components/ui/gemini'
import { folderRuntime, type FolderDialogState } from '@/entrypoints/content/folders/runtime'
import { tt } from '@/utils/i18n'

export function ChatRenameDialog({ dialog }: {
  dialog: Extract<FolderDialogState, { kind: 'rename-chat' }>
}) {
  const [title, setTitle] = useState(dialog.chatTitle)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()
  const savingRef = useRef(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const canSave = Boolean(title.normalize('NFKC').trim()) && !saving

  const requestClose = () => {
    if (!savingRef.current) folderRuntime.closeDialog()
  }

  const save = async () => {
    if (savingRef.current || !canSave) return
    savingRef.current = true
    setSaving(true)
    setError(undefined)
    try {
      await folderRuntime.renameChat(dialog.folderId, dialog.chatId, title)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : tt('folders_chat_title_save_failed', 'Could not save this chat title.'))
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  return (
    <Dialog.Root
      open
      onOpenChange={(event) => { if (!event.open) requestClose() }}
      initialFocusEl={() => inputRef.current}
      placement="center"
      size="sm"
      closeOnInteractOutside={false}
    >
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <GeminiDialogContent>
            <Dialog.Header>
              <Dialog.Title>{tt('folders_rename_chat', 'Rename')}</Dialog.Title>
              <Dialog.CloseTrigger asChild>
                <CloseButton size="sm" rounded="full" disabled={saving} />
              </Dialog.CloseTrigger>
            </Dialog.Header>
            <Dialog.Body>
              <Field.Root invalid={Boolean(error)}>
                <Input
                  ref={inputRef}
                  aria-label={tt('folders_chat_title', 'Chat title')}
                  aria-invalid={Boolean(error)}
                  aria-busy={saving}
                  value={title}
                  readOnly={saving}
                  maxLength={500}
                  onChange={(event) => setTitle(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.nativeEvent.isComposing && canSave) {
                      event.preventDefault()
                      void save()
                    }
                  }}
                />
                <Field.ErrorText>{error}</Field.ErrorText>
              </Field.Root>
            </Dialog.Body>
            <Dialog.Footer>
              <HStack justify="flex-end" width="100%">
                <GeminiDialogButton loading={saving} disabled={!canSave} onClick={() => void save()}>
                  {tt('folders_save', 'Save')}
                </GeminiDialogButton>
              </HStack>
            </Dialog.Footer>
          </GeminiDialogContent>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  )
}
