import { Box, Button, Input, InputGroup, Stack, Text } from '@chakra-ui/react'
import { useEffect, useState } from 'react'

import type {
  QuickFollowPrompt,
  QuickFollowPromptUpdateInput,
  QuickFollowPromptCreateInput
} from '@/domain/quick-follow/types'
import { DEFAULT_QUICK_FOLLOW_TEMPLATE_KEY, QUICK_FOLLOW_PLACEHOLDER } from '@/domain/quick-follow/types'
import type { QuickFollowIconKey } from '@/domain/quick-follow/iconKeys'
import { IconPicker } from './IconPicker'
import { PlaceholderChipEditor } from './PlaceholderChipEditor'
import { t } from '@/utils/i18n'
import { Dialog } from '@chakra-ui/react'
import { ICON_CATALOG } from '@/components/quick-follow/icons'

export interface PromptEditModalProps {
  prompt: QuickFollowPrompt | null
  isOpen: boolean
  onClose: () => void
  /** For editing existing prompt */
  onUpdate?: (id: string, patch: QuickFollowPromptUpdateInput) => Promise<void>
  /** For creating new prompt */
  onCreate?: (input: QuickFollowPromptCreateInput) => Promise<void>
}

export function PromptEditModal({
  prompt,
  isOpen,
  onClose,
  onUpdate,
  onCreate
}: PromptEditModalProps) {
  const isCreating = !prompt
  
  const [nameValue, setNameValue] = useState('')
  const [templateValue, setTemplateValue] = useState<string>(QUICK_FOLLOW_PLACEHOLDER)
  const [iconKey, setIconKey] = useState<QuickFollowIconKey>('sparkles')
  const [nameError, setNameError] = useState<string | null>(null)
  const [templateError, setTemplateError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  // Reset form when prompt changes or modal opens
  useEffect(() => {
    if (isOpen) {
      if (prompt) {
        // Editing existing prompt
        setNameValue(prompt.name ?? '')
        setTemplateValue(prompt.template)
        setIconKey(prompt.iconKey)
      } else {
        // Creating new prompt: use defaults
        setNameValue('')
        // Use i18n default template
        const defaultTemplate = t(DEFAULT_QUICK_FOLLOW_TEMPLATE_KEY)
        setTemplateValue(defaultTemplate)
        // Random icon selection
        const randomIndex = Math.floor(Math.random() * ICON_CATALOG.length)
        setIconKey(ICON_CATALOG[randomIndex].key)
      }
      setNameError(null)
      setTemplateError(null)
    }
  }, [prompt, isOpen])

  const validateName = (value: string) => {
    if (!value.trim()) {
      return t('settings.quickFollow.card.nameEmpty')
    }
    return null
  }

  const validateTemplate = (value: string) => {
    if (!value.trim()) {
      return t('settings.quickFollow.card.templateEmpty')
    }
    if (!value.includes(QUICK_FOLLOW_PLACEHOLDER)) {
      return t('settings.quickFollow.card.templateMissingPlaceholder', [QUICK_FOLLOW_PLACEHOLDER])
    }
    return null
  }

  const handleSave = async () => {
    const nameValidation = validateName(nameValue)
    const templateValidation = validateTemplate(templateValue)
    
    setNameError(nameValidation)
    setTemplateError(templateValidation)
    
    if (nameValidation || templateValidation) {
      return
    }

    setIsSaving(true)
    try {
      if (isCreating) {
        // Creating new prompt
        if (onCreate) {
          await onCreate({
            name: nameValue.trim(),
            template: templateValue,
            iconKey
          })
        }
      } else {
        // Updating existing prompt
        if (onUpdate && prompt) {
          await onUpdate(prompt.id, {
            name: nameValue.trim(),
            template: templateValue,
            iconKey
          })
        }
      }
      onClose()
    } finally {
      setIsSaving(false)
    }
  }

  const handleCancel = () => {
    onClose()
  }

  return (
    <Dialog.Root 
      open={isOpen} 
      onOpenChange={(e) => !e.open && handleCancel()} 
      placement="center"
      size="lg"
      closeOnInteractOutside={false}  // 防止意外关闭
      closeOnEscape={true}            // 保留 ESC 键关闭
    >
      <Dialog.Backdrop />
      <Dialog.Positioner>
        <Dialog.Content>
          <Dialog.Header>
            <Dialog.Title>
              {isCreating 
                ? t('settings.quickFollow.createModal.title') 
                : t('settings.quickFollow.editModal.title')}
            </Dialog.Title>
            <Dialog.CloseTrigger />
          </Dialog.Header>

          <Dialog.Body>
            <Stack gap={7}>
              {/* Icon and Name row */}
              <Box>
                <Text fontSize="sm" fontWeight="medium" mb={2}>
                  {t('settings.quickFollow.editModal.iconAndNameLabel')}{' '}
                  <Text as="span" color="red.focusRing">*</Text>
                </Text>
                <Stack direction="row" gap={4} align="flex-start">
                  <Box>
                    <IconPicker value={iconKey} onChange={setIconKey} />
                  </Box>
                  <Box flex={1}>
                    <InputGroup
                      width="100%"
                      endElement={
                        <Text fontSize="xs" color="fg.muted" pointerEvents="none">
                          {nameValue.length}/30
                        </Text>
                      }
                    >
                      <Input
                        placeholder={t('settings.quickFollow.editModal.namePlaceholder')}
                        value={nameValue}
                        onChange={event => setNameValue(event.target.value)}
                        borderColor={nameError ? 'red.400' : undefined}
                        maxLength={30}
                      />
                    </InputGroup>
                    {nameError ? (
                      <Text fontSize="sm" color="red.500" mt={1}>
                        {nameError}
                      </Text>
                    ) : null}
                  </Box>
                </Stack>
              </Box>

              {/* Template editor */}
              <Box>
                <Text fontSize="sm" fontWeight="medium" mb={2}>
                  {t('settings.quickFollow.editModal.templateLabel')}{' '}
                  <Text as="span" color="red.focusRing">*</Text>
                </Text>
                <PlaceholderChipEditor
                  value={templateValue}
                  onChange={setTemplateValue}
                  error={!!templateError}
                />
                {templateError ? (
                  <Text fontSize="sm" color="red.500" mt={1}>
                    {templateError}
                  </Text>
                ) : null}
              </Box>
            </Stack>
          </Dialog.Body>

          <Dialog.Footer>
            <Stack direction="row" gap={2} width="100%" justify="flex-end">
              <Button variant="outline" onClick={handleCancel} disabled={isSaving}>
                {t('settings.quickFollow.editModal.cancel')}
              </Button>
              <Button onClick={handleSave} loading={isSaving}>
                {t('settings.quickFollow.editModal.save')}
              </Button>
            </Stack>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog.Positioner>
    </Dialog.Root>
  )
}

