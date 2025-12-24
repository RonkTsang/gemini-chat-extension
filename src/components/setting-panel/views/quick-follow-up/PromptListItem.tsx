import { Box, IconButton, Stack, Text } from '@chakra-ui/react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { MdDragIndicator } from 'react-icons/md'
import { FiEdit2, FiTrash2 } from 'react-icons/fi'
import { useState } from 'react'

import type { QuickFollowPrompt } from '@/domain/quick-follow/types'
import { getIconDefinition } from '@/components/quick-follow/icons'
import { DragExcluded } from './DragExcluded'
import { AlertDialog } from '@/components/ui/alert-dialog'
import { t } from '@/utils/i18n'
import { useColorModeValue } from '@/components/ui/color-mode'

export interface PromptListItemProps {
  prompt: QuickFollowPrompt
  onEdit: (id: string) => void
  onDelete: (id: string) => void | Promise<void>
}

export function PromptListItem({
  prompt,
  onEdit,
  onDelete
}: PromptListItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: prompt.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition
  }

  const { Icon: PromptIcon } = getIconDefinition(prompt.iconKey)
  const hoverBg = useColorModeValue('gray.50', 'gray.700')
  const borderColor = useColorModeValue('gray.200', 'gray.600')

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const handleEdit = () => onEdit(prompt.id)
  
  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    setIsDeleteDialogOpen(true)
  }

  const handleDeleteConfirm = async () => {
    setIsDeleting(true)
    try {
      await onDelete(prompt.id)
      setIsDeleteDialogOpen(false)
    } finally {
      setIsDeleting(false)
    }
  }

  const handleListItemClick = () => {
    handleEdit()
  }

  return (
    <>
      <Box
        ref={setNodeRef}
        style={style}
        {...attributes}
        border="1px solid"
        borderColor={borderColor}
        borderRadius="lg"
        padding={3}
        position="relative"
        opacity={isDragging ? 0.6 : 1}
        cursor="pointer"
        _hover={{ bg: hoverBg }}
        className="group"
        onClick={handleListItemClick}
      >
        <Stack direction="row" align="center" gap={3}>
          {/* Drag handle */}
          <Box
            {...listeners}
            color="fg.muted"
            cursor="grab"
            _active={{ cursor: 'grabbing' }}
            display="flex"
            alignItems="center"
            onClick={(e) => e.stopPropagation()}
          >
            <MdDragIndicator size={20} />
          </Box>

          {/* Icon */}
          <Box
            display="flex"
            alignItems="center"
            justifyContent="center"
            width="32px"
            height="32px"
            borderRadius="full"
            bg="bg.emphasized"
            color="fg"
          >
            <PromptIcon size={16} />
          </Box>

          {/* Name */}
          <Box flex={1}>
            <Text fontSize="sm" fontWeight="medium" lineClamp={1}>
              {prompt.name || t('settings.quickFollow.card.namePlaceholder') || 'Unnamed Prompt'}
            </Text>
          </Box>

          {/* Action buttons */}
          <DragExcluded>
            <Stack direction="row" gap={1}>
              <IconButton
                aria-label={t('settings.quickFollow.card.editLabel') ?? 'Edit prompt'}
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation()
                  handleEdit()
                }}
                opacity={0}
                _groupHover={{ opacity: 1 }}
                transition="opacity 0.2s"
              >
                <FiEdit2 />
              </IconButton>
              <IconButton
                aria-label={t('settings.quickFollow.card.deleteLabel') ?? 'Delete prompt'}
                variant="ghost"
                colorPalette="red"
                size="sm"
                onClick={handleDeleteClick}
                opacity={0}
                _groupHover={{ opacity: 1 }}
                transition="opacity 0.2s"
              >
                <FiTrash2 />
              </IconButton>
            </Stack>
          </DragExcluded>
        </Stack>
      </Box>

      {/* Delete confirmation dialog */}
      <AlertDialog
        isOpen={isDeleteDialogOpen}
        onClose={() => setIsDeleteDialogOpen(false)}
        onConfirm={handleDeleteConfirm}
        title={t('settings.quickFollow.card.deleteConfirmTitle')}
        description={t('settings.quickFollow.card.deleteConfirmDescription')}
        isLoading={isDeleting}
      />
    </>
  )
}

