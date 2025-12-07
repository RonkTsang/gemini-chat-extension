import { Box, type BoxProps } from '@chakra-ui/react'
import { forwardRef } from 'react'

export interface DragExcludedProps extends BoxProps {
  children: React.ReactNode
}

/**
 * Wrapper that prevents drag events from bubbling to parent sortable containers.
 * Use this to wrap interactive elements (inputs, buttons, etc.) inside sortable items.
 */
export const DragExcluded = forwardRef<HTMLDivElement, DragExcludedProps>(
  ({ children, ...props }, ref) => {
    return (
      <Box
        ref={ref}
        onPointerDown={(e) => e.stopPropagation()}
        {...props}
      >
        {children}
      </Box>
    )
  }
)

DragExcluded.displayName = 'DragExcluded'

