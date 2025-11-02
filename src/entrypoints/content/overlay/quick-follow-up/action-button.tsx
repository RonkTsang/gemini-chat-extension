import { Box, Text, Icon } from "@chakra-ui/react"
import * as React from "react"
import { Tooltip, type TooltipProps } from "@/components/ui/tooltip"

export interface ActionButtonProps {
  /** Icon component to display */
  icon: React.ReactNode
  /** Optional button text */
  label?: React.ReactNode
  /** Optional tooltip content */
  tooltip?: React.ReactNode
  /** Optional tooltip positioning props */
  tooltipPositioning?: TooltipProps["positioning"]
  /** Click handler */
  onClick?: () => void
  /** Additional Box props */
  boxProps?: React.ComponentProps<typeof Box>
}

export const ActionButton = React.forwardRef<HTMLDivElement, ActionButtonProps>(
  function ActionButton(
    { icon, label, tooltip, tooltipPositioning, onClick, boxProps },
    ref
  ) {
    const buttonContent = (
      <Box
        ref={ref}
        height="100%"
        display="flex"
        alignItems="center"
        transition="background-color 0.2s"
        _hover={{ bg: "tocHoverBg" }}
        cursor="pointer"
        padding="0 12px"
        gap={2}
        onClick={onClick}
        {...boxProps}
      >
        <Icon size="md" color="tocText">
          {icon}
        </Icon>
        {label && (
          <Text width="max-content" fontSize="14px" color="tocText">
            {label}
          </Text>
        )}
      </Box>
    )

    if (tooltip) {
      return (
        <Tooltip content={tooltip} positioning={tooltipPositioning}>
          {buttonContent}
        </Tooltip>
      )
    }

    return buttonContent
  }
)

