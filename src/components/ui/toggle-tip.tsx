import { Popover, IconButton, Portal } from "@chakra-ui/react"
import type { ReactNode } from "react"
import { FiInfo } from "react-icons/fi"

export interface ToggleTipProps extends Popover.RootProps {
  content?: ReactNode
}

export const ToggleTip = (props: ToggleTipProps) => {
  const { content, children, ...rest } = props
  return (
    <Popover.Root {...rest}>
      <Popover.Trigger asChild>{children}</Popover.Trigger>
      <Portal>
        <Popover.Positioner>
          <Popover.Content maxWidth="320px">
            <Popover.Arrow />
            <Popover.Body fontSize="sm">{content}</Popover.Body>
          </Popover.Content>
        </Popover.Positioner>
      </Portal>
    </Popover.Root>
  )
}

export const InfoTip = ({ content, ...props }: Omit<ToggleTipProps, "children">) => {
  return (
    <ToggleTip content={content} {...props}>
      <IconButton
        variant="ghost"
        aria-label="info"
        size="xs"
        color="fg.muted"
      >
        <FiInfo />
      </IconButton>
    </ToggleTip>
  )
}
