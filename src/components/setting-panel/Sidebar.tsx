import React from 'react'
import { Box, VStack, Text, HStack } from '@chakra-ui/react'
import useSettingStore from '../../stores/settingStore'
import { settingSectionDefinitions, type NavigationSection } from './config'
import type { SettingSectionDefinition } from './types'
import { ABOUT_SUPPORT_ANCHOR, SupportProjectIcon } from './views/about/support'
import { t } from '@/utils/i18n'

interface SidebarProps {
  width?: string
}

interface NavigationButtonProps {
  label: string
  icon: React.ReactNode
  isActive: boolean
  onSelect: React.MouseEventHandler<HTMLElement>
}

const NavigationButton: React.FC<NavigationButtonProps> = ({ label, icon, isActive, onSelect }) => {
  const itemBg = isActive ? 'gemPrimaryContainer' : 'transparent'
  const itemColor = isActive ? 'gemOnPrimaryContainer' : 'gemOnSurfaceVariant'
  const itemHoverBg = isActive ? 'gemPrimaryContainer' : 'surfaceContainerHover'

  return (
    <Box
      as="button"
      aria-current={isActive || undefined}
      display="flex"
      alignItems="center"
      width="100%"
      px={3}
      py={2}
      borderRadius="lg"
      textAlign="left"
      cursor="pointer"
      transition="all 0.2s"
      bg={itemBg}
      color={itemColor}
      _hover={{
        bg: itemHoverBg,
      }}
      onClick={onSelect}
    >
      <HStack gap={3}>
        <Box aria-hidden="true" flexShrink={0}>
          {icon}
        </Box>
        <Text fontSize="sm" fontWeight={isActive ? 'medium' : 'normal'}>
          {label}
        </Text>
      </HStack>
    </Box>
  )
}

interface NavigationGroupProps {
  label?: string
  items: Array<SettingSectionDefinition<NavigationSection>>
  activeSection?: NavigationSection
  onSelect: (section: NavigationSection) => void
}

const NavigationGroup: React.FC<NavigationGroupProps> = ({ label, items, activeSection, onSelect }) => (
  <VStack align="stretch" gap={1}>
    {label ? (
      <Text
        fontSize="sm"
        fontWeight="medium"
        color="gray.500"
        px={3}
        py={2}
        textTransform="capitalize"
      >
        {label}
      </Text>
    ) : null}
    {items.map(({ id, label, icon: Icon }) => (
      <NavigationButton
        key={id}
        label={label}
        icon={<Icon size={20} width={20} height={20} />}
        isActive={activeSection === id}
        onSelect={() => onSelect(id)}
      />
    ))}
  </VStack>
)

export const Sidebar: React.FC<SidebarProps> = ({ width = '240px' }) => {
  const route = useSettingStore((state) => state.route)
  const setActiveSection = useSettingStore((state) => state.setActiveSection)
  const navigateToView = useSettingStore((state) => state.navigateToView)

  const promptItems = React.useMemo(
    () => settingSectionDefinitions.filter((item) => item.group === 'prompt'),
    []
  )
  const toolsItems = React.useMemo(
    () => settingSectionDefinitions.filter((item) => item.group === 'tools'),
    []
  )
  const supportItems = React.useMemo(
    () => settingSectionDefinitions.filter((item) => item.group === 'support'),
    []
  )
  const activeSection = route.sectionId
  const isSupportActive = activeSection === 'about' && route.params?.anchor === ABOUT_SUPPORT_ANCHOR

  return (
    <Box
      width={width}
      height="100%"
      bg="gemSidenavBg"
      px={3}
      py={6}
      display="flex"
      flexDirection="column"
    >
      <VStack align="stretch" gap={4} flex={1}>
        {/* Prompt Group */}
        <NavigationGroup
          label="Prompt"
          items={promptItems}
          activeSection={activeSection}
          onSelect={setActiveSection}
        />

        {/* Tools Group */}
        <NavigationGroup
          label="Tools"
          items={toolsItems}
          activeSection={activeSection}
          onSelect={setActiveSection}
        />
      </VStack>
      <VStack mt="auto" align="stretch" gap={1}>
        <NavigationGroup
          items={supportItems}
          activeSection={isSupportActive ? undefined : activeSection}
          onSelect={setActiveSection}
        />
        <NavigationButton
          label={t('aboutPage.donate.title')}
          icon={<SupportProjectIcon />}
          isActive={isSupportActive}
          onSelect={(event) => navigateToView('about', 'index', {
            anchor: ABOUT_SUPPORT_ANCHOR,
            animateSupportBorder: event.detail > 0,
          })}
        />
      </VStack>
    </Box>
  )
}
