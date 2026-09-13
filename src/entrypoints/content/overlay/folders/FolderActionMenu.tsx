import { VStack } from '@chakra-ui/react'
import { useSyncExternalStore } from 'react'
import { HiOutlinePencilAlt, HiOutlineTrash, HiOutlineX } from 'react-icons/hi'

import { folderRuntime } from '@/entrypoints/content/folders/runtime'
import { tt } from '@/utils/i18n'
import { AnchoredGeminiMenu, AnchoredGeminiMenuItem } from './AnchoredGeminiMenu'

export function FolderActionMenu() {
  const state = useSyncExternalStore(folderRuntime.subscribe, folderRuntime.getSnapshot, folderRuntime.getSnapshot)
  const menu = state.menu
  if (!menu) return null

  if (menu.kind === 'folder') {
    return (
      <AnchoredGeminiMenu
        anchorElement={menu.anchorElement}
        anchorRect={menu.anchorRect}
        ariaLabel={`${menu.folderName}: ${tt('settingPanel.chainPrompt.menu.moreOptions', 'More options')}`}
        initialFocus
        onClose={() => folderRuntime.closeMenu()}
        placement="bottom-start"
      >
        <VStack align="stretch" gap={0}>
          <AnchoredGeminiMenuItem
            icon={<HiOutlinePencilAlt />}
            onClick={() => folderRuntime.openEditDialog(menu.folderId)}
          >
            {tt('folders_edit_folder', 'Edit folder')}
          </AnchoredGeminiMenuItem>
          <AnchoredGeminiMenuItem
            destructive
            icon={<HiOutlineTrash />}
            onClick={() => folderRuntime.openDeleteFolderDialog(menu.folderId)}
          >
            {tt('folders_delete_folder', 'Delete folder')}
          </AnchoredGeminiMenuItem>
        </VStack>
      </AnchoredGeminiMenu>
    )
  }

  return (
    <AnchoredGeminiMenu
      anchorElement={menu.anchorElement}
      anchorRect={menu.anchorRect}
      ariaLabel={`${menu.chatTitle}: ${tt('settingPanel.chainPrompt.menu.moreOptions', 'More options')}`}
      initialFocus
      onClose={() => folderRuntime.closeMenu()}
      placement="bottom-start"
    >
      <VStack align="stretch" gap={0}>
        <AnchoredGeminiMenuItem
          icon={<HiOutlineX />}
          onClick={() => folderRuntime.openRemoveMembershipDialog(menu.folderId, menu.chatId)}
        >
          {tt('folders_remove_from_folder', 'Remove from folder')}
        </AnchoredGeminiMenuItem>
        <AnchoredGeminiMenuItem
          destructive
          icon={<HiOutlineTrash />}
          onClick={() => folderRuntime.openDeleteChatDialog(menu.folderId, menu.chatId)}
        >
          {tt('folders_delete_chat', 'Delete chat')}
        </AnchoredGeminiMenuItem>
      </VStack>
    </AnchoredGeminiMenu>
  )
}
