import { useEffect, useMemo, useState } from 'react'
import {
  Box,
  Button,
  Container,
  Heading,
  IconButton,
  Stack,
  Switch,
  Text
} from '@chakra-ui/react'
import { FiPlus } from 'react-icons/fi'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy
} from '@dnd-kit/sortable'

import { InfoTip } from '@/components/ui/toggle-tip'
import { ICON_CATALOG } from '@/components/quick-follow/icons'
import { PreviewSection } from './PreviewSection'
import { PromptListItem } from './PromptListItem'
import { PromptEditModal } from './PromptEditModal'
import { useQuickFollowStore } from '@/stores/quickFollowStore'
import type { QuickFollowPrompt } from '@/domain/quick-follow/types'
import { MAX_QUICK_FOLLOW_UP_SHOW_ITEMS } from '@/common/config'
import { QUICK_FOLLOW_STARTER_TEMPLATES } from '@/data/templates/quickFollow'
import { t } from '@/utils/i18n'
import { toaster } from '@/components/ui/toaster'
import { Tooltip } from '@/components/ui/tooltip'

function sortPrompts(prompts: QuickFollowPrompt[], orderedIds: string[]) {
  const orderMap = new Map(orderedIds.map((id, index) => [id, index]))
  return prompts
    .slice()
    .sort((a, b) => {
      const orderA = orderMap.get(a.id)
      const orderB = orderMap.get(b.id)

      if (orderA === undefined && orderB === undefined) {
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      }
      if (orderA === undefined) return 1
      if (orderB === undefined) return -1
      return orderA - orderB
    })
}

export function QuickFollowSettingsView() {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 }
    })
  )

  const prompts = useQuickFollowStore(state => state.prompts)
  const settings = useQuickFollowStore(state => state.settings)
  const hydrate = useQuickFollowStore(state => state.hydrate)
  const addPrompt = useQuickFollowStore(state => state.addPrompt)
  const updatePrompt = useQuickFollowStore(state => state.updatePrompt)
  const deletePrompt = useQuickFollowStore(state => state.deletePrompt)
  const reorder = useQuickFollowStore(state => state.reorder)
  const setEnabled = useQuickFollowStore(state => state.setEnabled)
  const isHydrated = useQuickFollowStore(state => state.isHydrated)
  const isHydrating = useQuickFollowStore(state => state.isHydrating)

  const orderedPrompts = useMemo(
    () => sortPrompts(prompts, settings.orderedIds),
    [prompts, settings.orderedIds]
  )

  // Modal state for editing/creating
  const [editingPrompt, setEditingPrompt] = useState<QuickFollowPrompt | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)

  useEffect(() => {
    if (!isHydrated && !isHydrating) {
      void hydrate()
    }
  }, [hydrate, isHydrated, isHydrating])

  const handleAddPrompt = () => {
    // Open modal in create mode (editingPrompt = null)
    // Default values (icon, template) will be handled inside the modal
    setEditingPrompt(null)
    setIsModalOpen(true)
  }

  const handleAddTemplates = async () => {
    try {
      const templates = [...QUICK_FOLLOW_STARTER_TEMPLATES].reverse()

      for (const [index, template] of templates.entries()) {
        const iconKey =
          template.iconKey ??
          ICON_CATALOG[(index + templates.length) % ICON_CATALOG.length].key
        await addPrompt({
          name: template.name,
          template: template.template,
          iconKey
        })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to add templates'
      toaster.create({ type: 'error', title: message })
    }
  }

  const handleCreatePrompt = async (input: Parameters<typeof addPrompt>[0]) => {
    try {
      await addPrompt(input)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create prompt'
      toaster.create({ type: 'error', title: message })
      throw error
    }
  }

  const handleUpdatePrompt = async (id: string, patch: Parameters<typeof updatePrompt>[1]) => {
    try {
      await updatePrompt(id, patch)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update prompt'
      toaster.create({ type: 'error', title: message })
      throw error
    }
  }

  const handleEditPrompt = (id: string) => {
    const prompt = orderedPrompts.find(p => p.id === id)
    if (prompt) {
      setEditingPrompt(prompt)
      setIsModalOpen(true)
    }
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
    setEditingPrompt(null)
  }

  const handleDeletePrompt = async (id: string) => {
    try {
      await deletePrompt(id)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete prompt'
      toaster.create({ type: 'error', title: message })
    }
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) {
      return
    }

    const sourceIndex = orderedPrompts.findIndex(prompt => prompt.id === active.id)
    const targetIndex = orderedPrompts.findIndex(prompt => prompt.id === over.id)
    if (sourceIndex === -1 || targetIndex === -1) {
      return
    }

    const reordered = [...orderedPrompts]
    const [moved] = reordered.splice(sourceIndex, 1)
    reordered.splice(targetIndex, 0, moved)

    try {
      await reorder(reordered.map(item => item.id))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to reorder prompts'
      toaster.create({ type: 'error', title: message })
    }
  }

  const handleToggleEnabled = async (checked: boolean) => {
    try {
      await setEnabled(checked)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update setting'
      toaster.create({ type: 'error', title: message })
    }
  }

  return (
    <Box 
      position="relative" 
      height="100%" 
      display="flex" 
      flexDirection="column"
      data-view="quick-follow-settings"
    >
      {/* Scrollable content area */}
      <Box 
        flex="1" 
        overflow="auto"
      >
        <Container display={'flex'} justifyContent={'center'}>
          <Stack direction="column" maxWidth={'740px'} width={'100%'} align="stretch" gap={6}>
            {/* Preview Section */}
            <PreviewSection prompts={prompts} settings={settings} />

            {/* Enable Toggle */}
            <Container backgroundColor="gemSurfaceContainer" p={4} borderRadius="2xl">
              <Stack direction="row" align="center" justify="space-between" gap={3}>
                <Text>{t('settings.quickFollow.enable')}</Text>
                <Switch.Root
                  checked={settings.enabled}
                  onCheckedChange={(details) => void handleToggleEnabled(details.checked)}
                  disabled={isHydrating}
                >
                  <Switch.HiddenInput />
                  <Switch.Control>
                    <Switch.Thumb />
                  </Switch.Control>
                </Switch.Root>
              </Stack>
            </Container>

            {/* Custom Prompts Section */}
            <Container p={2} borderRadius="2xl">
              <Box>
                <Stack direction="row" justify="space-between" align="center" mb={3}>
                  <Stack direction="column" gap={1}>
                    <Heading size="sm">{t('settings.quickFollow.customPrompts.title')}</Heading>
                    <Text fontSize="xs" color="fg.muted">
                      {t('settings.quickFollow.customPrompts.description', MAX_QUICK_FOLLOW_UP_SHOW_ITEMS)}
                    </Text>
                  </Stack>
                  <Tooltip content={t('settings.quickFollow.customPrompts.add')}>
                    <IconButton
                      onClick={handleAddPrompt}
                      variant="subtle"
                      size="sm"
                    >
                      <FiPlus />
                    </IconButton>
                  </Tooltip>
                </Stack>
                
                {/* List */}
                {orderedPrompts.length === 0 ? (
                  <Stack
                    border="1px dashed"
                    borderColor="tocHoverBg"
                    borderRadius="lg"
                    p={6}
                    align="center"
                    justify="center"
                    color="muted"
                    gap={4}
                  >
                    <Text>{t('settings.quickFollow.customPrompts.empty')}</Text>
                    <Stack
                      direction={{ base: 'column', sm: 'row' }}
                      gap={2}
                      width="100%"
                      justify="center"
                      align="center"
                    >
                      <Button
                        onClick={handleAddPrompt}
                        variant="outline"
                        size="sm"
                        width={{ base: '100%', sm: 'auto' }}
                      >
                        <FiPlus />
                        {t('settings.quickFollow.customPrompts.add')}
                      </Button>
                      <Button
                        onClick={handleAddTemplates}
                        variant="subtle"
                        size="sm"
                        width={{ base: '100%', sm: 'auto' }}
                      >
                        <FiPlus />
                        {t('settings.quickFollow.customPrompts.addTemplates')}
                      </Button>
                    </Stack>
                  </Stack>
                ) : (
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                  >
                    <SortableContext
                      items={orderedPrompts.map(p => p.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <Stack gap={2}>
                        {orderedPrompts.map(prompt => (
                          <PromptListItem
                            key={prompt.id}
                            prompt={prompt}
                            onEdit={handleEditPrompt}
                            onDelete={handleDeletePrompt}
                          />
                        ))}
                      </Stack>
                    </SortableContext>
                  </DndContext>
                )}
              </Box>
            </Container>
          </Stack>
        </Container>
      </Box>

      {/* Edit/Create Modal */}
      <PromptEditModal
        prompt={editingPrompt}
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onCreate={handleCreatePrompt}
        onUpdate={handleUpdatePrompt}
      />
    </Box>
  )
}

QuickFollowSettingsView.displayName = 'QuickFollowSettingsView'

