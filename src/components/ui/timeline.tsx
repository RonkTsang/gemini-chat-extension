/**
 * Timeline Component
 * Chakra UI v3 Timeline wrapper
 */

import { Timeline as ChakraTimeline } from '@chakra-ui/react'
import { forwardRef } from 'react'

export interface TimelineRootProps extends ChakraTimeline.RootProps {}
export interface TimelineItemProps extends ChakraTimeline.ItemProps {}
export interface TimelineConnectorProps extends ChakraTimeline.ConnectorProps {}
export interface TimelineSeparatorProps extends ChakraTimeline.SeparatorProps {}
export interface TimelineIndicatorProps extends ChakraTimeline.IndicatorProps {}
export interface TimelineContentProps extends ChakraTimeline.ContentProps {}
export interface TimelineTitleProps extends ChakraTimeline.TitleProps {}
export interface TimelineDescriptionProps extends ChakraTimeline.DescriptionProps {}

export const TimelineRoot = forwardRef<HTMLDivElement, TimelineRootProps>(
  function TimelineRoot(props, ref) {
    return <ChakraTimeline.Root ref={ref} {...props} />
  }
)

export const TimelineItem = forwardRef<HTMLDivElement, TimelineItemProps>(
  function TimelineItem(props, ref) {
    return <ChakraTimeline.Item ref={ref} {...props} />
  }
)

export const TimelineConnector = forwardRef<HTMLDivElement, TimelineConnectorProps>(
  function TimelineConnector(props, ref) {
    return <ChakraTimeline.Connector ref={ref} {...props} />
  }
)

export const TimelineSeparator = forwardRef<HTMLDivElement, TimelineSeparatorProps>(
  function TimelineSeparator(props, ref) {
    return <ChakraTimeline.Separator ref={ref} {...props} />
  }
)

export const TimelineIndicator = forwardRef<HTMLDivElement, TimelineIndicatorProps>(
  function TimelineIndicator(props, ref) {
    return <ChakraTimeline.Indicator ref={ref} {...props} />
  }
)

export const TimelineContent = forwardRef<HTMLDivElement, TimelineContentProps>(
  function TimelineContent(props, ref) {
    return <ChakraTimeline.Content ref={ref} {...props} />
  }
)

export const TimelineTitle = forwardRef<HTMLHeadingElement, TimelineTitleProps>(
  function TimelineTitle(props, ref) {
    return <ChakraTimeline.Title ref={ref} {...props} />
  }
)

export const TimelineDescription = forwardRef<HTMLParagraphElement, TimelineDescriptionProps>(
  function TimelineDescription(props, ref) {
    return <ChakraTimeline.Description ref={ref} {...props} />
  }
)

