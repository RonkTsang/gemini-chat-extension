import { Box, Input, Stack, Text, Textarea, IconButton, CloseButton } from '@chakra-ui/react'
import { Fragment, type JSX, useEffect, useMemo, useState } from 'react'
import { FiX } from 'react-icons/fi'

import type {
  QuickFollowPrompt,
  QuickFollowPromptUpdateInput
} from '@/domain/quick-follow/types'
import { QUICK_FOLLOW_PLACEHOLDER } from '@/domain/quick-follow/types'
import { IconPicker } from './IconPicker'
import { t } from '@/utils/i18n'
import { useColorModeValue } from '@/components/ui/color-mode'

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

  const borderColor = useColorModeValue('gray.100', 'gray.700')
  const templateHelperMessage = t('settings.quickFollow.card.templateHelper', [QUICK_FOLLOW_PLACEHOLDER]) ?? `Must include ${QUICK_FOLLOW_PLACEHOLDER}`
  const helperParts = useMemo(
    () => templateHelperMessage.split(QUICK_FOLLOW_PLACEHOLDER),
    [templateHelperMessage]
  )

  useEffect(() => {
    setNameValue(prompt.name ?? '')
  }, [prompt.name])

  useEffect(() => {
    setTemplateValue(prompt.template)
  }, [prompt.template])

  const placeholderHighlightedTemplate = useMemo(() => {
    const parts = templateValue.split(QUICK_FOLLOW_PLACEHOLDER)
    return parts.reduce<JSX.Element[]>((acc, part, index) => {
      acc.push(<span key={`text-${index}`}>{part}</span>)
      if (index < parts.length - 1) {
        acc.push(
          <Text as="span" key={`placeholder-${index}`} color="primary.500" fontWeight="semibold">
            {QUICK_FOLLOW_PLACEHOLDER}
          </Text>
        )
      }
      return acc
    }, [])
  }, [templateValue])

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
        <Textarea
          value={templateValue}
          onChange={event => setTemplateValue(event.target.value)}
          onBlur={handleTemplateBlur}
          rows={2}
          autoresize
          borderColor={templateError ? 'red.400' : undefined}
          _focus={{ borderColor: templateError ? 'red.500' : 'primary.500' }}
          aria-invalid={templateError ? true : undefined}
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

