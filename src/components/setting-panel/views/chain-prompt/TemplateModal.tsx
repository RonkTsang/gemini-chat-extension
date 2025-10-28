/**
 * Template Modal
 * 显示默认模板列表，支持搜索、分类筛选和导入
 */

import React, { useEffect, useState } from 'react'
import {
  Box,
  Button,
  Card,
  Dialog,
  Flex,
  Grid,
  Heading,
  HStack,
  Spinner,
  Text,
  VStack,
  Badge,
  Portal,
  CloseButton
} from '@chakra-ui/react'
import { HiOutlineDownload } from 'react-icons/hi'
import type { DefaultTemplate } from '@/data/templates/chainPrompt'
import { defaultTemplateService } from '@/services/chainPromptTemplateService'
import { toaster } from '@/components/ui/toaster'
import { t } from '@/utils/i18n'

interface TemplateModalProps {
  open: boolean
  onClose: () => void
  onImport: () => void
}

export function TemplateModal({ open, onClose, onImport }: TemplateModalProps) {
  const [templates, setTemplates] = useState<DefaultTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState<string | null>(null)

  const loadTemplates = async () => {
    try {
      setLoading(true)
      const data = await defaultTemplateService.getAllTemplates()
      setTemplates(data)
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
    if (open) {
      loadTemplates()
    }
  }, [open])

  const handleImport = async (template: DefaultTemplate) => {
    try {
      setImporting(template.id)
      await defaultTemplateService.importTemplate(template.id)
      toaster.create({
        title: t('settingPanel.chainPrompt.toast.templateImported'),
        description: t('settingPanel.chainPrompt.toast.templateImportedDesc', template.name),
        type: 'success'
      })
      onImport()
    } catch (error) {
      toaster.create({
        title: t('settingPanel.chainPrompt.toast.importFailed'),
        description: error instanceof Error ? error.message : t('settingPanel.chainPrompt.toast.unknownError'),
        type: 'error'
      })
    } finally {
      setImporting(null)
    }
  }

  return (
    <Dialog.Root 
      open={open} 
      onOpenChange={(e) => !e.open && onClose()} 
      size="xl"
      closeOnInteractOutside={false}
      placement="center"
      scrollBehavior="inside"
    >
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content bg="bg" maxHeight="80vh">
            <Dialog.Header>
              <Dialog.Title>{t('settingPanel.chainPrompt.templateModal.title')}</Dialog.Title>
            </Dialog.Header>

            <Dialog.Body>
              {/* Templates Grid */}
              {loading ? (
                <Flex justify="center" align="center" py={8}>
                  <Spinner size="lg" colorPalette="blue" />
                </Flex>
              ) : templates.length === 0 ? (
                <Flex
                  bg="bg.muted"
                  borderRadius="lg"
                  p={8}
                  align="center"
                  justify="center"
                >
                  <VStack gap={2}>
                    <Text fontSize="lg" fontWeight="medium" color="fg">
                      {t('settingPanel.chainPrompt.templateModal.emptyTitle')}
                    </Text>
                    <Text color="fg.subtle" textAlign="center">
                      {t('settingPanel.chainPrompt.templateModal.emptyDesc')}
                    </Text>
                  </VStack>
                </Flex>
              ) : (
                <Grid templateColumns="repeat(3, 1fr)" gap={4} overflowY="auto">
                  {templates.map((template) => (
                    <Card.Root backgroundColor="gemSurfaceContainer" key={template.id} size="sm">
                      <Card.Header>
                        <VStack align="start" gap={2}>
                          <Heading size="md">{template.name}</Heading>
                          <Text title={template.description} color="fg.muted" fontSize="sm" lineClamp={3}>
                            {template.description}
                          </Text>
                        </VStack>
                      </Card.Header>
                      <Card.Body>
                        <HStack gap={2} fontSize="sm" color="fg.muted">
                          <Text>{t('settingPanel.chainPrompt.stats.steps', template.steps.length)}</Text>
                          {template.variables.length > 0 && (
                            <>
                              <Text>•</Text>
                              <Text>{t('settingPanel.chainPrompt.stats.variables', template.variables.length)}</Text>
                            </>
                          )}
                        </HStack>
                      </Card.Body>
                      <Card.Footer>
                        <Button
                          onClick={() => handleImport(template)}
                          width="100%"
                          size="sm"
                          colorPalette="blue"
                          loading={importing === template.id}
                          disabled={importing !== null}
                        >
                          <HiOutlineDownload />
                          {t('settingPanel.chainPrompt.import')}
                        </Button>
                      </Card.Footer>
                    </Card.Root>
                  ))}
                </Grid>
              )}
            </Dialog.Body>

            <Dialog.CloseTrigger asChild>
              <CloseButton size="sm" />
            </Dialog.CloseTrigger>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  )
}
