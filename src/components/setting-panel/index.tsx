import React, { useState } from "react"
import { CloseButton, Dialog, Portal, Flex, Box } from "@chakra-ui/react"
import { useEvent } from "../../hooks/useEventBus"
import { useColorModeValue } from "../ui/color-mode"
import { Sidebar } from "./Sidebar"
import { ContentArea } from "./ContentArea"
import { registerDefaultViews } from "./views"
import { setActiveSection } from "../../stores/settingStore"
import type { AppEvents } from "@/common/event"

registerDefaultViews()

export const SettingPanel = () => {
  const [open, setOpen] = useState(false)

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
        <Dialog.Positioner>
          <Dialog.Content 
            maxWidth="1200px" 
            height="90vh"
            borderRadius="lg"
            overflow="hidden"
            bg="gemSurface"
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