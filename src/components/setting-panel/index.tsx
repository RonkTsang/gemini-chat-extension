import React, { useState, useEffect, useRef } from "react"
import { CloseButton, Dialog, Portal, Flex, Box } from "@chakra-ui/react"
import { useUpdateEffect } from "ahooks"
import { useEvent, useEventEmitter } from "../../hooks/useEventBus"
import { Sidebar } from "./Sidebar"
import { ContentArea } from "./ContentArea"
import { registerDefaultViews } from "./views"
import { setActiveSection } from "../../stores/settingStore"
import type { AppEvents } from "@/common/event"

import { browser } from 'wxt/browser'
import { eventBus } from '@/utils/eventbus'
import { isSettingsOpenPanelMessage, type SettingsPanelResult } from '@/types/runtime-messages'

registerDefaultViews()

export const SettingPanel = () => {
  const [open, setOpen] = useState(false)
  const { emit } = useEventEmitter()
  const openRef = useRef(open)
  const pendingReply = useRef<{ reply: (result: SettingsPanelResult) => void; expiresAt: number; timer: ReturnType<typeof setTimeout> } | undefined>(undefined)

  useEvent('settings:open', (data: AppEvents['settings:open']) => {
    setOpen(data.open)

    // If data.module has a value, set settingPanel to the corresponding NavigationSection
    if (data.module) {
      setActiveSection(data.module)
    }
  })

  useEvent('settings:close', () => {
    setOpen(false)
  })

  // Register after the settings:open subscription; acknowledge only committed state.
  useEffect(() => {
    const settle = (opened: boolean) => {
      const pending = pendingReply.current
      pendingReply.current = undefined
      if (!pending) return
      clearTimeout(pending.timer)
      pending.reply({ opened: opened && Date.now() < pending.expiresAt })
    }
    const listener: Parameters<typeof browser.runtime.onMessage.addListener>[0] = (message, sender, sendResponse) => {
      if (!isSettingsOpenPanelMessage(message) || sender.id !== browser.runtime.id) return
      if (Date.now() >= message.expiresAt) {
        sendResponse({ opened: false })
        return
      }
      if (openRef.current) {
        sendResponse({ opened: true })
        return
      }
      settle(false)
      pendingReply.current = {
        reply: sendResponse, expiresAt: message.expiresAt,
        timer: setTimeout(() => settle(false), Math.min(10_000, message.expiresAt - Date.now())),
      }
      eventBus.emitSync('settings:open', { from: 'popup', open: true, module: 'enhancements' })
      return true
    }
    browser.runtime.onMessage.addListener(listener)
    return () => {
      browser.runtime.onMessage.removeListener(listener)
      settle(false)
    }
  }, [])

  useEffect(() => {
    openRef.current = open
    const pending = pendingReply.current
    if (!open || !pending) return
    pendingReply.current = undefined
    clearTimeout(pending.timer)
    pending.reply({ opened: Date.now() < pending.expiresAt })
  }, [open])

  // Emit state change event when open state changes
  useUpdateEffect(() => {
    emit('settings:state-changed', { open })
  }, [open])

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(e) => setOpen(e.open)}
      closeOnInteractOutside={false}  // Prevent accidental closing
      closeOnEscape={true}            // Keep ESC key to close
      size={{
        mdDown: "cover",
        md: "cover"
      }}

    >
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner alignItems="center" justifyContent="center">
          <Dialog.Content
            maxWidth="1200px"
            height="90vh"
            maxHeight="860px"
            borderRadius="lg"
            overflow="hidden"
            bg="gemSurface"
            borderWidth="1px"
            borderColor="border.muted"
          >
            <Dialog.Header
              position="relative"
              p={0}
            >
              <Box
                position="absolute"
                top={2}
                right={2}
                zIndex={10}
              >
                <Dialog.CloseTrigger asChild>
                  <CloseButton size="sm" />
                </Dialog.CloseTrigger>
              </Box>
            </Dialog.Header>

            <Dialog.Body p={0} height="100%">
              <Flex height="100%">
                <Sidebar />
                <ContentArea />
              </Flex>
            </Dialog.Body>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  )
}