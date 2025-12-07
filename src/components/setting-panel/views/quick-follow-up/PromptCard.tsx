import { Box, Input, Stack, Text, CloseButton } from '@chakra-ui/react'
import { useEffect, useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

import type {
  QuickFollowPrompt,
  QuickFollowPromptUpdateInput
} from '@/domain/quick-follow/types'
import { QUICK_FOLLOW_PLACEHOLDER } from '@/domain/quick-follow/types'
import { IconPicker } from './IconPicker'
import { PlaceholderChipEditor } from './PlaceholderChipEditor'
import { DragExcluded } from './DragExcluded'
import { t } from '@/utils/i18n'

export interface PromptCardProps {
  prompt: QuickFollowPrompt
  onUpdate: (id: string, patch: QuickFollowPromptUpdateInput) => Promise<void>
  onDelete: (id: string) => Promise<void> | void
  /** When true, applies fade-in animation */
  isNew?: boolean
}

export function PromptCard({
  prompt,
  onUpdate,
  onDelete,
  isNew = false
}: PromptCardProps) {
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
  const [nameValue, setNameValue] = useState(prompt.name ?? '')
  const [templateValue, setTemplateValue] = useState(prompt.template)
  const [templateError, setTemplateError] = useState<string | null>(null)

  useEffect(() => {
    setNameValue(prompt.name ?? '')
  }, [prompt.name])

  useEffect(() => {
    setTemplateValue(prompt.template)
  }, [prompt.template])

  const handleNameBlur = async () => {
    if ((prompt.name ?? '') === nameValue.trim()) {
      return
    }
    await onUpdate(prompt.id, { name: nameValue.trim() || undefined })
  }

  const validateTemplate = (value: string) => {
    if (!value.trim()) {
      return t('settings.quickFollow.card.templateEmpty') ?? 'Template cannot be empty'
    }
    if (!value.includes(QUICK_FOLLOW_PLACEHOLDER)) {
      return (
        t('settings.quickFollow.card.templateMissingPlaceholder', [QUICK_FOLLOW_PLACEHOLDER]) ?? `Template must contain ${QUICK_FOLLOW_PLACEHOLDER}`
      )
    }
    return null
  }

  const handleTemplateBlur = async () => {
    const validation = validateTemplate(templateValue)
    setTemplateError(validation)
    if (validation) {
      return
    }
    if (templateValue === prompt.template) {
      return
    }
    await onUpdate(prompt.id, { template: templateValue })
  }

  const handleIconChange = async (iconKey: QuickFollowPrompt['iconKey']) => {
    if (iconKey === prompt.iconKey) {
      return
    }
    await onUpdate(prompt.id, { iconKey })
  }

  const handleDelete = () => onDelete(prompt.id)

  return (
    <Box
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      border="1px solid"
      borderColor="border.emphasized"
      borderRadius="lg"
      padding={6}
      position="relative"
      opacity={isDragging ? 0.6 : 1}
      cursor="grab"
      _hover={{ boxShadow: 'sm' }}
      _active={{ cursor: 'grabbing' }}
      className="group"
      data-state={isNew ? 'open' : undefined}
      // animationIterationCount={2}
      _open={{
        animation: 'pulse .8s ease-in-out 2 alternate'
      }}
    >
      <DragExcluded
        position="absolute"
        top={1}
        right={1}
      >
        <CloseButton
          aria-label={t('settings.quickFollow.card.deleteLabel') ?? 'Delete prompt'}
          variant="ghost"
          size="2xs"
          onClick={handleDelete}
          opacity={0}
          _groupHover={{ opacity: 1 }}
          transition="opacity 0.2s"
        />
      </DragExcluded>
      <Stack direction={{ base: 'column', md: 'row' }} gap={3} align="flex-start">
        <DragExcluded>
          <IconPicker value={prompt.iconKey} onChange={handleIconChange} />
        </DragExcluded>
        <DragExcluded flex={1}>
          <Input
            placeholder={
              t('settings.quickFollow.card.namePlaceholder') ?? 'Custom Prompt Name (Optional)'
            }
            value={nameValue}
            onChange={event => setNameValue(event.target.value)}
            onBlur={handleNameBlur}
          />
        </DragExcluded>
      </Stack>

      <DragExcluded mt={3}>
        <PlaceholderChipEditor
          value={templateValue}
          onChange={setTemplateValue}
          onBlur={handleTemplateBlur}
          error={!!templateError}
        />
        {templateError ? (
          <Text fontSize="sm" color="red.500" mt={1}>
            {templateError}
          </Text>
        ) : null}
      </DragExcluded>
    </Box>
  )
}

