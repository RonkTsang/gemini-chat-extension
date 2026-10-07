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
  type ToasterProps,
} from "@chakra-ui/react"

export const toaster = createToaster({
  placement: "bottom-end",
  pauseOnPageIdle: true,
})

interface Props {
  store?: ReturnType<typeof createToaster>
  viewportProps?: Omit<ToasterProps, "children" | "toaster">
}

export const Toaster = ({ store = toaster, viewportProps }: Props = {}) => {
  return (
    <Portal>
      <ChakraToaster toaster={store} insetInline={{ mdDown: "4" }} {...viewportProps}>
        {(toast) => (
          <Toast.Root width={{ md: "sm" }} maxWidth="100%" flexDirection="column" alignItems="stretch">
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
              {toast.closable && (
                <Toast.CloseTrigger
                  position="static"
                  flexShrink={0}
                  alignSelf="center"
                  color="inherit"
                  _hover={{ bg: "var(--toast-trigger-bg)" }}
                />
              )}
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
