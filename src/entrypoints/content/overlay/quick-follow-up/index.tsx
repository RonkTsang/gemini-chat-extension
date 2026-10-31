import { Presence, useDisclosure } from '@chakra-ui/react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import type { QuickFollowPrompt } from '@/domain/quick-follow/types'
import { CAPSULE_BAR_ACTION_BUTTON_WIDTH, CapsuleBar, PROMPT_CONTAINER_MAX_WIDTH } from '@/components/quick-follow/capsule-bar'
import { useQuickFollowStore } from '@/stores/quickFollowStore'
import { i18nCache } from '@/utils/i18nCache'
import { closeActiveFollowUpPopovers } from '../../quick-follow-up/cards'
import QuoteIcon from '~/assets/quote.svg?react'
import { createFollowUpController, type FollowUpUI } from '../../quick-follow-up/controller'
import type { SelectionItem } from '../../quick-follow-up/protocol'
import { QuickComment } from './QuickComment'
import { SelectionMarkers } from './SelectionMarkers'

function QuickFollowUp() {
  const { open, onOpen, onClose } = useDisclosure()
  const [ui, setUI] = useState<FollowUpUI>({ mode: 'closed' })
  const [selections, setSelections] = useState<readonly SelectionItem[]>([])
  const controller = useMemo(() => createFollowUpController(setUI, setSelections), [])
  const { prompts, settings } = useQuickFollowStore()

  useEffect(() => {
    controller.start()
    return () => controller.stop()
  }, [controller])

  useEffect(() => {
    if (ui.mode !== 'closed') closeActiveFollowUpPopovers()
    if (ui.mode === 'capsule') onOpen()
    else onClose()
  }, [ui.mode, onOpen, onClose])

  useEffect(() => {
    if (ui.mode === 'closed') return
    const isOwnedSurface = (event: Event) => event.composedPath().some(node =>
      node instanceof Element && (
        node.hasAttribute('data-quick-follow-comment')
        || node.hasAttribute('data-quick-follow-marker')
        || node.hasAttribute('data-quick-follow-popover')
        || node.getAttribute('data-quick-follow') === 'capsule-root'
      )
    )
    const onPointerDown = (event: PointerEvent) => {
      if (!isOwnedSurface(event)) controller.dismiss()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.composedPath().some(node => node instanceof Element && node.hasAttribute('data-quick-follow-popover'))) {
        controller.dismiss()
      }
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown, true)
    }
  }, [controller, ui.mode])

  const displayPosition = useMemo(() => {
    if (ui.mode !== 'capsule') return null
    const { clientX, clientY } = ui.candidate.position
    const width = Math.min(CAPSULE_BAR_ACTION_BUTTON_WIDTH + PROMPT_CONTAINER_MAX_WIDTH, window.innerWidth - 20)
    const left = Math.max(width / 2 + 10, Math.min(clientX, window.innerWidth - width / 2 - 10))
    const top = clientY < 84 ? clientY + 24 : clientY - 16
    return { top, left, transform: clientY < 84 ? 'translate(-50%, 0)' : 'translate(-50%, -100%)' }
  }, [ui])

  const addPrompt = useCallback((prompt: QuickFollowPrompt) => {
    if (ui.mode !== 'capsule') return
    controller.appendPrompt(prompt, ui.candidate)
  }, [controller, ui])

  const sendPromptSeparately = useCallback((prompt: QuickFollowPrompt) => {
    if (ui.mode !== 'capsule') return
    controller.sendPromptSeparately(prompt, ui.candidate)
  }, [controller, ui])

  const runPromptWithoutCards = useCallback(async (prompt: QuickFollowPrompt) => {
    if (ui.mode !== 'capsule') return
    await controller.runPrompt(prompt, ui.candidate)
  }, [controller, ui])

  const renderCapsule = ui.mode === 'capsule' && displayPosition
    ? (
      <Presence
        present={open}
        lazyMount
        animationName={{ _open: 'slide-from-bottom, fade-in', _closed: 'slide-to-bottom, fade-out' }}
        animationDuration="250ms"
      >
        <div style={{ position: 'fixed', zIndex: 2147483000, ...displayPosition }} data-quick-follow="capsule-root">
          <CapsuleBar
            askLabel={i18nCache.get('askGemini')}
            askIcon={<QuoteIcon />}
            onAsk={() => controller.add(ui.candidate)}
            prompts={prompts}
            orderedIds={settings.orderedIds}
            onRunPrompt={runPromptWithoutCards}
            hasDraftCards={ui.hasDraftCards}
            onAddPromptToDraft={addPrompt}
            onSendPromptSeparately={sendPromptSeparately}
            tooltipPlacement="top"
          />
        </div>
      </Presence>
    )
    : null

  if (ui.mode === 'comment') {
    return (
      <QuickComment
        key={ui.selectionId}
        selectionText={ui.selectionText}
        value={ui.commentDraft}
        position={ui.position}
        sourceAnchor={ui.sourceAnchor}
        onCancel={controller.dismiss}
        onDelete={() => controller.remove(ui.selectionId)}
        onChange={value => controller.changeQuickComment(ui.selectionId, value)}
        onAdd={() => controller.addComment(ui.selectionId)}
        onSend={() => controller.requestSend()}
      />
    )
  }

  return (
    <>
      {selections.length > 0 && <SelectionMarkers
        items={selections}
        disabled={controller.isBusy()}
        onEdit={controller.openQuickComment}
        onPreview={controller.previewSelectionSource}
      />}
      {renderCapsule}
    </>
  )
}

export default QuickFollowUp
