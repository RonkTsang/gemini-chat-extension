import { HStack, IconButton, Text, Button } from '@chakra-ui/react'
import { useSyncExternalStore } from 'react'
import { LuX } from 'react-icons/lu'
import { folderNewChat } from '@/entrypoints/content/folders/new-chat'
import { folderRuntime } from '@/entrypoints/content/folders/runtime'
import { t, tt } from '@/utils/i18n'
import { getFolderColor, getFolderIcon } from './folderAppearance'

export function FolderNewChatLabel() {
  const intent = useSyncExternalStore(folderNewChat.subscribe, folderNewChat.getSnapshot)
  const state = useSyncExternalStore(folderRuntime.subscribe, folderRuntime.getSnapshot)
  const folder = state.projection?.folders.find((row) => row.id === intent?.folderId)
  if (!intent || !folder || intent.phase === 'opening' || (intent.phase === 'saved' && !intent.error)) return null
  const Icon = getFolderIcon(folder.iconKey)
  return (
    <HStack data-gpk-folder-new-chat-label gap={2} width="fit-content" maxW="calc(100% - 12px)"
      margin="6px" padding="6px 10px" borderRadius="12px"
      bg="var(--theme-200, var(--gem-sys-color--surface-container, #f0f4f9))"
      color="var(--lumi-sys-color--on-surface, #1f1f1f)" fontSize="13px"
      fontFamily="Google Sans Flex, Google Sans, sans-serif"
      title={t('folders_new_chat_target', [folder.name])}>
      <Icon size={16} color={getFolderColor(folder.colorValue)} aria-hidden />
      <Text truncate>{folder.name}</Text>
      {intent.error ? <Button size="xs" variant="ghost" onClick={folderNewChat.retry}
        title={intent.error}>{tt('folders_new_chat_retry', 'Retry saving')}</Button> : null}
      <IconButton aria-label={tt('folders_new_chat_cancel', 'Cancel Folder assignment')}
        data-gpk-folder-new-chat-cancel variant="ghost" boxSize="20px" minW="20px" p={0}
        disabled={intent.phase === 'saving'} onClick={folderNewChat.cancel} borderRadius="full">
        <LuX size={14} />
      </IconButton>
    </HStack>
  )
}
