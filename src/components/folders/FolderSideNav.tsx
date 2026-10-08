import {
  Box,
  Button,
  HStack,
  IconButton,
  Text,
  VStack,
} from '@chakra-ui/react'
import {
  HiOutlineChevronDown,
  HiOutlineChevronUp,
  HiOutlineCog,
  HiOutlineDotsHorizontal,
  HiOutlineDotsVertical,
  HiOutlinePlus,
} from 'react-icons/hi'
import { type ReactNode, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { LuPen, LuPin, LuUserRound } from 'react-icons/lu'
import { folderNewChat } from '@/entrypoints/content/folders/new-chat'

import { getFolderColor, getFolderIcon } from './folderAppearance'
import { createFolderTitleClickController } from './folderTitleClick'
import { Tooltip } from '@/components/ui/tooltip'
import { compareAscii } from '@/domain/folder/order-key'
import { compareMembershipOrder } from '@/domain/folder/membership-order'
import { ROOT_FOLDER_ID } from '@/domain/folder/types'
import { folderRuntime } from '@/entrypoints/content/folders/runtime'
import { openChatViaSpa } from '@/utils/chatActions'
import { eventBus } from '@/utils/eventbus'
import { tt } from '@/utils/i18n'

const FOLDER_DRAG_MIME = 'application/x-gpk-folder-id'
const MEMBERSHIP_DRAG_MIME = 'application/x-gpk-folder-membership'

const HOVER_BACKGROUND = 'var(--lumi-sys-color-states--hover-on-surface)'
const ACTIVE_BACKGROUND = 'var(--lumi-sys-color--surface-dim)'
const LABEL_COLOR = 'var(--mat-list-list-item-label-text-color, var(--mat-sys-on-surface))'
const ITEM_COLOR = 'var(--lumi-sys-color--on-surface, #1f1f1f)'
const HEADER_COLOR = 'var(--lumi-sys-color--on-surface-variant, rgba(255,255,255,0.55))'
const FONT_FAMILY = 'Google Sans Flex, Google Sans, Helvetica Neue, sans-serif'
const FONT_SIZE = 'var(--gem-sys-typography-type-scale--body-s-font-size, 0.8125rem)'
const FONT_WEIGHT = 'var(--gem-sys-typography-type-scale--body-s-font-weight, 400)'
const LETTER_SPACING = 'var(--gem-sys-typography-type-scale--body-s-font-tracking, 0)'
const LINE_HEIGHT = 'var(--gem-sys-typography-type-scale--body-s-line-height, 1.0625)'
const NATIVE_ITEM_INSET = '6px'
const NATIVE_ITEM_PADDING = '8px'
const NATIVE_ITEM_HEIGHT = '32px'
const EXPANSION_EASING = 'cubic-bezier(0.2, 0, 0, 1)'
const EXPANSION_GRID_TRANSITION = `grid-template-rows 180ms ${EXPANSION_EASING}`
const EXPANSION_CONTENT_TRANSITION = `opacity 120ms ease, transform 180ms ${EXPANSION_EASING}`
const DROP_INDICATOR_COLOR = 'var(--gem-sys-color--primary, #0b57d0)'

const reducedMotionStyles = {
  '@media (prefers-reduced-motion: reduce)': {
    transition: 'none',
    transform: 'none !important',
  },
} as const

const trailingIconButtonStyles = {
  boxSize: '24px',
  minW: '24px',
  p: 0,
  css: {
    '& svg': {
      width: '16px',
      height: '16px',
    },
    '& [data-gpk-folder-pin-icon] svg': {
      width: '13px',
      height: '13px',
    },
  },
} as const

const activeActionsSelector = '&:hover, &:focus-within, &:has([aria-haspopup="menu"][aria-expanded="true"])'
const hiddenActionsStyles = {
  '& [data-gpk-folder-actions]': {
    opacity: 0,
    pointerEvents: 'none',
    visibility: 'hidden',
  },
  '&:hover [data-gpk-folder-actions], &:focus-within [data-gpk-folder-actions], &:has([aria-haspopup="menu"][aria-expanded="true"]) [data-gpk-folder-actions]': {
    opacity: 1,
    pointerEvents: 'auto',
    visibility: 'visible',
  },
  '&[data-gpk-folder-pinned="true"] [data-gpk-folder-actions]': {
    opacity: 1,
    pointerEvents: 'auto',
    visibility: 'visible',
  },
  '&[data-gpk-folder-pinned="true"] [data-gpk-folder-menu-icon]': { visibility: 'hidden' },
  [activeActionsSelector]: {
    '& [data-gpk-folder-pin-icon]': { visibility: 'hidden' },
    '& [data-gpk-folder-menu-icon]': { visibility: 'visible' },
  },
}

type DraggedItem =
  | { kind: 'folder', folderId: string }
  | { kind: 'membership', folderId: string, chatId: string }

type DropTarget =
  | { kind: 'folder', folderId: string, placement: 'before' | 'after' }
  | { kind: 'membership', folderId: string, membershipId: string, placement: 'before' | 'after' }

interface CollapsePreview {
  folderId: string
  collapsed: boolean
}

function matchesDropTarget(left: DropTarget | null, right: DropTarget | null): boolean {
  return left?.kind === right?.kind
    && left?.folderId === right?.folderId
    && left?.placement === right?.placement
    && (left?.kind !== 'membership' || right?.kind !== 'membership' || left.membershipId === right.membershipId)
}

function DropIndicator({ inset = NATIVE_ITEM_INSET }: { inset?: string }) {
  return (
    <Box
      data-gpk-folder-drop-indicator
      aria-hidden
      h="3px"
      my="2px"
      marginInlineStart={inset}
      marginInlineEnd={NATIVE_ITEM_INSET}
      borderRadius="full"
      bg={DROP_INDICATOR_COLOR}
    />
  )
}

function sortByOrder<T extends { id: string; orderKey: string }>(rows: T[]): T[] {
  return [...rows].sort((left, right) => compareAscii(left.orderKey, right.orderKey) || compareAscii(left.id, right.id))
}

function getChatId(url: string): string | undefined {
  try {
    return new URL(url, window.location.origin).pathname.match(/^\/app\/([^/?#]+)$/u)?.[1]
  } catch {
    return undefined
  }
}

function getDropPlacement(event: React.DragEvent<HTMLElement>): 'before' | 'after' {
  const bounds = event.currentTarget.getBoundingClientRect()
  return event.clientY < bounds.top + bounds.height / 2 ? 'before' : 'after'
}

function CollapsibleContent({ expanded, children }: { expanded: boolean, children: ReactNode }) {
  return (
    <Box
      aria-hidden={!expanded}
      inert={!expanded}
      display="grid"
      gridTemplateRows={expanded ? '1fr' : '0fr'}
      transition={EXPANSION_GRID_TRANSITION}
      css={reducedMotionStyles}
    >
      <Box minH={0} overflow="hidden">
        <Box
          opacity={expanded ? 1 : 0}
          transform={expanded ? 'translateY(0)' : 'translateY(-4px)'}
          transition={EXPANSION_CONTENT_TRANSITION}
          css={reducedMotionStyles}
        >
          {children}
        </Box>
      </Box>
    </Box>
  )
}

export function FolderSideNav() {
  const state = useSyncExternalStore(folderRuntime.subscribe, folderRuntime.getSnapshot, folderRuntime.getSnapshot)
  const [panelExpanded, setPanelExpanded] = useState(true)
  const [showAllFolders, setShowAllFolders] = useState(false)
  const [currentChatId, setCurrentChatId] = useState(() => getChatId(window.location.href))
  const [draggedItem, setDraggedItem] = useState<DraggedItem | null>(null)
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null)
  const [saveError, setSaveError] = useState<string>()
  const [collapsePreviews, setCollapsePreviews] = useState<Record<string, CollapsePreview>>({})
  const pendingTitlePreview = useRef<CollapsePreview | undefined>(undefined)
  const folderTitleClicks = useRef(createFolderTitleClickController())
  const projection = state.projection
  const accountScopeId = state.identity.status === 'available' ? state.identity.identity.accountScopeId : undefined
  const isCurrentAccount = () => {
    const identity = folderRuntime.getSnapshot().identity
    return identity.status === 'available' && identity.identity.accountScopeId === accountScopeId
  }
  const showSaveError = (error: unknown) => {
    if (isCurrentAccount()) setSaveError(error instanceof Error ? error.message : tt('folders_current_change_unsaved', 'This change was not saved.'))
  }

  useEffect(() => eventBus.on('urlchange', ({ url }) => setCurrentChatId(getChatId(url))), [])
  useEffect(() => () => folderTitleClicks.current.cancel(), [])
  useEffect(() => {
    folderTitleClicks.current.cancel()
    pendingTitlePreview.current = undefined
    setCollapsePreviews({})
    setSaveError(undefined)
  }, [accountScopeId])

  const unavailable = state.identity.status !== 'available'
  if (!unavailable && !projection?.settings.enabled) return null

  // P0 deliberately presents one flat layer even though the persisted model
  // reserves a parentFolderId seam for a future, evidence-backed hierarchy.
  const folders = sortByOrder(unavailable ? [] : (projection?.folders ?? []).filter((folder) => folder.parentFolderId === ROOT_FOLDER_ID))
  const visibleFolders = showAllFolders ? folders : folders.slice(0, 5)
  const collapsed = new Set(projection?.settings.collapsedFolderIds ?? [])
  const chatById = new Map((projection?.chatReferences ?? []).map((chat) => [chat.chatId, chat]))
  const membershipsByFolder = new Map<string, NonNullable<typeof projection>['memberships']>()
  for (const membership of projection?.memberships ?? []) {
    const rows = membershipsByFolder.get(membership.folderId) ?? []
    rows.push(membership)
    membershipsByFolder.set(membership.folderId, rows)
  }

  const clearPreview = (preview: CollapsePreview) => {
    setCollapsePreviews((current) => {
      if (current[preview.folderId] !== preview) return current
      const next = { ...current }
      delete next[preview.folderId]
      return next
    })
  }

  const cancelTitlePreview = () => {
    folderTitleClicks.current.cancel()
    if (pendingTitlePreview.current) clearPreview(pendingTitlePreview.current)
    pendingTitlePreview.current = undefined
  }

  const commitPreview = async (preview: CollapsePreview) => {
    try {
      await folderRuntime.setFolderCollapsed(preview.folderId, preview.collapsed)
      if (isCurrentAccount()) setSaveError(undefined)
    } catch (error) {
      console.warn('[Folders] Failed to save folder expansion', error)
      showSaveError(error)
    } finally {
      clearPreview(preview)
    }
  }

  const updateDropTarget = (nextTarget: DropTarget | null) => {
    setDropTarget((currentTarget) => (
      matchesDropTarget(currentTarget, nextTarget) ? currentTarget : nextTarget
    ))
  }

  const finishDrag = () => {
    setDraggedItem(null)
    updateDropTarget(null)
  }

  const handleFolderDrop = (event: React.DragEvent<HTMLElement>, targetFolderId: string) => {
    const item = draggedItem
    if (item?.kind !== 'folder') return
    event.preventDefault()
    finishDrag()
    if (item.folderId !== targetFolderId) {
      const placement = getDropPlacement(event)
      void folderRuntime.moveFolder(
        item.folderId,
        placement === 'before' ? targetFolderId : undefined,
        placement === 'after' ? targetFolderId : undefined,
      ).then(() => { if (isCurrentAccount()) setSaveError(undefined) }, showSaveError)
    }
  }

  const moreOptionsLabel = tt('settingPanel.chainPrompt.menu.moreOptions', 'More options')

  return (
    <Box
      data-gpk-folders-side-nav
      width="100%"
      py={0}
      mb="12px"
      bg="transparent"
      color={LABEL_COLOR}
      fontFamily={FONT_FAMILY}
      fontSize={FONT_SIZE}
      fontWeight={FONT_WEIGHT}
      letterSpacing={LETTER_SPACING}
      lineHeight={LINE_HEIGHT}
    >
      <HStack
        data-gpk-folders-header
        role="group"
        minH={NATIVE_ITEM_HEIGHT}
        ps="14px"
        pe="6px"
        justify="space-between"
        color={HEADER_COLOR}
        css={hiddenActionsStyles}
      >
        <Button
          size="sm"
          h={NATIVE_ITEM_HEIGHT}
          minH={NATIVE_ITEM_HEIGHT}
          variant="ghost"
          minW={0}
          flex="1"
          px={0}
          gap={1}
          justifyContent="flex-start"
          bg="transparent"
          color="inherit"
          font="inherit"
          _hover={{ bg: 'transparent' }}
          aria-expanded={panelExpanded}
          onClick={() => setPanelExpanded((value) => !value)}
        >
          <Text truncate>{tt('folders_title', 'Folders')}</Text>
          <Box
            as={HiOutlineChevronDown}
            data-gpk-folder-actions
            boxSize="12px"
            flexShrink={0}
            transform={panelExpanded ? 'rotate(0deg)' : 'rotate(-90deg)'}
            transition={`transform 180ms ${EXPANSION_EASING}`}
            css={reducedMotionStyles}
            aria-hidden
          />
        </Button>
        <HStack gap={0} flexShrink={0}>
          <HStack data-gpk-folder-actions gap={0} flexShrink={0} transition="opacity 120ms ease">
            <Tooltip content={tt('folders_new_folder', 'New folder')}>
              <IconButton
                {...trailingIconButtonStyles}
                size="xs"
                variant="ghost"
                borderRadius="full"
                color="inherit"
                _hover={{ bg: HOVER_BACKGROUND }}
                aria-label={tt('folders_new_folder', 'New folder')}
                disabled={unavailable}
                onClick={() => folderRuntime.openCreateDialog()}
              >
                <HiOutlinePlus />
              </IconButton>
            </Tooltip>
            <Tooltip content={tt('folders_settings', 'Folder settings')}>
              <IconButton
                {...trailingIconButtonStyles}
                size="xs"
                variant="ghost"
                borderRadius="full"
                color="inherit"
                _hover={{ bg: HOVER_BACKGROUND }}
                aria-label={tt('folders_settings', 'Folder settings')}
                onClick={() => eventBus.emitSync('settings:open', {
                  from: 'folders',
                  open: true,
                  module: 'folders',
                })}
              >
                <HiOutlineCog />
              </IconButton>
            </Tooltip>
          </HStack>
          {state.identity.status === 'available' && state.identity.identity.selection === 'recent' ? (
            <Tooltip content={(
              <VStack align="start" gap={1}>
                <Text overflowWrap="anywhere">{tt('folders_account_current', 'Currently using')}: {state.identity.identity.email}</Text>
                <Text>{tt('folders_account_last_used', 'Last used account · Click to switch')}</Text>
              </VStack>
            )}>
              <IconButton
                {...trailingIconButtonStyles}
                data-gpk-folder-account
                size="xs"
                variant="ghost"
                borderRadius="full"
                color="inherit"
                opacity={0.7}
                css={{ '& svg': { width: '14px', height: '14px' } }}
                _hover={{ bg: HOVER_BACKGROUND, opacity: 1 }}
                _focusVisible={{ opacity: 1 }}
                aria-label={`${tt('folders_switch_account', 'Switch account')}: ${state.identity.identity.email}`}
                onClick={() => eventBus.emitSync('settings:open', {
                  from: 'folders', open: true, module: 'folders', params: { chooseAccount: true },
                })}
              >
                <LuUserRound size={14} aria-hidden />
              </IconButton>
            </Tooltip>
          ) : null}
        </HStack>
      </HStack>

      {saveError ? <Text role="alert" fontSize="xs" color="fg.error" px="14px" py={1}>{saveError}</Text> : null}
      <CollapsibleContent expanded={panelExpanded}>
        {unavailable ? (
          <VStack align="stretch" gap={2} px="14px" py={2}>
            <Text fontSize="xs" color={ITEM_COLOR}>
              {tt('folders_unavailable', 'Folders are unavailable until your Gemini identity is confirmed.')}
            </Text>
            <Button
              size="xs"
              variant="outline"
              alignSelf="flex-start"
              onClick={() => eventBus.emitSync('settings:open', {
                from: 'folders', open: true, module: 'folders',
              })}
            >
              {tt('folders_manual_email', 'Manual email')}
            </Button>
          </VStack>
        ) : null}
        <VStack align="stretch" gap={0}>
          {visibleFolders.map((folder) => {
            const isCollapsed = collapsePreviews[folder.id]?.collapsed ?? collapsed.has(folder.id)
            const memberships = [...(membershipsByFolder.get(folder.id) ?? [])].sort(compareMembershipOrder)
            const chatMembershipById = new Map(memberships.map((row) => [row.chatId, row]))
            const FolderIcon = getFolderIcon(folder.iconKey)
            return (
              <Box key={folder.id} data-gpk-folder-block>
                {dropTarget?.kind === 'folder'
                  && dropTarget.folderId === folder.id
                  && dropTarget.placement === 'before'
                  ? <DropIndicator />
                  : null}
                <HStack
                  data-gpk-folder-row
                  role="group"
                  minH={NATIVE_ITEM_HEIGHT}
                  marginInlineStart={NATIVE_ITEM_INSET}
                  px={NATIVE_ITEM_PADDING}
                  gap={1}
                  borderRadius="full"
                  bg="transparent"
                  color={ITEM_COLOR}
                  fontSize={FONT_SIZE}
                  lineHeight={LINE_HEIGHT}
                  transition="background-color 120ms ease"
                  css={hiddenActionsStyles}
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = 'move'
                    event.dataTransfer.setData(FOLDER_DRAG_MIME, folder.id)
                    setDraggedItem({ kind: 'folder', folderId: folder.id })
                    updateDropTarget(null)
                  }}
                  onDragEnd={finishDrag}
                  onDragOver={(event) => {
                    if (draggedItem?.kind === 'folder') {
                      event.preventDefault()
                      event.dataTransfer.dropEffect = 'move'
                      updateDropTarget(draggedItem.folderId === folder.id
                        ? null
                        : {
                            kind: 'folder',
                            folderId: folder.id,
                            placement: getDropPlacement(event),
                          })
                    }
                  }}
                  onDrop={(event) => handleFolderDrop(event, folder.id)}
                  _hover={{ bg: HOVER_BACKGROUND }}
                >
                  <Button
                    size="sm"
                    h={NATIVE_ITEM_HEIGHT}
                    minH={NATIVE_ITEM_HEIGHT}
                    variant="ghost"
                    flex="1"
                    minW={0}
                    px={0}
                    gap="11px"
                    justifyContent="flex-start"
                    bg="transparent"
                    color="inherit"
                    font="inherit"
                    _hover={{ bg: 'transparent' }}
                    onClick={(event) => {
                      const clickedIcon = Boolean((event.target as HTMLElement).closest('[data-gpk-folder-icon]'))
                      if (clickedIcon || event.detail <= 1) {
                        cancelTitlePreview()
                        const preview = { folderId: folder.id, collapsed: !isCollapsed }
                        setCollapsePreviews((current) => ({ ...current, [folder.id]: preview }))
                        if (clickedIcon || event.detail === 0) {
                          void commitPreview(preview)
                          return
                        }
                        // Preview immediately; defer only persistence so a double-click can cancel it.
                        pendingTitlePreview.current = preview
                        folderTitleClicks.current.scheduleSingleClick(() => {
                          pendingTitlePreview.current = undefined
                          void commitPreview(preview)
                        })
                      }
                    }}
                    onDoubleClick={(event) => {
                      if ((event.target as HTMLElement).closest('[data-gpk-folder-icon]')) return
                      event.preventDefault()
                      cancelTitlePreview()
                      folderTitleClicks.current.handleDoubleClick(() => folderRuntime.openEditDialog(folder.id))
                    }}
                    aria-expanded={!isCollapsed}
                  >
                    <Box
                      as={FolderIcon}
                      data-gpk-folder-icon
                      color={getFolderColor(folder.colorValue)}
                      boxSize="20px"
                      strokeWidth={1.5}
                      flexShrink={0}
                      aria-hidden
                    />
                    <Text truncate title={folder.name}>{folder.name}</Text>
                  </Button>
                  <HStack data-gpk-folder-actions flexShrink={0} gap={0} transition="opacity 120ms ease">
                    <Tooltip content={tt('folders_new_chat', 'New chat')}>
                      <IconButton size="xs" {...trailingIconButtonStyles} variant="plain"
                        bg="transparent" borderRadius="full" color="inherit" _hover={{ bg: HOVER_BACKGROUND }}
                        data-gpk-folder-new-chat={folder.id}
                        aria-label={`${folder.name}: ${tt('folders_new_chat', 'New chat')}`}
                        onClick={(event) => { event.stopPropagation(); void folderNewChat.open(folder.id) }}>
                        <LuPen strokeWidth={1.5} />
                      </IconButton>
                    </Tooltip>
                    <IconButton
                      size="xs"
                      {...trailingIconButtonStyles}
                      variant="ghost"
                      borderRadius="full"
                      color="inherit"
                      _hover={{ bg: HOVER_BACKGROUND }}
                      aria-label={`${folder.name}: ${moreOptionsLabel}`}
                      aria-haspopup="menu"
                      aria-expanded={state.menu?.kind === 'folder' && state.menu.folderId === folder.id}
                      onClick={(event) => {
                        if (state.menu?.kind === 'folder' && state.menu.folderId === folder.id) {
                          folderRuntime.closeMenu()
                        } else {
                          folderRuntime.openFolderMenu(folder.id, folder.name, event.currentTarget)
                        }
                      }}
                    >
                      <HiOutlineDotsVertical />
                    </IconButton>
                  </HStack>
                </HStack>

                <CollapsibleContent expanded={!isCollapsed}>
                  <VStack align="stretch" gap={0}>
                    {memberships.map((membership) => {
                      const isActive = membership.chatId === currentChatId
                      const chatTitle = chatById.get(membership.chatId)?.cachedTitle
                        || tt('folders_untitled_chat', 'Untitled chat')
                      return (
                        <Box key={membership.id}>
                          {dropTarget?.kind === 'membership'
                            && dropTarget.folderId === folder.id
                            && dropTarget.membershipId === membership.id
                            && dropTarget.placement === 'before'
                            ? <DropIndicator inset="39px" />
                            : null}
                          <HStack
                            data-gpk-folder-chat-row
                            data-gpk-folder-pinned={Boolean(membership.pinnedOrderKey)}
                            role="button"
                            tabIndex={0}
                            aria-current={isActive ? 'page' : undefined}
                            minH={NATIVE_ITEM_HEIGHT}
                            marginInlineStart={NATIVE_ITEM_INSET}
                            pl="39px"
                            pr={NATIVE_ITEM_PADDING}
                            gap={1}
                            borderRadius="full"
                            bg={isActive ? ACTIVE_BACKGROUND : 'transparent'}
                            color={ITEM_COLOR}
                            cursor="pointer"
                            fontSize={FONT_SIZE}
                            lineHeight={LINE_HEIGHT}
                            transition="background-color 120ms ease"
                            css={hiddenActionsStyles}
                            _hover={{ bg: HOVER_BACKGROUND }}
                            draggable
                            onKeyDown={(event) => {
                              if (event.target !== event.currentTarget) return
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault()
                                console.info('[Folders][navigation]', {
                                  step: 'chat-clicked',
                                  chatId: membership.chatId,
                                  fromPath: window.location.pathname,
                                })
                                const navigated = openChatViaSpa(membership.chatId)
                                console.info('[Folders][navigation]', {
                                  step: navigated ? 'spa-route-dispatched' : 'route-rejected',
                                  chatId: membership.chatId,
                                  toPath: window.location.pathname,
                                })
                              }
                            }}
                            onClick={() => {
                              console.info('[Folders][navigation]', {
                                step: 'chat-clicked',
                                chatId: membership.chatId,
                                fromPath: window.location.pathname,
                              })
                              const navigated = openChatViaSpa(membership.chatId)
                              console.info('[Folders][navigation]', {
                                step: navigated ? 'spa-route-dispatched' : 'route-rejected',
                                chatId: membership.chatId,
                                toPath: window.location.pathname,
                              })
                            }}
                            onDragStart={(event) => {
                              event.dataTransfer.effectAllowed = 'copyMove'
                              event.dataTransfer.setData(MEMBERSHIP_DRAG_MIME, `${folder.id}\n${membership.chatId}`)
                              setDraggedItem({
                                kind: 'membership',
                                folderId: folder.id,
                                chatId: membership.chatId,
                              })
                              updateDropTarget(null)
                            }}
                            onDragEnd={finishDrag}
                            onDragOver={(event) => {
                              if (
                                draggedItem?.kind !== 'membership'
                                || draggedItem.folderId !== folder.id
                                || draggedItem.chatId === membership.chatId
                                || Boolean(chatMembershipById.get(draggedItem.chatId)?.pinnedOrderKey) !== Boolean(membership.pinnedOrderKey)
                              ) {
                                return
                              }
                              event.preventDefault()
                              event.stopPropagation()
                              event.dataTransfer.dropEffect = 'move'
                              updateDropTarget({
                                kind: 'membership',
                                folderId: folder.id,
                                membershipId: membership.id,
                                placement: getDropPlacement(event),
                              })
                            }}
                            onDrop={(event) => {
                              if (
                                draggedItem?.kind === 'membership'
                                && draggedItem.folderId === folder.id
                                && draggedItem.chatId !== membership.chatId
                                && Boolean(chatMembershipById.get(draggedItem.chatId)?.pinnedOrderKey) === Boolean(membership.pinnedOrderKey)
                              ) {
                                event.preventDefault()
                                event.stopPropagation()
                                const chatId = draggedItem.chatId
                                const placement = getDropPlacement(event)
                                finishDrag()
                                void folderRuntime.moveMembership(
                                  folder.id,
                                  chatId,
                                  placement === 'before' ? membership.id : undefined,
                                  placement === 'after' ? membership.id : undefined,
                                ).then(() => { if (isCurrentAccount()) setSaveError(undefined) }, showSaveError)
                              }
                            }}
                          >
                            <Text flex="1" truncate title={chatTitle}>{chatTitle}</Text>
                            <Box data-gpk-folder-actions flexShrink={0} transition="opacity 120ms ease">
                              <IconButton
                                position="relative"
                                size="xs"
                                {...trailingIconButtonStyles}
                                variant="ghost"
                                borderRadius="full"
                                color="inherit"
                                _hover={{ bg: HOVER_BACKGROUND }}
                                aria-label={`${chatTitle}: ${moreOptionsLabel}`}
                                aria-haspopup="menu"
                                aria-expanded={state.menu?.kind === 'chat'
                                  && state.menu.folderId === folder.id
                                  && state.menu.chatId === membership.chatId}
                                onClick={(event) => {
                                  event.stopPropagation()
                                  if (
                                    state.menu?.kind === 'chat'
                                    && state.menu.folderId === folder.id
                                    && state.menu.chatId === membership.chatId
                                  ) {
                                    folderRuntime.closeMenu()
                                  } else {
                                    folderRuntime.openChatMenu(
                                      folder.id,
                                      membership.chatId,
                                      chatTitle,
                                      event.currentTarget,
                                    )
                                  }
                                }}
                              >
                                {membership.pinnedOrderKey ? (
                                  <Box as="span" data-gpk-folder-pin-icon position="absolute" inset={0} display="flex" alignItems="center" justifyContent="center" aria-hidden="true">
                                    <LuPin strokeWidth={1.5} />
                                  </Box>
                                ) : null}
                                <Box as="span" data-gpk-folder-menu-icon display="flex" aria-hidden="true">
                                  <HiOutlineDotsVertical />
                                </Box>
                              </IconButton>
                            </Box>
                          </HStack>
                          {dropTarget?.kind === 'membership'
                            && dropTarget.folderId === folder.id
                            && dropTarget.membershipId === membership.id
                            && dropTarget.placement === 'after'
                            ? <DropIndicator inset="39px" />
                            : null}
                        </Box>
                      )
                    })}
                    {projection?.chatCursors?.[folder.id] ? (
                      <Button
                        data-gpk-folder-load-more-chats
                        size="sm"
                        h={NATIVE_ITEM_HEIGHT}
                        minH={NATIVE_ITEM_HEIGHT}
                        variant="ghost"
                        marginInlineStart={NATIVE_ITEM_INSET}
                        pl="39px"
                        pr={NATIVE_ITEM_PADDING}
                        justifyContent="flex-start"
                        bg="transparent"
                        color="var(--lumi-sys-color--on-surface-variant, #777)"
                        font="inherit"
                        fontSize={FONT_SIZE}
                        lineHeight={LINE_HEIGHT}
                        borderRadius="full"
                        _hover={{ bg: HOVER_BACKGROUND }}
                        disabled={state.loadingChatFolderIds?.includes(folder.id)}
                        aria-busy={state.loadingChatFolderIds?.includes(folder.id)}
                        onClick={() => void folderRuntime.loadMoreChats(folder.id)}
                      >
                        {tt('folders_see_more', 'See more')}
                      </Button>
                    ) : null}
                  </VStack>
                </CollapsibleContent>
                {dropTarget?.kind === 'folder'
                  && dropTarget.folderId === folder.id
                  && dropTarget.placement === 'after'
                  ? <DropIndicator />
                  : null}
              </Box>
            )
          })}
          {!unavailable && !folders.length ? (
            <Button
              data-gpk-folder-new-row
              size="sm"
              h={NATIVE_ITEM_HEIGHT}
              minH={NATIVE_ITEM_HEIGHT}
              variant="ghost"
              minW={0}
              marginInlineStart={NATIVE_ITEM_INSET}
              px={NATIVE_ITEM_PADDING}
              gap="11px"
              justifyContent="flex-start"
              bg="transparent"
              color={ITEM_COLOR}
              font="inherit"
              fontSize={FONT_SIZE}
              lineHeight={LINE_HEIGHT}
              borderRadius="full"
              _hover={{ bg: HOVER_BACKGROUND }}
              onClick={() => folderRuntime.openCreateDialog()}
            >
              <Box
                as={HiOutlinePlus}
                boxSize="20px"
                strokeWidth={1.5}
                flexShrink={0}
                aria-hidden
              />
              <Text truncate>{tt('folders_new_folder', 'New Folder')}</Text>
            </Button>
          ) : null}
          {folders.length > 5 ? (
            <Button
              size="sm"
              h={NATIVE_ITEM_HEIGHT}
              variant="ghost"
              minH={NATIVE_ITEM_HEIGHT}
              marginInlineStart={NATIVE_ITEM_INSET}
              px={NATIVE_ITEM_PADDING}
              gap="11px"
              justifyContent="flex-start"
              bg="transparent"
              color={ITEM_COLOR}
              font="inherit"
              fontSize={FONT_SIZE}
              lineHeight={LINE_HEIGHT}
              borderRadius="full"
              _hover={{ bg: HOVER_BACKGROUND }}
              onClick={() => setShowAllFolders((value) => !value)}
            >
              <Box
                boxSize="20px"
                display="flex"
                alignItems="center"
                justifyContent="center"
                flexShrink={0}
                aria-hidden
              >
                {showAllFolders
                  ? <HiOutlineChevronUp size={16} strokeWidth={1} />
                  : <HiOutlineDotsHorizontal size={16} strokeWidth={1} />}
              </Box>
              <Text truncate>
                {showAllFolders
                  ? tt('folders_show_less', 'Show less')
                  : tt('folders_see_more', 'See more')}
              </Text>
            </Button>
          ) : null}
        </VStack>
      </CollapsibleContent>
    </Box>
  )
}
