/**
 * Chain Prompt Editor View
 * 创建或编辑 Chain Prompt
 */

import React, { useEffect, useState, useRef } from 'react'
import { useDebounceFn } from 'ahooks'
import {
  Box,
  Button,
  Collapsible,
  Field,
  Flex,
  Heading,
  HStack,
  IconButton,
  Input,
  Menu,
  MenuContent,
  MenuItem,
  MenuRoot,
  MenuTrigger,
  Separator,
  Text,
  Textarea,
  VStack
} from '@chakra-ui/react'
import {
  HiOutlinePlus,
  HiOutlineTrash,
  HiOutlineMenu,
  HiOutlineChevronDown,
  HiOutlineChevronUp
} from 'react-icons/hi'
import { nanoid } from 'nanoid'
import type { SettingViewComponent } from '../../types'
import { useChainPromptStore } from '@/stores/chainPromptStore'
import { chainPromptRepository } from '@/data/repositories'
import { toaster } from '@/components/ui/toaster'
import { templateEngine } from '@/services/templateEngine'
import { t } from '@/utils/i18n'
import type { ChainVariable } from '@/domain/chain-prompt/types'

/**
 * Escapes special regex characters in a string
 * @param string - The string to escape
 * @returns The escaped string safe for use in RegExp
 */
const escapeRegExp = (string: string): string => {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Updates variable references in all step prompts when a variable key changes
 * @param oldKey - The old variable key
 * @param newKey - The new variable key
 * @param steps - Array of steps to update
 * @returns Array of step updates with modified prompts
 */
const updateVariableReferences = (
  oldKey: string, 
  newKey: string, 
  steps: Array<{ id: string; prompt: string }>
): Array<{ index: number; step: { prompt: string } }> => {
  if (!oldKey.trim() || !newKey.trim() || oldKey === newKey) {
    return []
  }

  const updates: Array<{ index: number; step: { prompt: string } }> = []
  const escapedOldKey = escapeRegExp(oldKey)
  const regex = new RegExp(`\\{\\{${escapedOldKey}\\}\\}`, 'g')

  steps.forEach((step, index) => {
    const updatedPrompt = step.prompt.replace(regex, `{{${newKey}}}`)
    if (updatedPrompt !== step.prompt) {
      updates.push({ index, step: { prompt: updatedPrompt } })
    }
  })

  return updates
}

export const ChainPromptEditorView: SettingViewComponent = ({ openView }) => {
  const {
    editing,
    updateName,
    updateDescription,
    addVariable,
    addVariableFromText,
    updateVariable,
    removeVariable,
    addStep,
    updateStep,
    updateSteps,
    removeStep,
    reorderSteps,
    cancelEdit
  } = useChainPromptStore()

  const [saving, setSaving] = useState(false)
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [selectedText, setSelectedText] = useState<{
    stepIndex: number
    text: string
    textarea: HTMLTextAreaElement
  } | null>(null)
  const [buttonPosition, setButtonPosition] = useState<{ top: number; left: number } | null>(null)
  const stepRefs = useRef<(HTMLDivElement | null)[]>([])
  const textareaRefs = useRef<(HTMLTextAreaElement | null)[]>([])
  const lastSelectionRef = useRef<({ start: number; end: number } | null)[]>([])
  const stepsScrollRef = useRef<HTMLDivElement | null>(null)
  const previousStepsLength = useRef<number>(0)

  useEffect(() => {
    if (!editing) {
      openView('index')
    }
  }, [editing, openView])

  // Auto scroll to newly added step
  useEffect(() => {
    if (editing && editing.steps.length > previousStepsLength.current) {
      const lastIndex = editing.steps.length - 1
      const lastStepRef = stepRefs.current[lastIndex]
      
      if (lastStepRef) {
        // Use setTimeout to ensure DOM is updated
        setTimeout(() => {
          lastStepRef.scrollIntoView({
            behavior: 'smooth',
            block: 'nearest'
          })
        }, 100)
      }
    }
    
    previousStepsLength.current = editing?.steps.length || 0
  }, [editing?.steps.length])

  // Click-away listener for text selection
  useEffect(() => {
    const handleClickAway = (e: MouseEvent) => {
      // Don't clear if clicking on the floating button
      const target = e.target as HTMLElement
      if (target && target.closest('[data-floating-variable-button]')) {
        return
      }
      setSelectedText(null)
      setButtonPosition(null)
    }
    
    if (selectedText) {
      document.addEventListener('click', handleClickAway)
      return () => document.removeEventListener('click', handleClickAway)
    }
  }, [selectedText])


  if (!editing) {
    return null
  }

  const handleSave = async () => {
    // 验证
    if (!editing.name.trim()) {
      toaster.create({
        title: t('settingPanel.editor.validation.title'),
        description: t('settingPanel.editor.validation.enterName'),
        type: 'error'
      })
      return
    }

    if (editing.steps.length === 0) {
      toaster.create({
        title: t('settingPanel.editor.validation.title'),
        description: t('settingPanel.editor.validation.addOneStep'),
        type: 'error'
      })
      return
    }

    // 检查步骤是否都有内容
    const emptySteps = editing.steps.filter(s => !s.prompt.trim())
    if (emptySteps.length > 0) {
      toaster.create({
        title: t('settingPanel.editor.validation.title'),
        description: t('settingPanel.editor.validation.allStepsHaveContent'),
        type: 'error'
      })
      return
    }

    // 智能处理变量：过滤空变量
    const validVariables = editing.variables.filter(v => v.key.trim())
    const ignoredCount = editing.variables.length - validVariables.length

    // 检查有效变量的 key 是否重复
    const variableKeys = validVariables.map(v => v.key)
    const duplicates = variableKeys.filter((key, index) => variableKeys.indexOf(key) !== index)
    if (duplicates.length > 0) {
      toaster.create({
        title: t('settingPanel.editor.validation.title'),
        description: t('settingPanel.editor.validation.duplicateKeys', duplicates.join(', ')),
        type: 'error'
      })
      return
    }

    setSaving(true)
    try {
      if (editing.mode === 'create') {
        await chainPromptRepository.create({
          name: editing.name,
          description: editing.description || undefined,
          variables: validVariables, // 只保存有效变量
          steps: editing.steps
        })
        toaster.create({
          title: t('settingPanel.editor.saveToast.created'),
          description: ignoredCount > 0 
            ? t('settingPanel.editor.saveToast.ignoredVars', String(ignoredCount))
            : undefined,
          type: 'success'
        })
      } else {
        await chainPromptRepository.update(editing.promptId!, {
          name: editing.name,
          description: editing.description || undefined,
          variables: validVariables, // 只保存有效变量
          steps: editing.steps
        })
        toaster.create({
          title: t('settingPanel.editor.saveToast.updated'),
          description: ignoredCount > 0 
            ? t('settingPanel.editor.saveToast.ignoredVars', String(ignoredCount))
            : undefined,
          type: 'success'
        })
      }
      cancelEdit()
      openView('index')
    } catch (error) {
      toaster.create({
        title: t('settingPanel.editor.saveToast.failed'),
        description: error instanceof Error ? error.message : t('settingPanel.runModal.toaster.unknownError'),
        type: 'error'
      })
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    if (window.confirm(t('settingPanel.editor.confirmDiscard'))) {
      cancelEdit()
      openView('index')
    }
  }

  const handleDragStart = (index: number) => {
    setDraggedIndex(index)
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
  }

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault()
    if (draggedIndex !== null && draggedIndex !== dropIndex) {
      reorderSteps(draggedIndex, dropIndex)
    }
    setDraggedIndex(null)
  }

  const getAvailableVariablesForStep = (stepIndex: number) => {
    const variableKeys = editing.variables.map(v => v.key).filter(k => k.trim())
    return templateEngine.getAvailableVariables(
      Object.fromEntries(variableKeys.map(k => [k, ''])),
      stepIndex
    )
  }

  /**
   * 防抖的 Toast 通知函数
   * 在用户停止输入1秒后显示更新通知
   */
  const { run: showDebouncedToast } = useDebounceFn(
    () => {
      toaster.create({
        title: t('settingPanel.editor.variableKeyUpdated'),
        description: t('settingPanel.editor.variableReferencesUpdated'),
        type: 'success'
      })
    },
    { wait: 1000 }
  )

  /**
   * 防抖的文本选择处理函数
   * 在用户停止选择文本200ms后处理选择逻辑
   */
  const { run: debouncedHandleTextSelection } = useDebounceFn(
    (textarea: HTMLTextAreaElement, stepIndex: number) => {
      // Method 1: Use window.getSelection() for better cross-browser support
      const selection = window.getSelection()
      const selectedText = selection ? selection.toString().trim() : ''
      
      // Method 2: Try to get textarea from ref
      let textareaSelectedText = ''
      const refTextarea = textareaRefs.current[stepIndex]
      const activeTextarea = textarea || refTextarea
      
      if (activeTextarea && activeTextarea.selectionStart !== null && activeTextarea.selectionEnd !== null) {
        const start = activeTextarea.selectionStart
        const end = activeTextarea.selectionEnd
        textareaSelectedText = activeTextarea.value.substring(start, end).trim()
        // Record last selection for this step for later variable insertion
        lastSelectionRef.current[stepIndex] = { start, end }
      }
      
      // Use the method that has text
      const finalSelectedText = selectedText || textareaSelectedText
      
      if (finalSelectedText.length === 0) {
        setSelectedText(null)
        setButtonPosition(null)
        return
      }
      
      // 边缘情况1: 检查选中文本是否包含变量语法特殊字符
      if (finalSelectedText.includes('{{') || finalSelectedText.includes('}}')) {
        setSelectedText(null)
        setButtonPosition(null)
        return
      }
      
      // Calculate button position relative to steps container (with null check)
      if (!activeTextarea) {
        console.warn('No active textarea found, cannot calculate position')
        return
      }
      const textareaRect = activeTextarea.getBoundingClientRect()
      const container = stepsScrollRef.current
      const containerRect = container?.getBoundingClientRect()
      if (!container || !containerRect) {
        console.warn('Steps container not found, cannot position button relative to it')
        return
      }
      const relativeTop = (textareaRect.top - containerRect.top) + container.scrollTop - 40
      const relativeLeft = (textareaRect.left - containerRect.left) + container.scrollLeft + (textareaRect.width / 2)

      setSelectedText({ stepIndex, text: finalSelectedText, textarea: activeTextarea })
      setButtonPosition({
        top: relativeTop,
        left: relativeLeft
      })
    },
    { wait: 200 }
  )

  /**
   * Enhanced variable update function that handles real-time key updates with debounced toast
   * @param index - Variable index
   * @param variable - Updated variable object
   */
  const handleVariableUpdate = (index: number, variable: ChainVariable) => {
    if (!editing) return

    const oldVariable = editing.variables[index]
    const oldKey = oldVariable?.key?.trim()
    const newKey = variable.key?.trim()

    // Update the variable in the store
    updateVariable(index, variable)

    // If the key has changed and both old and new keys are valid, update references
    if (oldKey && newKey && oldKey !== newKey) {
      try {
        const stepUpdates = updateVariableReferences(oldKey, newKey, editing.steps)
        
        if (stepUpdates.length > 0) {
          // 立即批量更新所有受影响的步骤
          updateSteps(stepUpdates)
          
          // 触发防抖的 Toast 通知
          showDebouncedToast()
        }
      } catch (error) {
        console.error('Failed to update variable references:', error)
        
        // 错误通知立即显示，不需要防抖
        toaster.create({
          title: t('settingPanel.editor.variableUpdateError'),
          description: t('settingPanel.editor.variableUpdateErrorDesc'),
          type: 'error'
        })
      }
    }
  }

  const insertVariableToStep = (stepIndex: number, variable: string) => {
    const step = editing.steps[stepIndex]
    const textarea = textareaRefs.current[stepIndex]
    const lastSel = lastSelectionRef.current[stepIndex]

    // Prefer last known selection range for this step
    const start = lastSel?.start ?? textarea?.selectionStart ?? step.prompt.length
    const end = lastSel?.end ?? textarea?.selectionEnd ?? step.prompt.length

    const before = step.prompt.substring(0, start)
    const after = step.prompt.substring(end)
    const inserted = `{{${variable}}}`
    const newPrompt = `${before}${inserted}${after}`

    updateStep(stepIndex, { prompt: newPrompt })

    // Restore focus and selection to right after inserted text
    setTimeout(() => {
      const ta = textareaRefs.current[stepIndex]
      if (ta) {
        const caret = (start as number) + inserted.length
        ta.focus()
        try {
          ta.setSelectionRange(caret, caret)
        } catch {}
      }
    }, 0)
  }

  /**
   * 文本选择事件处理函数
   * 使用防抖优化，避免频繁触发
   */
  const handleTextSelection = (e: React.SyntheticEvent<HTMLTextAreaElement>, stepIndex: number) => {
    // Store the textarea reference immediately to avoid async issues
    const textarea = e.currentTarget
    
    // 触发防抖的文本选择处理
    debouncedHandleTextSelection(textarea, stepIndex)
  }

  const handleCreateVariableFromSelection = () => {
    if (!selectedText || !editing) return
    
    const { stepIndex, text, textarea } = selectedText
    const step = editing.steps[stepIndex]
    
    // 边缘情况2: 检查选中的文本是否已经是现有的变量名
    const existingVariable = editing.variables.find(variable => variable.key === text)
    
    if (existingVariable) {
      // 如果变量已存在，只替换文本为插值语法，不创建新变量
      if (textarea && textarea.selectionStart !== null && textarea.selectionEnd !== null) {
        const start = textarea.selectionStart
        const end = textarea.selectionEnd
        const newPrompt = 
          step.prompt.substring(0, start) +
          `{{${text}}}` +
          step.prompt.substring(end)
        
        updateStep(stepIndex, { prompt: newPrompt })
        
        // Restore focus and set caret position after insertion
        setTimeout(() => {
          textarea.focus()
          const newCaretPosition = start + `{{${text}}}`.length
          textarea.setSelectionRange(newCaretPosition, newCaretPosition)
        }, 0)
      } else {
        console.warn('Cannot replace text: textarea or selection properties are null')
        const newPrompt = step.prompt + `{{${text}}}`
        updateStep(stepIndex, { prompt: newPrompt })
      }
    } else {
      // 如果变量不存在，创建新变量并替换文本
      addVariableFromText(text, text)
      
      // Replace selected text with variable syntax (with null check)
      if (textarea && textarea.selectionStart !== null && textarea.selectionEnd !== null) {
        const start = textarea.selectionStart
        const end = textarea.selectionEnd
        const newPrompt = 
          step.prompt.substring(0, start) +
          `{{${text}}}` +
          step.prompt.substring(end)
        
        updateStep(stepIndex, { prompt: newPrompt })
        
        // Restore focus and set caret position after insertion
        setTimeout(() => {
          textarea.focus()
          const newCaretPosition = start + `{{${text}}}`.length
          textarea.setSelectionRange(newCaretPosition, newCaretPosition)
        }, 0)
      } else {
        console.warn('Cannot replace text: textarea or selection properties are null')
        const newPrompt = step.prompt + `{{${text}}}`
        updateStep(stepIndex, { prompt: newPrompt })
      }
    }
    
    // Clear selection state
    setSelectedText(null)
    setButtonPosition(null)
  }

  return (
    <VStack align="stretch" gap={0} height="100%">
      {/* Main Content Area */}
      <HStack align="stretch" gap={0} flex={1} overflow="hidden">
        {/* Left: Steps Area (Main Content) */}
        <Box
          flex={1}
          height="100%"
          display="flex"
          flexDirection="column"
          pr={4}
        >
          {/* Steps Header */}
          <Flex justify="space-between" align="center" mb={4} flexShrink={0}>
            <Heading size="md">{t('settingPanel.editor.stepsTitle')}</Heading>
            <Button
              size="xs"
              variant="outline"
              onClick={() => addStep()}
            >
              <HiOutlinePlus />
              {t('settingPanel.editor.addStep')}
            </Button>
          </Flex>

          {/* Steps List - Scrollable */}
          <Box flex={1} overflowY="auto" pr={2} position="relative" ref={stepsScrollRef}>
          {editing.steps.length === 0 ? (
            <Box
              backgroundColor="gemSurfaceContainer"
              borderRadius="lg"
              p={8}
              textAlign="center"
            >
              <Text fontSize="4xl" mb={2}>💡</Text>
              <Heading size="sm" mb={2}>{t('settingPanel.editor.startTitle')}</Heading>
              <Text fontSize="sm" color="fg.muted" mb={4}>
                {t('settingPanel.editor.startDesc')}
              </Text>
              <Button colorScheme="blue" onClick={() => addStep()}>
                <HiOutlinePlus />
                {t('settingPanel.editor.addFirstStep')}
              </Button>
            </Box>
          ) : (
            <VStack align="stretch" gap={0} pb={4}>
              {editing.steps.map((step, index) => (
                <Box 
                  key={step.id}
                  ref={(el: HTMLDivElement | null) => { stepRefs.current[index] = el }}
                >
                  {/* Step Card */}
                  <Box
                    data-card
                    // bg={draggedIndex === index ? 'blue.subtle' : 'bg.panel'}
                    bg="chainPromptCardBg"
                    border="1px solid"
                    borderColor="border"
                    borderRadius="lg"
                    overflow="hidden"
                    shadow={draggedIndex === index ? 'sm' : 'none'}
                    transition="all 0.2s"
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDrop={(e) => handleDrop(e, index)}
                    _hover={{
                      borderColor: draggedIndex === index ? 'blue.muted' : 'border',
                      shadow: 'xs'
                    }}
                  >
                    <Flex align="stretch">
                      {/* Left: Number Area */}
                      <VStack
                        w="60px"
                        justify="flex-start"
                        align="center"
                        pt={4}
                        pb={3}
                        cursor="grab"
                        draggable
                        onDragStart={(e) => {
                          handleDragStart(index)
                          const card = (e.currentTarget.closest('[data-card]') as HTMLElement | null)
                          if (card && e.dataTransfer) {
                            try {
                              const rect = card.getBoundingClientRect()
                              const offsetX = e.clientX - rect.left
                              const offsetY = e.clientY - rect.top
                              e.dataTransfer.setDragImage(card, Math.round(offsetX), Math.round(offsetY))
                              // e.dataTransfer.setDragImage(card, Math.floor(card.offsetWidth / 2), 16)
                            } catch {}
                          }
                        }}
                      >
                        <Box
                          fontSize="lg"
                          fontWeight="bold"
                          w="36px"
                          h="36px"
                          display="flex"
                          alignItems="center"
                          justifyContent="center"
                          borderRadius="full"
                          color="blue.fg"
                          bg="blue.subtle"
                        >
                          {index + 1}
                        </Box>
                      </VStack>

                      {/* Right: Content */}
                      <Box
                        flex={1}
                        p={4}
                        position="relative"
                        onDragStart={(e) => {
                          // Guard: prevent drag when interacting with inputs/textareas
                          const target = e.target as HTMLElement
                          if (target && target.closest('input, textarea, [contenteditable]')) {
                            e.preventDefault()
                          }
                        }}
                      >
                        <VStack align="stretch" gap={3}>
                          {/* Step Name Input - No Label */}
                          <Input
                            borderColor="gemOutlineVariant"
                            value={step.name || ''}
                            onChange={(e) => updateStep(index, { name: e.target.value })}
                            placeholder={t('settingPanel.editor.placeholders.stepName', String(index + 1))}
                            size="md"
                            fontWeight="medium"
                            onMouseDown={(e) => e.stopPropagation()}
                            onDragStart={(e) => e.stopPropagation()}
                          />

                          {/* Prompt Textarea - No Label */}
                          <Textarea
                            borderColor="gemOutlineVariant"
                            ref={(el: HTMLTextAreaElement | null) => { textareaRefs.current[index] = el }}
                            value={step.prompt}
                            onChange={(e) => updateStep(index, { prompt: e.target.value })}
                            onMouseUp={(e) => handleTextSelection(e, index)}
                            onKeyUp={(e) => handleTextSelection(e, index)}
                            placeholder={t('settingPanel.editor.placeholders.prompt')}
                            rows={4}
                            size="sm"
                            onMouseDown={(e) => e.stopPropagation()}
                            onDragStart={(e) => e.stopPropagation()}
                          />

                          {/* Bottom Row: Insert Helper & Delete Button */}
                          <Flex justify="space-between" align="center">
                            {/* Insert Variable Helper */}
                            <Flex gap={2} align="center">
                              <Text fontSize="sm" color="fg.muted">
                                {t('settingPanel.editor.insert')}
                              </Text>
                              <MenuRoot positioning={{ strategy: "fixed", hideWhenDetached: true }}>
                                <MenuTrigger asChild>
                                  <Button size="xs" variant="outline">
                                    {t('settingPanel.editor.variables')}
                                    <HiOutlineChevronDown />
                                  </Button>
                                </MenuTrigger>
                                <Menu.Positioner>
                                  <MenuContent>
                                    {getAvailableVariablesForStep(index).length > 0 ? (
                                      getAvailableVariablesForStep(index).map((variable) => (
                                        <MenuItem
                                          key={variable}
                                          value={variable}
                                          onClick={() => insertVariableToStep(index, variable)}
                                        >
                                          {`{{${variable}}}`}
                                        </MenuItem>
                                      ))
                                    ) : (
                                      <MenuItem value="add-variable" onClick={addVariable}>
                                        <HiOutlinePlus />
                                        {t('settingPanel.editor.addVariable')}
                                      </MenuItem>
                                    )}
                                  </MenuContent>
                                </Menu.Positioner>
                              </MenuRoot>
                            </Flex>

                            {/* Delete Button */}
                            <IconButton
                              aria-label={t('settingPanel.editor.aria.removeStep')}
                              variant="ghost"
                              colorPalette="red"
                              onClick={() => removeStep(index)}
                              size="xs"
                            >
                              <HiOutlineTrash />
                            </IconButton>
                          </Flex>
                        </VStack>
                      </Box>
                    </Flex>
                  </Box>

                  {/* Connector Line */}
                  {index < editing.steps.length - 1 && (
                    <Flex justify="center" py={2}>
                      <Box
                        w="2px"
                        h="24px"
                        borderLeft="2px dashed"
                        borderColor="border.emphasized"
                      />
                    </Flex>
                  )}

                  {/* Add Step Button (after last step) */}
                  {index === editing.steps.length - 1 && (
                    <Flex justify="center" py={3} position="relative">
                      <Box
                        w="2px"
                        h="16px"
                        borderLeft="2px dashed"
                        borderColor="border.emphasized"
                        position="absolute"
                        top={0}
                      />
                      <IconButton
                        aria-label="Add step"
                        variant="outline"
                        size="lg"
                        onClick={() => addStep()}
                        borderRadius="lg"
                        mt={4}
                      >
                        <HiOutlinePlus size={20} />
                      </IconButton>
                    </Flex>
                  )}
                </Box>
              ))}
            </VStack>
          )}

          {/* Floating Variable Creation Button (within steps container) */}
          {selectedText && buttonPosition && (
            <Button
              size="xs"
              colorScheme="blue"
              position="absolute"
              top={`${buttonPosition.top}px`}
              left={`${buttonPosition.left}px`}
              transform="translateX(-50%)"
              zIndex="popover"
              shadow="md"
              data-floating-variable-button="true"
              onClick={handleCreateVariableFromSelection}
              onMouseDown={(e) => e.stopPropagation()}
            >
              {t('settingPanel.editor.addAsVariable')}
            </Button>
          )}
        </Box>
      </Box>

      {/* Right: Sidebar (Name & Variables) */}
      <Box
        w="320px"
        minW="280px"
        maxW="400px"
        height="100%"
        borderLeft="1px solid"
        borderColor="border.muted"
        pl={4}
        display="flex"
        flexDirection="column"
      >
        {/* Scrollable Content */}
        <VStack align="stretch" gap={3} flex={1} overflowY="auto" pr={2} pb={4}>
          {/* Name - Collapsible */}
          <Collapsible.Root defaultOpen={true}>
            <Collapsible.Trigger asChild>
              <Flex
                justify="space-between"
                align="center"
                cursor="pointer"
                p={2}
                borderRadius="md"
                _hover={{ bg: 'bg.muted' }}
              >
                        <Heading size="sm">{t('settingPanel.editor.sidebar.name')}</Heading>
                <Collapsible.Context>
                  {({ open }) => (
                    open ? <HiOutlineChevronUp /> : <HiOutlineChevronDown />
                  )}
                </Collapsible.Context>
              </Flex>
            </Collapsible.Trigger>
            <Collapsible.Content>
              <Box pt={2} px={1} pb={1}>
                <Input
                  value={editing.name}
                  onChange={(e) => updateName(e.target.value)}
                  placeholder={t('settingPanel.editor.placeholders.name')}
                  size="sm"
                />
              </Box>
            </Collapsible.Content>
          </Collapsible.Root>

          {/* Description - Collapsible */}
          <Collapsible.Root defaultOpen={false}>
            <Collapsible.Trigger asChild>
              <Flex
                justify="space-between"
                align="center"
                cursor="pointer"
                p={2}
                borderRadius="md"
                _hover={{ bg: 'bg.muted' }}
              >
                        <Heading size="sm">{t('settingPanel.editor.sidebar.description')}</Heading>
                <Collapsible.Context>
                  {({ open }) => (
                    open ? <HiOutlineChevronUp /> : <HiOutlineChevronDown />
                  )}
                </Collapsible.Context>
              </Flex>
            </Collapsible.Trigger>
            <Collapsible.Content>
              <Box pt={2} px={1} pb={1}>
                <Textarea
                  value={editing.description}
                  onChange={(e) => updateDescription(e.target.value)}
                  placeholder={t('settingPanel.editor.placeholders.desc')}
                  rows={1}
                  size="sm"
                />
              </Box>
            </Collapsible.Content>
          </Collapsible.Root>

          {/* Variables - Collapsible */}
          <Collapsible.Root defaultOpen={true}>
            <Collapsible.Trigger asChild>
              <Flex
                justify="space-between"
                align="center"
                cursor="pointer"
                p={2}
                borderRadius="md"
                _hover={{ bg: 'bg.muted' }}
              >
                <Heading size="sm">{t('settingPanel.editor.sidebar.inputVariables')}</Heading>
                <HStack gap={1}>
                  <IconButton
                    aria-label="Add variable"
                    size="xs"
                    variant="ghost"
                    onClick={(e) => {
                      e.stopPropagation()
                      addVariable()
                    }}
                  >
                    <HiOutlinePlus />
                  </IconButton>
                  <Collapsible.Context>
                    {({ open }) => (
                      open ? <HiOutlineChevronUp /> : <HiOutlineChevronDown />
                    )}
                  </Collapsible.Context>
                </HStack>
              </Flex>
            </Collapsible.Trigger>
            <Collapsible.Content>
              <Box pt={2} px={1} pb={1}>
                {editing.variables.length === 0 ? (
                  <Box
                    bg="bg.muted"
                    p={3}
                    borderRadius="md"
                    textAlign="center"
                  >
                    <Text fontSize="xs" color="fg.muted" mb={2}>
                      {t('settingPanel.editor.sidebar.noVariables')}
                    </Text>
                    <Button size="xs" variant="outline" colorScheme="blue" onClick={addVariable}>
                      <HiOutlinePlus />
                      {t('settingPanel.editor.addVariable')}
                    </Button>
                  </Box>
                ) : (
                  <VStack align="stretch" gap={2}>
                    {editing.variables.map((variable, index) => {
                      const isEmpty = !variable.key.trim()
                      return (
                        <HStack 
                          key={index} 
                          gap={2}
                          opacity={isEmpty ? 0.6 : 1}
                          transition="opacity 0.2s"
                        >
                          <Input
                            value={variable.key}
                            onChange={(e) =>
                              handleVariableUpdate(index, { ...variable, key: e.target.value })
                            }
                            placeholder={t('settingPanel.editor.placeholders.variableKey')}
                            size="xs"
                            flex={1}
                            // 修复：只在非激活状态下显示橙色边框
                            _focus={{
                              borderColor: 'blue.500',
                              boxShadow: '0 0 0 1px var(--chakra-colors-blue-500)'
                            }}
                            {...(isEmpty && {
                              borderColor: 'orange.300'
                            })}
                          />
                          <Input
                            value={variable.defaultValue || ''}
                            onChange={(e) =>
                              handleVariableUpdate(index, { ...variable, defaultValue: e.target.value })
                            }
                            placeholder={t('settingPanel.editor.placeholders.variableDefault')}
                            size="xs"
                            flex={1}
                          />
                          <IconButton
                            aria-label={t('settingPanel.editor.aria.removeVariable')}
                            size="xs"
                            variant="ghost"
                            colorPalette="red"
                            onClick={() => removeVariable(index)}
                          >
                            <HiOutlineTrash />
                          </IconButton>
                        </HStack>
                      )
                    })}
                  </VStack>
                )}
              </Box>
            </Collapsible.Content>
          </Collapsible.Root>
        </VStack>
      </Box>
    </HStack>

    {/* Footer - Fixed at Bottom */}
    <Box
      borderTop="1px solid"
      borderColor="border.muted"
      pt={4}
      flexShrink={0}
    >
      <HStack justify="flex-end">
        <Button variant="outline" onClick={handleCancel} size="sm">
          {t('settingPanel.editor.footer.cancel')}
        </Button>
        <Button colorScheme="blue" onClick={handleSave} loading={saving} size="sm">
          {t('settingPanel.editor.footer.save')}
        </Button>
      </HStack>
    </Box>

  </VStack>
  )
}


