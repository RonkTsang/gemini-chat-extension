import { Box, Input, Stack, Text, CloseButton } from '@chakra-ui/react'
import { useEffect, useState } from 'react'

import type {
  QuickFollowPrompt,
  QuickFollowPromptUpdateInput
} from '@/domain/quick-follow/types'
import { QUICK_FOLLOW_PLACEHOLDER } from '@/domain/quick-follow/types'
import { IconPicker } from './IconPicker'
import { PlaceholderChipEditor } from './PlaceholderChipEditor'
import { t } from '@/utils/i18n'

export interface PromptCardProps {
  prompt: QuickFollowPrompt
  onUpdate: (id: string, patch: QuickFollowPromptUpdateInput) => Promise<void>
  onDelete: (id: string) => Promise<void> | void
  onDragStart: (id: string) => void
  onDragEnd: () => void
  onDrop: (targetId: string) => void
  isDragging?: boolean
}

export function PromptCard({
  prompt,
  onUpdate,
  onDelete,
  onDragStart,
  onDragEnd,
  onDrop,
  isDragging
}: PromptCardProps) {
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
      border="1px solid"
      borderColor="border.emphasized"
      borderRadius="lg"
      padding={6}
      position="relative"
      draggable
      onDragStart={event => {
        event.dataTransfer.effectAllowed = 'move'
        event.dataTransfer.setData('text/plain', prompt.id)
        onDragStart(prompt.id)
      }}
      onDragEnd={onDragEnd}
      onDragOver={event => {
        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
      }}
      onDrop={event => {
        event.preventDefault()
        onDrop(prompt.id)
      }}
      opacity={isDragging ? 0.6 : 1}
      _hover={{ boxShadow: 'sm' }}
      className="group"
    >
      <CloseButton
        aria-label={t('settings.quickFollow.card.deleteLabel') ?? 'Delete prompt'}
        variant="ghost"
        size="2xs"
        position="absolute"
        top={1}
        right={1}
        onClick={handleDelete}
        opacity={0}
        _groupHover={{ opacity: 1 }}
        transition="opacity 0.2s"
      />
      <Stack direction={{ base: 'column', md: 'row' }} gap={3} align="flex-start">
        <IconPicker value={prompt.iconKey} onChange={handleIconChange} />
        <Box flex={1}>
          <Input
            placeholder={
              t('settings.quickFollow.card.namePlaceholder') ?? 'Custom Prompt Name (Optional)'
            }
            value={nameValue}
            onChange={event => setNameValue(event.target.value)}
            onBlur={handleNameBlur}
          />
        </Box>
      </Stack>

      <Box mt={3}>
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
      </Box>
    </Box>
  )
}

