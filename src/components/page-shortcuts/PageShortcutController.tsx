import { useEffect, useRef, type MutableRefObject } from 'react'
import { useHotkeys } from 'react-hotkeys-hook'
import { eventBus } from '@/utils/eventbus'
import {
  openGems,
  openLibrary,
  openNewChat,
  openTemporaryChatByClick,
  toggleSidebar,
} from '@/utils/chatActions'
import { cycleGeminiModel } from '@/utils/cycleModel'
import { toggleBulkDeleteMode } from '@/entrypoints/content/bulk-delete'
import { focusContentEditor } from '@/utils/editorUtils'
import { launchGeminiTool, openUploadFilesDialog } from '@/utils/toolboxActions'
import { toggleSpeechDictation } from '@/utils/dictationActions'
import { useShortcutSettings } from '@/hooks/useShortcutSettings'
import {
  shortcutDefinitions,
  type ShortcutAction,
  type ShortcutDefinition,
} from '@/services/shortcuts/definitions'
import { useShortcutRecordingStore } from '@/stores/shortcutRecordingStore'

const HOTKEY_DELIMITER = '|'

interface ShortcutRegistrationProps {
  definition: ShortcutDefinition
  shortcut: string
  settingsOpenRef: MutableRefObject<boolean>
}

export function PageShortcutController() {
  const { settings, isLoading } = useShortcutSettings()
  const isRecording = useShortcutRecordingStore((state) => state.isRecording)
  const settingsOpenRef = useRef(false)

  useEffect(() => {
    return eventBus.on('settings:state-changed', ({ open }) => {
      settingsOpenRef.current = open
    })
  }, [])

  if (isLoading || !settings.enabled || isRecording) {
    return null
  }

  return (
    <>
      {shortcutDefinitions.map((definition) => {
        const shortcut = settings.bindings[definition.action]
        if (!shortcut) {
          return null
        }

        return (
          <ShortcutRegistration
            key={definition.action}
            definition={definition}
            shortcut={shortcut}
            settingsOpenRef={settingsOpenRef}
          />
        )
      })}
    </>
  )
}

function ShortcutRegistration({
  definition,
  shortcut,
  settingsOpenRef,
}: ShortcutRegistrationProps) {
  const { action, enableOnContentEditable, enableOnFormTags, ignoreEventWhen } = definition

  useHotkeys(
    [shortcut],
    (event) => {
      if (useShortcutRecordingStore.getState().isRecording) {
        console.log('[Shortcut] page shortcut ignored while recording', {
          action,
          shortcut,
        })
        return
      }

      event.preventDefault()
      event.stopPropagation()
      void runShortcutAction(action, settingsOpenRef)
    },
    {
      delimiter: HOTKEY_DELIMITER,
      enabled: Boolean(shortcut),
      enableOnFormTags,
      enableOnContentEditable,
      ignoreEventWhen,
      eventListenerOptions: { capture: true },
      preventDefault: true,
    },
    [action, shortcut, settingsOpenRef],
  )

  return null
}

async function runShortcutAction(
  action: ShortcutAction,
  settingsOpenRef: MutableRefObject<boolean>,
): Promise<void> {
  if (useShortcutRecordingStore.getState().isRecording) {
    return
  }

  if (action === 'openSettings') {
    if (settingsOpenRef.current) {
      settingsOpenRef.current = false
      eventBus.emitSync('settings:close', {
        from: 'shortcut',
        reason: 'shortcut-toggle',
      })
      return
    }

    settingsOpenRef.current = true
    eventBus.emitSync('settings:open', {
      from: 'shortcut',
      open: true,
      module: 'shortcuts',
    })
    return
  }

  if (action === 'toggleBulkDelete') {
    toggleBulkDeleteMode()
    return
  }

  if (action === 'openNewChat') {
    await openNewChat()
    return
  }

  if (action === 'openTemporaryChat') {
    await openTemporaryChatByClick()
    return
  }

  if (action === 'openLibrary') {
    openLibrary()
    return
  }

  if (action === 'openGems') {
    openGems()
    return
  }

  if (action === 'focusInput') {
    focusContentEditor()
    return
  }

  if (action === 'toggleSpeechDictation') {
    toggleSpeechDictation()
    return
  }

  if (action === 'toggleSidebar') {
    toggleSidebar()
    return
  }

  if (action === 'cycleModel') {
    await cycleGeminiModel()
    return
  }

  if (action === 'uploadFiles') {
    await openUploadFilesDialog()
    return
  }

  if (action === 'createImage') {
    await launchGeminiTool('image')
    return
  }

  if (action === 'createVideo') {
    await launchGeminiTool('video')
    return
  }

  if (action === 'createMusic') {
    await launchGeminiTool('music')
    return
  }

  if (action === 'openCanvas') {
    await launchGeminiTool('canvas')
    return
  }

  if (action === 'openDeepResearch') {
    await launchGeminiTool('deepResearch')
  }
}
