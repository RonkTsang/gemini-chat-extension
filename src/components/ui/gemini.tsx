import { Button, Dialog } from '@chakra-ui/react'
import type { ComponentProps } from 'react'

export const GEMINI_DIALOG_RADIUS = 'var(--gem-sys-shape--corner-extra-large, 28px)'

export function GeminiDialogContent(props: ComponentProps<typeof Dialog.Content>) {
  return <Dialog.Content {...props} borderRadius={GEMINI_DIALOG_RADIUS} />
}

export function GeminiDialogButton(props: ComponentProps<typeof Button>) {
  return <Button {...props} rounded="full" />
}
