import { Separator, VStack } from '@chakra-ui/react'
import { useSyncExternalStore } from 'react'
import { HiOutlineTrash, HiOutlineX } from 'react-icons/hi'
import { LuFolderOutput, LuFolderPen, LuPencil, LuPin, LuPinOff } from 'react-icons/lu'

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
            icon={<LuFolderPen />}
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

  const pinned = Boolean(state.projection?.memberships.find((row) => row.folderId === menu.folderId && row.chatId === menu.chatId)?.pinnedOrderKey)
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
          icon={<LuPencil />}
          onClick={() => folderRuntime.openRenameChatDialog(menu.folderId, menu.chatId, menu.chatTitle)}
        >
          {tt('folders_rename_chat', 'Rename')}
        </AnchoredGeminiMenuItem>
        <AnchoredGeminiMenuItem
          icon={pinned ? <LuPinOff /> : <LuPin />}
          onClick={() => void folderRuntime.setMembershipPinned(menu.folderId, menu.chatId, !pinned)}
        >
          {pinned ? tt('folders_unpin_chat', 'Unpin') : tt('folders_pin_chat', 'Pin')}
        </AnchoredGeminiMenuItem>
        <Separator my={1} borderColor="border" />
        <AnchoredGeminiMenuItem
          icon={<LuFolderOutput />}
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
