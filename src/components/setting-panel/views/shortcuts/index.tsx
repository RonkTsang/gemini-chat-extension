import { useEffect, useMemo, useRef, useState } from 'react'
import { Box, Container, HStack, IconButton, Input, Kbd, Stack, Table, Text } from '@chakra-ui/react'
import { useRecordHotkeys } from 'react-hotkeys-hook'
import { HiOutlinePencil, HiOutlineTrash } from 'react-icons/hi'
import { t } from '@/utils/i18n'
import { useShortcutSettings } from '@/hooks/useShortcutSettings'
import {
  shortcutDefinitionsByCategory,
  type ShortcutAction,
} from '@/services/shortcuts/definitions'
import { createShortcutString, formatShortcut } from '@/services/shortcuts/format'
import {
  shortcutRecordingBlacklist,
  type ShortcutValidationReason,
  validateRecordedShortcut,
} from '@/services/shortcuts/validation'
import { useShortcutRecordingStore } from '@/stores/shortcutRecordingStore'

interface ShortcutError {
  reason: ShortcutValidationReason
  conflictAction?: ShortcutAction
}

const SHORTCUT_RECORDING_FINALIZE_DELAY_MS = 80
const SHORTCUT_MODIFIER_ONLY_FINALIZE_DELAY_MS = 1000
const RECORDED_MODIFIER_KEYS = new Set(['alt', 'ctrl', 'control', 'meta', 'shift'])
const RECORDED_KEY_ALIASES: Record<string, string> = {
  shiftleft: 'shift',
  shiftright: 'shift',
  altleft: 'alt',
  altright: 'alt',
  metaleft: 'meta',
  metaright: 'meta',
  osleft: 'meta',
  osright: 'meta',
  controlleft: 'ctrl',
  controlright: 'ctrl',
}

export function ShortcutSettingsView() {
  const { settings, updateBinding } = useShortcutSettings()
  const setGlobalRecording = useShortcutRecordingStore((state) => state.setRecording)
  const [activeAction, setActiveAction] = useState<ShortcutAction | null>(null)
  const [hoveredAction, setHoveredAction] = useState<ShortcutAction | null>(null)
  const [errors, setErrors] = useState<Partial<Record<ShortcutAction, ShortcutError>>>({})
  const inputRefs = useRef<Partial<Record<ShortcutAction, HTMLInputElement | null>>>({})
  const recordedKeysRef = useRef<Set<string>>(new Set())
  const capturedKeysRef = useRef<Set<string>>(new Set())
  const finalizeTimerRef = useRef<number | null>(null)
  const [capturedKeys, setCapturedKeys] = useState<Set<string>>(new Set())
  const [recordedKeys, recorder] = useRecordHotkeys(false, shortcutRecordingBlacklist)

  useEffect(() => {
    recordedKeysRef.current = recordedKeys
  }, [recordedKeys])

  useEffect(() => {
    capturedKeysRef.current = capturedKeys
  }, [capturedKeys])

  useEffect(() => () => {
    clearFinalizeTimer()
  }, [])

  useEffect(() => {
    setGlobalRecording(recorder.isRecording)
    return () => setGlobalRecording(false)
  }, [recorder.isRecording, setGlobalRecording])

  useEffect(() => {
    if (!activeAction || !recorder.isRecording) {
      return
    }

    const handleDocumentKeyDownCapture = (event: KeyboardEvent) => {
      const normalizedKey = normalizeRecordedKeyFromCode(event.code)

      console.log('[Shortcut] document capture keydown', {
        action: activeAction,
        key: event.key,
        code: event.code,
        normalizedKey,
        altKey: event.altKey,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey,
        isComposing: event.isComposing,
        repeat: event.repeat,
      })

      if (!normalizedKey || isBlacklistedKey(event)) {
        return
      }

      setCapturedKeys((current) => {
        const next = new Set(current)
        next.add(normalizedKey)
        capturedKeysRef.current = next
        return next
      })
    }

    document.addEventListener('keydown', handleDocumentKeyDownCapture, true)

    window.setTimeout(() => {
      inputRefs.current[activeAction]?.focus()
    }, 0)

    return () => {
      document.removeEventListener('keydown', handleDocumentKeyDownCapture, true)
    }
  }, [activeAction, recorder.isRecording])

  useEffect(() => {
    if (
      !activeAction
      || !recorder.isRecording
      || !hasCompleteRecordedShortcut(getMergedRecordedKeys(recordedKeys, capturedKeys))
    ) {
      return
    }

    scheduleStopRecording(activeAction, SHORTCUT_RECORDING_FINALIZE_DELAY_MS)
  }, [activeAction, capturedKeys, recordedKeys, recorder.isRecording])

  const recordedShortcut = useMemo(
    () => createShortcutString(getMergedRecordedKeys(recordedKeys, capturedKeys)),
    [capturedKeys, recordedKeys],
  )

  const clearFinalizeTimer = () => {
    if (finalizeTimerRef.current === null) {
      return
    }

    window.clearTimeout(finalizeTimerRef.current)
    finalizeTimerRef.current = null
  }

  const clearError = (action: ShortcutAction) => {
    setErrors((current) => {
      const next = { ...current }
      delete next[action]
      return next
    })
  }

  const startRecording = (action: ShortcutAction) => {
    clearFinalizeTimer()
    clearError(action)
    setActiveAction(action)
    setGlobalRecording(true)
    recorder.resetKeys()
    capturedKeysRef.current = new Set()
    setCapturedKeys(new Set())
    recorder.start()
  }

  const scheduleStopRecording = (action: ShortcutAction, delay: number) => {
    clearFinalizeTimer()
    finalizeTimerRef.current = window.setTimeout(() => {
      finalizeTimerRef.current = null
      void stopRecording(action)
    }, delay)
  }

  const requestStopRecording = (action: ShortcutAction) => {
    const keys = getMergedRecordedKeys(recordedKeysRef.current, capturedKeysRef.current)
    const delay = hasOnlyModifierKeys(keys)
      ? SHORTCUT_MODIFIER_ONLY_FINALIZE_DELAY_MS
      : SHORTCUT_RECORDING_FINALIZE_DELAY_MS
    scheduleStopRecording(action, delay)
  }

  const stopRecording = async (action: ShortcutAction) => {
    const keys = getMergedRecordedKeys(recordedKeysRef.current, capturedKeysRef.current)
    recorder.stop()
    setGlobalRecording(false)
    setActiveAction(null)

    console.log('[Shortcut] stopRecording keys', {
      action,
      hookKeys: Array.from(recordedKeysRef.current),
      capturedKeys: Array.from(capturedKeysRef.current),
      mergedKeys: Array.from(keys),
      shortcut: createShortcutString(keys),
      size: keys.size,
    })

    if (keys.size === 0) {
      return
    }

    const result = validateRecordedShortcut(keys, action, settings.bindings)
    console.log('[Shortcut] validation result', {
      action,
      result,
    })
    recorder.resetKeys()
    capturedKeysRef.current = new Set()
    setCapturedKeys(new Set())

    if (!result.ok) {
      setErrors((current) => ({
        ...current,
        [action]: {
          reason: result.reason,
          conflictAction: result.conflictAction,
        },
      }))
      return
    }

    clearError(action)
    await updateBinding(action, result.shortcut)
  }

  const clearBinding = async (action: ShortcutAction) => {
    clearFinalizeTimer()
    clearError(action)
    if (activeAction === action) {
      recorder.stop()
      setGlobalRecording(false)
      recorder.resetKeys()
      capturedKeysRef.current = new Set()
      setCapturedKeys(new Set())
      setActiveAction(null)
    }
    await updateBinding(action, null)
  }

  return (
    <Box
      position="relative"
      height="100%"
      display="flex"
      flexDirection="column"
      data-view="shortcut-settings"
    >
      <Box flex="1" overflow="auto">
        <Container display="flex" justifyContent="center">
          <Stack direction="column" maxWidth="600px" width="100%" align="stretch" gap={6}>
            {shortcutDefinitionsByCategory.map((category) => {
              const categoryHeadingId = `shortcut-category-${category.id}`

              return (
                <Box as="section" key={category.id}>
                  <Text
                    id={categoryHeadingId}
                    mb={2}
                    color="fg.subtle"
                    fontSize="sm"
                    fontWeight="medium"
                  >
                    {t(category.labelKey)}
                  </Text>
                  <Table.Root
                    width="100%"
                    variant="line"
                    mx={-3}
                    aria-labelledby={categoryHeadingId}
                    css={{
                      borderCollapse: 'collapse',
                    }}
                  >
                    <Table.ColumnGroup>
                      <Table.Column width="42%" />
                      <Table.Column />
                    </Table.ColumnGroup>
                    <Table.Body>
                      {category.definitions.map((definition, index) => {
                        const action = definition.action
                        const shortcut = settings.bindings[action]
                        const isRecording = activeAction === action && recorder.isRecording
                        const displayShortcut = isRecording ? recordedShortcut : shortcut
                        const error = errors[action]
                        const isHovered = hoveredAction === action
                        const isLastRow = index === category.definitions.length - 1

                        return (
                          <Table.Row
                            key={action}
                            onMouseEnter={() => setHoveredAction(action)}
                            onMouseLeave={() => setHoveredAction((current) => current === action ? null : current)}
                          >
                            <Table.Cell
                              py={2}
                              px={2}
                              borderBottomWidth={isLastRow ? 0 : '1px'}
                              borderColor="border.muted"
                            >
                              <Text fontSize="sm" fontWeight="normal">
                                {t(definition.labelKey)}
                              </Text>
                            </Table.Cell>
                            <Table.Cell
                              py={2}
                              px={2}
                              borderBottomWidth={isLastRow ? 0 : '1px'}
                              borderColor="border.muted"
                            >
                              <Stack gap={1} width="100%">
                                <HStack width="100%" gap={3}>
                                  <ShortcutField
                                    action={action}
                                    shortcut={displayShortcut}
                                    isRecording={isRecording}
                                    showEdit={isHovered}
                                    inputRef={(node) => {
                                      inputRefs.current[action] = node
                                    }}
                                    onStartRecording={startRecording}
                                    onStopRecording={requestStopRecording}
                                    onInvalidKey={() => {
                                      recorder.resetKeys()
                                      capturedKeysRef.current = new Set()
                                      setCapturedKeys(new Set())
                                      setErrors((current) => ({
                                        ...current,
                                        [action]: { reason: 'specialKey' },
                                      }))
                                    }}
                                    onInput={() => clearError(action)}
                                  />
                                  <Box flex={1} />
                                  <IconButton
                                    aria-label={t('settingPanel.shortcut.clearShortcut')}
                                    variant="ghost"
                                    size="sm"
                                    disabled={!shortcut && !isRecording && !error}
                                    onMouseDown={(event) => event.preventDefault()}
                                    onClick={() => void clearBinding(action)}
                                  >
                                    <HiOutlineTrash />
                                  </IconButton>
                                </HStack>
                                {error ? (
                                  <Text fontSize="xs" color="fg.error">
                                    {getShortcutErrorText(error)}
                                  </Text>
                                ) : null}
                              </Stack>
                            </Table.Cell>
                          </Table.Row>
                        )
                      })}
                    </Table.Body>
                  </Table.Root>
                </Box>
              )
            })}
          </Stack>
        </Container>
      </Box>
    </Box>
  )
}

ShortcutSettingsView.displayName = 'ShortcutSettingsView'

interface ShortcutFieldProps {
  action: ShortcutAction
  shortcut: string | null
  isRecording: boolean
  showEdit: boolean
  inputRef: (node: HTMLInputElement | null) => void
  onStartRecording: (action: ShortcutAction) => void
  onStopRecording: (action: ShortcutAction) => void
  onInvalidKey: () => void
  onInput: () => void
}

function ShortcutField({
  action,
  shortcut,
  isRecording,
  showEdit,
  inputRef,
  onStartRecording,
  onStopRecording,
  onInvalidKey,
  onInput,
}: ShortcutFieldProps) {
  return (
    <HStack minWidth={0} gap={2} minH="6">
      {isRecording ? (
        <Input
          ref={inputRef}
          readOnly
          value={shortcut ? formatShortcut(shortcut).text : ''}
          placeholder={t('settingPanel.shortcut.recording')}
          size="sm"
          width="220px"
          onFocus={() => {
            if (!isRecording) {
              onStartRecording(action)
            }
          }}
          onBlur={() => onStopRecording(action)}
          onKeyDown={(event) => {
            console.log('[Shortcut] input keydown', {
              action,
              key: event.key,
              code: event.code,
              altKey: event.altKey,
              ctrlKey: event.ctrlKey,
              metaKey: event.metaKey,
              shiftKey: event.shiftKey,
              isComposing: event.nativeEvent.isComposing,
              repeat: event.repeat,
            })
            onInput()
            if (isBlacklistedKey(event)) {
              event.preventDefault()
              event.stopPropagation()
              onInvalidKey()
            }
          }}
        />
      ) : !shortcut ? (
        <Text as="span" fontSize="sm" color="fg.muted" lineHeight="normal">
          {t('settingPanel.shortcut.unassigned')}
        </Text>
      ) : (
        <ShortcutKbd shortcut={shortcut} />
      )}
      <IconButton
        aria-label={t('settingPanel.shortcut.editShortcut')}
        variant="ghost"
        size="xs"
        flexShrink={0}
        opacity={showEdit && !isRecording ? 1 : 0}
        disabled={isRecording}
        _focusVisible={{ opacity: 1 }}
        onClick={() => onStartRecording(action)}
      >
        <HiOutlinePencil />
      </IconButton>
    </HStack>
  )
}

function ShortcutKbd({ shortcut }: { shortcut: string }) {
  const formattedShortcut = formatShortcut(shortcut)

  return (
    <HStack gap={1} minWidth={0}>
      {formattedShortcut.tokens.map((token, index) => (
        <Kbd key={`${token}-${index}`} size="sm">
          {token}
        </Kbd>
      ))}
    </HStack>
  )
}

function getShortcutErrorText(error: ShortcutError): string {
  if (error.reason === 'conflict') {
    const conflictDefinition = shortcutDefinitionsByCategory
      .flatMap((category) => category.definitions)
      .find((definition) => definition.action === error.conflictAction)
    return t('settingPanel.shortcut.errors.conflict', conflictDefinition ? t(conflictDefinition.labelKey) : '')
  }

  return t(`settingPanel.shortcut.errors.${error.reason}`)
}

function isBlacklistedKey(event: Pick<KeyboardEvent, 'key' | 'code'>): boolean {
  const key = event.key.toLowerCase()
  const code = event.code.toLowerCase()

  return shortcutRecordingBlacklist.includes(key)
    || shortcutRecordingBlacklist.includes(code)
    || shortcutRecordingBlacklist.includes(code.replace(/^(key|digit|numpad)/, ''))
}

function hasOnlyModifierKeys(keys: Set<string>): boolean {
  return keys.size > 0 && Array.from(keys).every((key) => RECORDED_MODIFIER_KEYS.has(key))
}

function hasCompleteRecordedShortcut(keys: Set<string>): boolean {
  let hasModifier = false
  let hasPrimaryKey = false

  for (const key of keys) {
    if (RECORDED_MODIFIER_KEYS.has(key)) {
      hasModifier = true
    } else {
      hasPrimaryKey = true
    }
  }

  return hasModifier && hasPrimaryKey
}

function getMergedRecordedKeys(first: Set<string>, second: Set<string>): Set<string> {
  return new Set([...first, ...second])
}

function normalizeRecordedKeyFromCode(code: string): string | null {
  if (!code) {
    return null
  }

  const normalizedCode = code.trim().toLowerCase()
  return RECORDED_KEY_ALIASES[normalizedCode] ?? normalizedCode.replace(/key|digit|numpad/, '')
}
