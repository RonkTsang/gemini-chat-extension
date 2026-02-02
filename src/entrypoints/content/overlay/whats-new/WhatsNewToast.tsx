/**
 * What's New Toast Component
 * A custom floating card that displays new features after version update
 */

import { Box, Badge, Button, Card, HStack, Portal, Text, VStack, CloseButton } from '@chakra-ui/react'
import { t } from '@/utils/i18n'
import { EXTERNAL_LINKS } from '@/common/config'
import type { ReleaseNote } from './config'

interface WhatsNewToastProps {
  version: string
  features: ReleaseNote[]
  onClose: () => void
}

export function WhatsNewToast({ version, features, onClose }: WhatsNewToastProps) {

  const handleReleaseNotesClick = () => {
    window.open(EXTERNAL_LINKS.RELEASE_NOTES, '_blank', 'noopener,noreferrer')
    onClose()
  }

  return (
    <Portal>
      <Box
        position="fixed"
        bottom="4"
        right="4"
        zIndex="toast"
        maxW="300px"
      >
        <Card.Root
          borderWidth="1px"
          variant="elevated"
          maxH="250px"
          display="flex"
          flexDirection="column"
        >
          {/* Header */}
          <Card.Header pt="4" p="3">
            <HStack justify="space-between" align="flex-start">
              <HStack gap="2" flex="1">
                <Text fontWeight="semibold" color="fg">
                  ✨ {t('whatsnew.title')}
                </Text>
                <Badge size="xs" mt="1px">
                  v{version}
                </Badge>
              </HStack>
              <CloseButton size="2xs" onClick={onClose} />
            </HStack>
          </Card.Header>

          {/* Body - Feature List */}
          <Card.Body pt="1" pb="2" overflowY="auto" flex="1">
            <VStack align="stretch" gap="4">
              {features.map((feature, index) => (
                <Box key={index}>
                  <Text
                    fontSize="sm"
                    fontWeight="semibold"
                    color="fg"
                    mb="1"
                  >
                    {t(feature.titleKey)}
                  </Text>
                  <Text fontSize="sm" color="fg.muted" lineHeight="1.6">
                    {t(feature.descriptionKey)}
                  </Text>
                </Box>
              ))}
            </VStack>
          </Card.Body>


          {/* Footer */}
          <Card.Footer p="3" pt="2" justifyContent="flex-end">
            <Button
              variant="outline"
              size="2xs"
              onClick={handleReleaseNotesClick}
            >
              {t('whatsnew.releaseNotes')}
            </Button>
          </Card.Footer>
        </Card.Root>
      </Box>
    </Portal>
  )
}
