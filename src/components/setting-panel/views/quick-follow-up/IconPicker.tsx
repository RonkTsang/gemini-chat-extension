import {
  IconButton,
  Popover,
  Portal,
  SimpleGrid
} from '@chakra-ui/react'
import { useMemo } from 'react'

import type { QuickFollowIconKey } from '@/domain/quick-follow/iconKeys'
import { ICON_CATALOG, getIconDefinition } from '@/components/quick-follow/icons'

export interface IconPickerProps {
  value: QuickFollowIconKey
  onChange: (value: QuickFollowIconKey) => void
}

export function IconPicker({ value, onChange }: IconPickerProps) {
  const currentIcon = useMemo(() => getIconDefinition(value), [value])

  return (
    <Popover.Root positioning={{ placement: 'bottom-start', gutter: 8 }}>
      <Popover.Trigger asChild>
        <IconButton
          aria-label={currentIcon.label}
          variant="subtle"
          rounded="full"
          size="md"
        >
          <currentIcon.Icon />
        </IconButton>
      </Popover.Trigger>
      <Portal>
        <Popover.Positioner>
          <Popover.Content width="200px" maxHeight="200px" bg="tocBg" borderColor="tocHoverBg">
            <Popover.Body overflowY="auto" p={2}>
              <SimpleGrid columns={4} gap={1}>
                {ICON_CATALOG.map(definition => (
                  <Popover.CloseTrigger asChild key={definition.key}>
                    <IconButton
                      size="sm"
                      aria-label={definition.label}
                      variant={definition.key === value ? 'solid' : 'ghost'}
                      onClick={() => onChange(definition.key)}
                      _hover={{ bg: 'tocHoverBg' }}
                    >
                      <definition.Icon />
                    </IconButton>
                  </Popover.CloseTrigger>
                ))}
              </SimpleGrid>
            </Popover.Body>
          </Popover.Content>
        </Popover.Positioner>
      </Portal>
    </Popover.Root>
  )
}

