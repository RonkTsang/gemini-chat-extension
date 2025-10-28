/**
 * Confirm New Chat Dialog
 * 当检测到聊天历史时，询问用户是继续当前聊天还是创建新聊天
 */

import React from 'react'
import {
  Box,
  Button,
  Dialog,
  Portal,
  Text,
  VStack
} from '@chakra-ui/react'
import { HiOutlineArrowRight, HiOutlinePlusCircle } from 'react-icons/hi'

interface ConfirmNewChatDialogProps {
  open: boolean
  onClose: () => void
  onContinue: () => void
  onNewChat: () => void
  messageCount?: number
}

export const ConfirmNewChatDialog: React.FC<ConfirmNewChatDialogProps> = ({
  open,
  onClose,
  onContinue,
  onNewChat,
  messageCount = 0
}) => {
  return (
    <Dialog.Root 
      open={open} 
      onOpenChange={(e) => !e.open && onClose()}
      size="md"
    >
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content>
            <Dialog.Header>
              <Dialog.Title>Chat History Detected</Dialog.Title>
            </Dialog.Header>
            <Dialog.CloseTrigger />

            <Dialog.Body>
              <VStack align="stretch" gap={4}>
                <Box>
                  <Text mb={2}>
                    The current Gemini chat already has{' '}
                    <Text as="span" fontWeight="bold" color="blue.fg">
                      {messageCount} message{messageCount !== 1 ? 's' : ''}
                    </Text>
                    .
                  </Text>
                  <Text color="fg.muted" fontSize="sm">
                    Would you like to:
                  </Text>
                </Box>
                
                <VStack align="stretch" gap={2}>
                  <Button
                    onClick={onContinue}
                    variant="outline"
                    width="100%"
                    justifyContent="flex-start"
                    size="md"
                  >
                    <HiOutlineArrowRight />
                    Continue in current chat
                  </Button>
                  <Button
                    onClick={onNewChat}
                    colorPalette="blue"
                    width="100%"
                    justifyContent="flex-start"
                    size="md"
                  >
                    <HiOutlinePlusCircle />
                    Create new chat and continue
                  </Button>
                </VStack>
              </VStack>
            </Dialog.Body>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  )
}

