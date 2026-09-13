import { Box, Button, Text, VStack } from '@chakra-ui/react'
import { useState, useSyncExternalStore } from 'react'
import { LuPlus } from 'react-icons/lu'

import { getFolderColor, getFolderIcon } from '@/components/folders/folderAppearance'
import { compareAscii } from '@/domain/folder/order-key'
import { folderRuntime } from '@/entrypoints/content/folders/runtime'
import { logFolderTrace, logFolderTraceError } from '@/utils/folderTrace'
import { tt } from '@/utils/i18n'
import { AnchoredGeminiMenu, AnchoredGeminiMenuItem } from './AnchoredGeminiMenu'

export function FolderPicker() {
  const state = useSyncExternalStore(folderRuntime.subscribe, folderRuntime.getSnapshot, folderRuntime.getSnapshot)
  const [error, setError] = useState<string>()
  const [pendingFolderId, setPendingFolderId] = useState<string>()
  const picker = state.picker; const projection = state.projection
  if (!picker || !projection) return null
  const memberships = new Set(projection.memberships.filter(row => !row.deletedAt && row.chatId === picker.chatId).map(row => row.folderId))
  const folders = projection.folders.filter((folder) => !folder.deletedAt).sort((a, b) => compareAscii(a.orderKey, b.orderKey))
  const addToFolder = async (folderId: string) => {
    const { chatId, traceId, cachedTitle } = picker
    setError(undefined)
    setPendingFolderId(folderId)
    logFolderTrace(traceId, 'picker.folder-selected', {
      folderId,
      chatId,
      cachedTitleFound: Boolean(cachedTitle),
    })
    try {
      await folderRuntime.addMembership(folderId, chatId, cachedTitle, traceId)
      logFolderTrace(traceId, 'picker.command-resolved', { folderId, chatId })
    } catch (nextError) {
      logFolderTraceError(traceId, 'picker.command-rejected', nextError, { folderId, chatId })
      setError(nextError instanceof Error ? nextError.message : tt('folders_save_failed', 'Could not complete this action.'))
    } finally {
      setPendingFolderId(undefined)
    }
  }
  return (
    <AnchoredGeminiMenu
      data-gpk-folder-picker
      anchorRect={picker.anchorRect}
      ariaLabel={tt('folders_add_to_folder', 'Add to Folder')}
      role="dialog"
      width={200}
      maxHeight={Math.min(600, Math.max(160, window.innerHeight - 16))}
      onClose={() => folderRuntime.closePicker()}
    >
      <Button
        size="sm"
        width="100%"
        justifyContent="flex-start"
        variant="ghost"
        mb={2}
        onClick={() => folderRuntime.openCreateDialog({
          chatId: picker.chatId,
          cachedTitle: picker.cachedTitle,
          traceId: picker.traceId,
        })}
      >
        <LuPlus />
        {tt('folders_new_folder', 'New Folder')}
      </Button>
      <VStack align="stretch" gap={0} maxH="520px" overflowY="auto">
        {folders.map((folder) => {
          const selected = memberships.has(folder.id)
          const FolderIcon = getFolderIcon(folder.iconKey)
          return (
            <AnchoredGeminiMenuItem
              key={folder.id}
              icon={<Box as={FolderIcon} color={getFolderColor(folder.colorValue)} />}
              disabled={selected || Boolean(pendingFolderId)}
              loading={pendingFolderId === folder.id}
              role="menuitemcheckbox"
              aria-checked={selected}
              onClick={() => void addToFolder(folder.id)}
            >
              {folder.name}
            </AnchoredGeminiMenuItem>
          )
        })}
        {!folders.length ? (
          <Text fontSize="sm" color="fg.muted" px="8px" py="6px">
            {tt('folders_no_folders', 'Create a Folder to organize this chat.')}
          </Text>
        ) : null}
        {error ? <Text fontSize="xs" color="fg.error" px="8px" py="6px">{error}</Text> : null}
      </VStack>
    </AnchoredGeminiMenu>
  )
}
