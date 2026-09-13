import {
  CloseButton,
  Dialog,
  Field,
  HStack,
  Input,
  Portal,
  Stack,
  Text,
} from '@chakra-ui/react'
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'

import { FolderAppearancePicker } from '@/components/folders/FolderAppearancePicker'
import { GeminiDialogButton, GeminiDialogContent } from '@/components/ui/gemini'
import type { FolderUpdateInput } from '@/domain/folder/commands'
import {
  DEFAULT_FOLDER_COLOR_VALUE,
  DEFAULT_FOLDER_ICON_KEY,
  type FolderColorValue,
  type FolderIconKey,
} from '@/domain/folder/appearance'
import { folderRuntime } from '@/entrypoints/content/folders/runtime'
import { tt } from '@/utils/i18n'

const FOLDER_NAME_PLACEHOLDERS = [
  { key: 'folders_icon_travel', fallback: 'Travel' },
  { key: 'folders_icon_pets', fallback: 'Pets' },
] as const

function FolderEditorDialog({ folderId }: { folderId?: string }) {
  const state = useSyncExternalStore(folderRuntime.subscribe, folderRuntime.getSnapshot, folderRuntime.getSnapshot)
  const folder = useMemo(
    () => folderId ? state.projection?.folders.find((entry) => entry.id === folderId) : undefined,
    [folderId, state.projection?.folders],
  )
  const [name, setName] = useState('')
  const [iconKey, setIconKey] = useState<FolderIconKey>(DEFAULT_FOLDER_ICON_KEY)
  const [colorValue, setColorValue] = useState<FolderColorValue>(DEFAULT_FOLDER_COLOR_VALUE)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()
  const [placeholderIndex, setPlaceholderIndex] = useState(0)

  const isEditing = Boolean(folderId)
  const editorOpen = state.dialog?.kind === 'create' || state.dialog?.kind === 'edit'
  const addToChat = state.dialog?.kind === 'create' ? state.dialog.addToChat : undefined
  const initial = folder
    ? { name: folder.name, iconKey: folder.iconKey, colorValue: folder.colorValue }
    : { name: '', iconKey: DEFAULT_FOLDER_ICON_KEY, colorValue: DEFAULT_FOLDER_COLOR_VALUE }
  const dirty = name !== initial.name || iconKey !== initial.iconKey || colorValue !== initial.colorValue
  const normalizedName = name.normalize('NFKC').trim()
  const canSave = Boolean(normalizedName) && (!isEditing || dirty) && !saving

  useEffect(() => {
    setName(initial.name)
    setIconKey(initial.iconKey)
    setColorValue(initial.colorValue)
    setError(undefined)
    setSaving(false)
  }, [folderId, initial.colorValue, initial.iconKey, initial.name])

  useEffect(() => {
    if (editorOpen) setPlaceholderIndex(Math.floor(Math.random() * FOLDER_NAME_PLACEHOLDERS.length))
  }, [editorOpen])

  const requestClose = () => {
    if (saving) return
    folderRuntime.closeDialog()
  }

  const save = async () => {
    if (!normalizedName) {
      setError(tt('folders_name_required', 'Enter a folder name.'))
      return
    }
    setSaving(true)
    setError(undefined)
    try {
      if (folderId) {
        const patch: FolderUpdateInput = {}
        if (normalizedName !== initial.name) patch.name = normalizedName
        if (iconKey !== initial.iconKey) patch.iconKey = iconKey
        if (colorValue !== initial.colorValue) patch.colorValue = colorValue
        await folderRuntime.updateFolder(folderId, patch)
      } else {
        await folderRuntime.createFolder(normalizedName, iconKey, colorValue, addToChat)
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : tt('folders_save_failed', 'Could not save this folder.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Dialog.Root
        open={Boolean(state.dialog && (state.dialog.kind === 'create' || state.dialog.kind === 'edit'))}
        onOpenChange={(event) => { if (!event.open) requestClose() }}
        placement="center"
        size="sm"
        closeOnInteractOutside={false}
      >
        <Portal>
          <Dialog.Backdrop />
          <Dialog.Positioner>
            <GeminiDialogContent>
              <Dialog.Header>
                <Dialog.Title>{isEditing ? tt('folders_edit_folder', 'Edit folder') : tt('folders_new_folder', 'New folder')}</Dialog.Title>
                <Dialog.CloseTrigger asChild>
                  <CloseButton size="sm" rounded="full" disabled={saving} />
                </Dialog.CloseTrigger>
              </Dialog.Header>
              <Dialog.Body>
                <Stack gap={5}>
                  <Field.Root invalid={Boolean(error)} required>
                    <Field.Label>{tt('folders_name', 'Folder name')}</Field.Label>
                    <HStack
                      align="center"
                      gap={0}
                      width="100%"
                      height="36px"
                      borderWidth="1px"
                      borderColor={error ? 'red.400' : 'border'}
                      borderRadius="1rem"
                      px="1px"
                      transition="border-color 160ms ease, box-shadow 160ms ease"
                      _focusWithin={{
                        borderColor: error ? 'red.400' : 'border.emphasized',
                        boxShadow: error ? undefined : '0 0 0 1px var(--chakra-colors-border-emphasized)',
                      }}
                    >
                      <FolderAppearancePicker
                        value={{ iconKey, colorValue }}
                        onChange={(appearance) => {
                          setIconKey(appearance.iconKey)
                          setColorValue(appearance.colorValue)
                        }}
                      />
                      <Input
                        autoFocus
                        value={name}
                        placeholder={tt(
                          FOLDER_NAME_PLACEHOLDERS[placeholderIndex].key,
                          FOLDER_NAME_PLACEHOLDERS[placeholderIndex].fallback,
                        )}
                        aria-invalid={Boolean(error)}
                        maxLength={60}
                        height="34px"
                        minW={0}
                        borderWidth={0}
                        borderRadius="0 14px 14px 0"
                        px="8px"
                        boxShadow="none"
                        _placeholder={{ color: 'fg.muted', opacity: 1 }}
                        _focusVisible={{ boxShadow: 'none', outline: 'none' }}
                        onChange={(event) => setName(event.target.value)}
                        onKeyDown={(event) => { if (event.key === 'Enter' && canSave) void save() }}
                      />
                    </HStack>
                    <Field.HelperText>{name.length}/60</Field.HelperText>
                    <Field.ErrorText>{error}</Field.ErrorText>
                  </Field.Root>
                </Stack>
              </Dialog.Body>
              <Dialog.Footer>
                <HStack justify="flex-end" width="100%">
                  <GeminiDialogButton onClick={() => void save()} loading={saving} disabled={!canSave}>{isEditing ? tt('folders_save', 'Save') : tt('folders_create', 'Create')}</GeminiDialogButton>
                </HStack>
              </Dialog.Footer>
            </GeminiDialogContent>
          </Dialog.Positioner>
        </Portal>
      </Dialog.Root>

    </>
  )
}

function FolderConfirmationDialog() {
  const state = useSyncExternalStore(folderRuntime.subscribe, folderRuntime.getSnapshot, folderRuntime.getSnapshot)
  const dialog = state.dialog
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string>()

  useEffect(() => { setWorking(false); setError(undefined) }, [dialog])
  if (!dialog || (dialog.kind !== 'delete-folder' && dialog.kind !== 'remove-membership' && dialog.kind !== 'delete-chat')) return null

  const folder = state.projection?.folders.find((entry) => entry.id === dialog.folderId)
  const title = dialog.kind === 'delete-folder'
    ? tt('folders_delete_folder', 'Delete folder')
    : dialog.kind === 'delete-chat'
      ? tt('folders_delete_chat', 'Delete chat')
    : tt('folders_remove_from_folder', 'Remove from folder')
  const description = dialog.kind === 'delete-folder'
    ? `Delete “${folder?.name ?? ''}”? ${dialog.affectedChatCount} chat${dialog.affectedChatCount === 1 ? '' : 's'} will be removed from this Folder index. Gemini chats will not be deleted.`
    : dialog.kind === 'delete-chat'
      ? 'Delete this Gemini chat permanently? It will be removed from every Folder only after Gemini confirms deletion. This cannot be undone.'
    : `Remove this chat from “${folder?.name ?? ''}”? Gemini chat will not be deleted.`

  const confirm = async () => {
    setWorking(true)
    setError(undefined)
    try {
      if (dialog.kind === 'delete-folder') await folderRuntime.deleteFolder(dialog.folderId)
      else if (dialog.kind === 'delete-chat') await folderRuntime.deleteChat(dialog.folderId, dialog.chatId)
      else await folderRuntime.removeMembership(dialog.folderId, dialog.chatId)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : tt('folders_save_failed', 'Could not complete this action.'))
    } finally {
      setWorking(false)
    }
  }

  return (
    <Dialog.Root open onOpenChange={(event) => { if (!event.open && !working) folderRuntime.closeDialog() }} placement="center" size="sm" role="alertdialog" closeOnInteractOutside={false}>
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <GeminiDialogContent>
            <Dialog.Header><Dialog.Title>{title}</Dialog.Title></Dialog.Header>
            <Dialog.Body>
              <Stack gap={2}><Text>{description}</Text>{error ? <Text color="fg.error" fontSize="sm">{error}</Text> : null}</Stack>
            </Dialog.Body>
            <Dialog.Footer>
              <HStack justify="flex-end" width="100%">
                <GeminiDialogButton variant="outline" disabled={working} onClick={() => folderRuntime.closeDialog()}>{tt('folders_cancel', 'Cancel')}</GeminiDialogButton>
                <GeminiDialogButton colorPalette="red" loading={working} onClick={() => void confirm()}>{dialog.kind === 'delete-folder' ? tt('folders_delete_folder', 'Delete folder') : dialog.kind === 'delete-chat' ? tt('folders_delete_chat', 'Delete chat') : tt('folders_remove', 'Remove')}</GeminiDialogButton>
              </HStack>
            </Dialog.Footer>
          </GeminiDialogContent>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  )
}

export function FolderDialogs() {
  const state = useSyncExternalStore(folderRuntime.subscribe, folderRuntime.getSnapshot, folderRuntime.getSnapshot)
  const folderId = state.dialog?.kind === 'edit' ? state.dialog.folderId : undefined
  return (
    <>
      <FolderEditorDialog folderId={folderId} />
      <FolderConfirmationDialog />
    </>
  )
}
