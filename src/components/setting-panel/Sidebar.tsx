import React from 'react'
import { Box, VStack, Text, HStack } from '@chakra-ui/react'
import useSettingStore from '../../stores/settingStore'
import { settingSectionDefinitions, type NavigationSection } from './config'
import type { SettingSectionDefinition } from './types'

interface SidebarProps {
  width?: string
}

interface NavigationButtonProps {
  item: SettingSectionDefinition<NavigationSection>
  isActive: boolean
  onSelect: (section: NavigationSection) => void
}

const NavigationButton: React.FC<NavigationButtonProps> = ({ item, isActive, onSelect }) => {
  const IconComponent = item.icon

  const itemBg = isActive ? 'gemPrimaryContainer' : 'transparent'
  const itemColor = isActive ? 'gemOnPrimaryContainer' : 'gemOnSurfaceVariant'
  const itemHoverBg = isActive ? 'gemPrimaryContainer' : 'surfaceContainerHover'
  const iconColor = isActive ? 'gemOnPrimaryContainer' : 'gemOnSurfaceVariant'

  return (
    <Box
      as="button"
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
      onClick={() => onSelect(item.id)}
    >
      <HStack gap={3}>
        <Box color={iconColor}>
          <IconComponent size={20} />
        </Box>
        <Text fontSize="sm" fontWeight={isActive ? 'medium' : 'normal'}>
          {item.label}
        </Text>
      </HStack>
    </Box>
  )
}

interface NavigationGroupProps {
  label?: string
  items: Array<SettingSectionDefinition<NavigationSection>>
  activeSection: NavigationSection
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
    {items.map((item) => (
      <NavigationButton
        key={item.id}
        item={item}
        isActive={activeSection === item.id}
        onSelect={onSelect}
      />
    ))}
  </VStack>
)

export const Sidebar: React.FC<SidebarProps> = ({ width = '240px' }) => {
  const route = useSettingStore((state) => state.route)
  const setActiveSection = useSettingStore((state) => state.setActiveSection)

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

  return (
    <Box
      width={width}
      height="100%"
      bg="gemSurfaceContainer"
      px={3}  // 减少水平内边距，让内容更接近边缘
      py={6}  // 保持垂直内边距
      display="flex"
      flexDirection="column"
    >
      <VStack align="stretch" gap={4} flex={1}>  {/* 减少组间距 */}
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
      <Box mt="auto">
        <NavigationGroup
          items={supportItems}
          activeSection={activeSection}
          onSelect={setActiveSection}
        />
      </Box>
    </Box>
  )
}
