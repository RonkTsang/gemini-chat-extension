/**
 * Chain Prompt List View
 * 显示所有已保存的 Chain Prompts，支持搜索、运行、编辑、复制、删除
 */

import React, { useEffect, useState } from 'react'
import {
  Box,
  Button,
  Card,
  Flex,
  Grid,
  Heading,
  HStack,
  IconButton,
  Input,
  InputGroup,
  Menu,
  MenuContent,
  MenuItem,
  MenuRoot,
  MenuTrigger,
  Spinner,
  Text,
  VStack,
  Badge,
} from '@chakra-ui/react'
import { Tooltip } from "@/components/ui/tooltip"
import { HiOutlineDotsVertical, HiOutlinePlay, HiOutlinePlus, HiOutlineSearch, HiOutlineViewGridAdd } from 'react-icons/hi'
import type { SettingViewComponent } from '../../types'
import type { ChainPrompt } from '@/domain/chain-prompt/types'
import { chainPromptRepository } from '@/data/repositories'
import { useChainPromptStore } from '@/stores/chainPromptStore'
import { toaster } from '@/components/ui/toaster'
import { RunModal } from './RunModal'
import { TemplateModal } from './TemplateModal.js'
import { t } from '@/utils/i18n'

export const ChainPromptListView: SettingViewComponent = ({ openView }) => {
  const [prompts, setPrompts] = useState<ChainPrompt[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedPrompt, setSelectedPrompt] = useState<ChainPrompt | null>(null)
  const [showRunModal, setShowRunModal] = useState(false)
  const [showTemplateModal, setShowTemplateModal] = useState(false)

  const { searchQuery, setSearchQuery, startCreate, startEdit } = useChainPromptStore()

  const loadPrompts = async () => {
    try {
      setLoading(true)
      const data = await chainPromptRepository.list({
        search: searchQuery || undefined
      })
      setPrompts(data)
    } catch (error) {
      toaster.create({
        title: t('settingPanel.chainPrompt.toast.loadFailed'),
        description: error instanceof Error ? error.message : t('settingPanel.chainPrompt.toast.unknownError'),
        type: 'error'
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadPrompts()
  }, [searchQuery])

  const handleCreate = () => {
    startCreate()
    openView('editor')
  }

  const handleRun = (prompt: ChainPrompt) => {
    setSelectedPrompt(prompt)
    setShowRunModal(true)
  }

  const handleEdit = (prompt: ChainPrompt) => {
    startEdit(prompt)
    openView('editor')
  }

  const handleCopy = async (prompt: ChainPrompt) => {
    try {
      const duplicated = await chainPromptRepository.duplicate(prompt.id)
      toaster.create({
        title: t('settingPanel.chainPrompt.toast.copied'),
        description: t('settingPanel.chainPrompt.toast.copiedDesc', duplicated.name),
        type: 'success'
      })
      loadPrompts()
      startEdit(duplicated)
      openView('editor')
    } catch (error) {
      toaster.create({
        title: t('settingPanel.chainPrompt.toast.copyFailed'),
        description: error instanceof Error ? error.message : t('settingPanel.chainPrompt.toast.unknownError'),
        type: 'error'
      })
    }
  }

  const handleDelete = async (prompt: ChainPrompt) => {
    if (!window.confirm(t('settingPanel.chainPrompt.confirmDelete', prompt.name))) {
      return
    }

    try {
      await chainPromptRepository.delete(prompt.id)
      toaster.create({
        title: t('settingPanel.chainPrompt.toast.deleted'),
        type: 'success'
      })
      loadPrompts()
    } catch (error) {
      toaster.create({
        title: t('settingPanel.chainPrompt.toast.deleteFailed'),
        description: error instanceof Error ? error.message : t('settingPanel.chainPrompt.toast.unknownError'),
        type: 'error'
      })
    }
  }


  return (
    <VStack align="stretch" gap={6} height="100%">
      {/* Header */}
      <Flex justify="space-between" align="center" gap={4}>
        <HStack gap={2}>
          <Button
            onClick={handleCreate}
            size="xs"
          >
            <HiOutlinePlus />
            {t('settingPanel.chainPrompt.new')}
          </Button>

          <Tooltip content={t('settingPanel.chainPrompt.browseTemplates')}>
            <IconButton
              onClick={() => setShowTemplateModal(true)}
              size="xs"
              variant="outline"
              aria-label={t('settingPanel.chainPrompt.templates')}
            >
              <HiOutlineViewGridAdd />
            </IconButton>
          </Tooltip>
        </HStack>

        <Box position="relative" flex={1} maxW="500px">
          <InputGroup startElement={<HiOutlineSearch />}>
            <Input
              placeholder={t('settingPanel.chainPrompt.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              size="sm"
              pl={10}
            />
          </InputGroup>
        </Box>
      </Flex>


      {/* Content */}
      {loading ? (
        <Flex justify="center" align="center" flex={1}>
          <Spinner size="lg" colorPalette="blue" />
        </Flex>
      ) : prompts.length === 0 ? (
        <Flex
          flex={1}
          bg="bg.muted"
          borderRadius="lg"
          p={8}
          align="center"
          justify="center"
        >
          <VStack gap={3}>
            <Text fontSize="lg" fontWeight="medium" color="fg">
              {searchQuery ? t('settingPanel.chainPrompt.emptyTitleSearch') : t('settingPanel.chainPrompt.emptyTitle')}
            </Text>
            <Text color="fg.subtle" textAlign="center" maxW="md">
              {searchQuery
                ? t('settingPanel.chainPrompt.emptyDescSearch')
                : t('settingPanel.chainPrompt.emptyDesc')}
            </Text>
            {!searchQuery && (
              <VStack gap={3}>
                <Button onClick={handleCreate} mt={2}>
                  <HiOutlinePlus />
                  {t('settingPanel.chainPrompt.new')}
                </Button>
                <Button
                  onClick={() => setShowTemplateModal(true)}
                  variant="outline"
                  size="sm"
                >
                  <HiOutlineViewGridAdd />
                  {t('settingPanel.chainPrompt.browseTemplates')}
                </Button>
              </VStack>
            )}
          </VStack>
        </Flex>
      ) : (
        <Grid
          templateColumns="repeat(3, 1fr)"
          gap={4}
          pb={4}
        >
          {prompts.map((prompt) => (
            <Card.Root backgroundColor="gemSurfaceContainer" key={prompt.id} size="sm">
              <Card.Header>
                <Flex justify="space-between" align="start">
                  <VStack align="start" gap={1} flex={1} minW={0}>
                    <Heading size="md">{prompt.name}</Heading>
                    {prompt.description && (
                      <Text color="fg.muted" fontSize="sm" lineClamp={2}>
                        {prompt.description}
                      </Text>
                    )}
                  </VStack>
                  <Box flexShrink={0}>
                    <MenuRoot positioning={{ strategy: "fixed", hideWhenDetached: true }}>
                      <MenuTrigger asChild>
                        <IconButton
                          variant="ghost"
                          size="sm"
                          aria-label={t('settingPanel.chainPrompt.menu.moreOptions')}
                        >
                          <HiOutlineDotsVertical />
                        </IconButton>
                      </MenuTrigger>
                      <Menu.Positioner>
                        <MenuContent>
                          <MenuItem value="edit" onClick={() => handleEdit(prompt)}>
                            {t('settingPanel.chainPrompt.menu.edit')}
                          </MenuItem>
                          <MenuItem value="copy" onClick={() => handleCopy(prompt)}>
                            {t('settingPanel.chainPrompt.menu.copy')}
                          </MenuItem>
                          <MenuItem
                            value="delete"
                            color="fg.error"
                            _hover={{ bg: "bg.error", color: "fg.error" }}
                            onClick={() => handleDelete(prompt)}
                          >
                            {t('settingPanel.chainPrompt.menu.delete')}
                          </MenuItem>
                        </MenuContent>
                      </Menu.Positioner>
                    </MenuRoot>
                  </Box>
                </Flex>
              </Card.Header>
              <Card.Body>
                <HStack gap={2} fontSize="sm" color="fg.muted">
                  <Text>{t('settingPanel.chainPrompt.stats.steps', prompt.steps.length)}</Text>
                  {prompt.variables.length > 0 && (
                    <>
                      <Text>•</Text>
                      <Text>{t('settingPanel.chainPrompt.stats.variables', prompt.variables.length)}</Text>
                    </>
                  )}
                </HStack>
              </Card.Body>
              <Card.Footer>
                <Button
                  onClick={() => handleRun(prompt)}
                  width="100%"
                  size="sm"
                >
                  <HiOutlinePlay />
                  {t('settingPanel.chainPrompt.run')}
                </Button>
              </Card.Footer>
            </Card.Root>
          ))}
        </Grid>
      )}

      {/* Run Modal */}
      {selectedPrompt && (
        <RunModal
          prompt={selectedPrompt}
          open={showRunModal}
          onClose={() => {
            setShowRunModal(false)
            setSelectedPrompt(null)
          }}
          onEdit={() => {
            setShowRunModal(false)
            setSelectedPrompt(null)
            handleEdit(selectedPrompt)
          }}
        />
      )}

      {/* Template Modal */}
      {showTemplateModal && (
        <TemplateModal
          open={showTemplateModal}
          onClose={() => setShowTemplateModal(false)}
          onImport={() => {
            setShowTemplateModal(false)
            loadPrompts()
          }}
        />
      )}
    </VStack>
  )
}


