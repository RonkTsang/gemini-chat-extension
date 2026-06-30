import { Button } from '@chakra-ui/react'
import { useState, type ComponentProps, type ReactNode } from 'react'

type ButtonProps = ComponentProps<typeof Button>

interface NotificationTestButtonProps extends Omit<ButtonProps, 'children' | 'disabled' | 'onClick'> {
  canSendTest: boolean
  children: ReactNode
  disabled?: boolean
  sendTestNotification: () => Promise<void>
}

export function NotificationTestButton({
  canSendTest,
  children,
  disabled = false,
  sendTestNotification,
  ...buttonProps
}: NotificationTestButtonProps) {
  const [isSending, setIsSending] = useState(false)
  const isDisabled = disabled || !canSendTest || isSending

  const handleClick = async () => {
    if (isDisabled) {
      return
    }

    setIsSending(true)
    try {
      await sendTestNotification()
    } finally {
      setIsSending(false)
    }
  }

  return (
    <Button
      {...buttonProps}
      disabled={isDisabled}
      onClick={() => void handleClick()}
    >
      {children}
    </Button>
  )
}

NotificationTestButton.displayName = 'NotificationTestButton'
