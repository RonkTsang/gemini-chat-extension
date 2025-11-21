import { Box, Icon, Text } from '@chakra-ui/react'
import * as React from 'react'

import { Tooltip, type TooltipProps } from '@/components/ui/tooltip'

export interface ActionButtonProps {
  icon: React.ReactNode
  label?: React.ReactNode
  tooltip?: React.ReactNode
  tooltipPositioning?: TooltipProps['positioning']
  onClick?: (event?: React.MouseEvent<HTMLDivElement>) => void
  boxProps?: React.ComponentProps<typeof Box>
}

export const ActionButton = React.forwardRef<HTMLDivElement, ActionButtonProps>(
  function ActionButton(
    { icon, label, tooltip, tooltipPositioning, onClick, boxProps },
    ref
  ) {
    const { onKeyDown, ...restBoxProps } = boxProps ?? {}

    const handleKeyDown: React.KeyboardEventHandler<HTMLDivElement> = event => {
      onKeyDown?.(event)
      if (event.defaultPrevented) {
        return
      }
      if (!onClick) {
        return
      }
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        onClick()
      }
    }

    const buttonContent = (
      <Box
        ref={ref}
        height="100%"
        display="flex"
        alignItems="center"
        transition="background-color 0.2s"
        _hover={{ bg: 'tocHoverBg' }}
        cursor="pointer"
        padding="0 12px"
        gap={2}
        onClick={(event) => {
          onClick?.(event)
          return event
        }}
        onKeyDown={handleKeyDown}
        role="button"
        tabIndex={0}
        {...restBoxProps}
      >
        <Icon fontSize="md" color="tocText">
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

