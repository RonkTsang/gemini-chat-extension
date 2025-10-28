import React from 'react'
import { Box, Heading, Text, VStack, HStack, IconButton } from '@chakra-ui/react'
import { HiOutlineChevronLeft } from 'react-icons/hi'
import useSettingStore from '../../stores/settingStore'
import { getSectionDefinition, getViewDefinition, type NavigationSection } from './config'
import type { SettingViewComponentProps } from './types'

interface SettingSectionContainerProps extends SettingViewComponentProps<NavigationSection> {
  children: React.ReactNode
}

const SettingSectionContainer: React.FC<SettingSectionContainerProps> = ({ section, view, goBack, children }) => {
  const showBack = view.id !== 'index'
  const title = view.title ?? section.title
  const description = view.description ?? section.description

  return (
    <Box flex={1} height="100%" display="flex" flexDirection="column" bg="gemSurface">
      {/* Fixed header section */}
      <Box px={6} pt={4} pb={4} flexShrink={0}>
        <VStack align="stretch" gap={2}>
          <HStack gap={1} align="center" height="36px">
            {showBack ? (
              <IconButton aria-label="Go back" variant="ghost" size="sm" onClick={goBack}>
                <HiOutlineChevronLeft style={{ width: '22px', height: '22px' }} />
              </IconButton>
            ) : null}
            <Heading size="lg">{title}</Heading>
          </HStack>
          {description ? (
            <Text color="gemOnSurfaceVariant" fontSize="md">
              {description}
            </Text>
          ) : null}
        </VStack>
      </Box>

      {/* Scrollable content area */}
      <Box flex={1} px={6} pb={4} overflow="auto">
        {children}
      </Box>
    </Box>
  )
}

export const ContentArea: React.FC = () => {
  const route = useSettingStore((state) => state.route)
  const navigateToView = useSettingStore((state) => state.navigateToView)
  const goBack = useSettingStore((state) => state.goBack)

  const section = React.useMemo(() => getSectionDefinition(route.sectionId), [route.sectionId])
  const view = React.useMemo(() => getViewDefinition(route.sectionId, route.viewId), [route.sectionId, route.viewId])

  if (!section || !view) {
    return null
  }

  const Component = view.Component

  const handleOpenView = React.useCallback(
    (viewId: string, params?: Record<string, unknown>) => {
      navigateToView(route.sectionId, viewId, params)
    },
    [navigateToView, route.sectionId]
  )

  const handleNavigateSection = React.useCallback(
    (sectionId: NavigationSection, viewId = 'index', params?: Record<string, unknown>) => {
      navigateToView(sectionId, viewId, params)
    },
    [navigateToView]
  )

  const componentProps: SettingViewComponentProps<NavigationSection> = {
    route,
    openView: handleOpenView,
    goBack,
    navigateToSection: handleNavigateSection,
    section,
    view
  }

  return (
    <SettingSectionContainer {...componentProps}>
      <Component {...componentProps} />
    </SettingSectionContainer>
  )
}
