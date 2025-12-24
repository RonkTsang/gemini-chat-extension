/**
 * Progress Circle Component
 * Chakra UI v3 ProgressCircle wrapper
 */

import { ProgressCircle as ChakraProgressCircle } from '@chakra-ui/react'
import { forwardRef } from 'react'

export interface ProgressCircleRootProps extends ChakraProgressCircle.RootProps {}
export interface ProgressCircleRingProps extends ChakraProgressCircle.CircleProps {}
export interface ProgressCircleValueTextProps extends ChakraProgressCircle.ValueTextProps {}

export const ProgressCircleRoot = forwardRef<HTMLDivElement, ProgressCircleRootProps>(
  function ProgressCircleRoot(props, ref) {
    return <ChakraProgressCircle.Root ref={ref} {...props} />
  }
)

export const ProgressCircleRing = forwardRef<SVGSVGElement, ProgressCircleRingProps>(
  function ProgressCircleRing(props, ref) {
    return <ChakraProgressCircle.Circle ref={ref} {...props} />
  }
)

export const ProgressCircleValueText = forwardRef<HTMLDivElement, ProgressCircleValueTextProps>(
  function ProgressCircleValueText(props, ref) {
    return <ChakraProgressCircle.ValueText ref={ref} {...props} />
  }
)

