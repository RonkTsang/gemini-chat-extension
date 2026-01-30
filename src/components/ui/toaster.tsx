"use client"

import {
  Toaster as ChakraToaster,
  Portal,
  Spinner,
  Stack,
  Toast,
  createToaster,
  HStack,
  Box,
} from "@chakra-ui/react"

export const toaster = createToaster({
  placement: "bottom-end",
  pauseOnPageIdle: true,
})

export const Toaster = () => {
  return (
    <Portal>
      <ChakraToaster toaster={toaster} insetInline={{ mdDown: "4" }}>
        {(toast) => (
          <Toast.Root width={{ md: "sm" }} flexDirection="column" alignItems="stretch">
            <HStack gap="3" width="100%">
              {toast.type === "loading" ? (
                <Spinner size="sm" color="blue.solid" />
              ) : (
                <Toast.Indicator />
              )}
              <Stack gap="1" flex="1" maxWidth="100%">
                {toast.title && <Toast.Title>{toast.title}</Toast.Title>}
                {toast.description && (
                  <Toast.Description>{toast.description}</Toast.Description>
                )}
              </Stack>
              {toast.closable && <Toast.CloseTrigger />}
            </HStack>
            {toast.action && (
              <Box pt="2" width="100%" display="flex" justifyContent="flex-end">
                <Toast.ActionTrigger>{toast.action.label}</Toast.ActionTrigger>
              </Box>
            )}
          </Toast.Root>
        )}
      </ChakraToaster>
    </Portal>
  )
}
