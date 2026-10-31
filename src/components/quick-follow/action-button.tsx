import { Button, Icon, Text, type ButtonProps } from '@chakra-ui/react'
import * as React from 'react'

import { Tooltip, type TooltipProps } from '@/components/ui/tooltip'

export interface ActionButtonProps extends Omit<ButtonProps, 'onClick' | 'children'> {
  icon: React.ReactNode
  label?: React.ReactNode
  tooltip?: React.ReactNode
  tooltipPositioning?: TooltipProps['positioning']
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void
  boxProps?: ButtonProps
}

/** A real Chakra button so it can safely serve as a Popover/Tooltip trigger. */
export const ActionButton = React.forwardRef<HTMLButtonElement, ActionButtonProps>(
  function ActionButton(
    { icon, label, tooltip, tooltipPositioning, onClick, boxProps, ...buttonProps },
    ref
  ) {
    const buttonContent = (
      <Button
        ref={ref}
        type="button"
        // Capsule segments use their own hover surface, without the button recipe's rounded corners or sizing.
        unstyled
        bg="transparent"
        borderRadius={0}
        focusVisibleRing="inside"
        height="100%"
        minW={label ? undefined : '40px'}
        display="flex"
        alignItems="center"
        justifyContent="center"
        transition="background-color 0.2s"
        _hover={{ bg: 'tocHoverBg' }}
        cursor="pointer"
        padding="0 12px"
        gap={2}
        onClick={onClick}
        {...buttonProps}
        {...boxProps}
      >
        <Icon fontSize="md" color="tocText" aria-hidden="true">{icon}</Icon>
        {label && <Text as="span" width="max-content" fontSize="14px" color="tocText">{label}</Text>}
      </Button>
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
