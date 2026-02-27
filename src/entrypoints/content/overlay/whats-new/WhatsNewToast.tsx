/**
 * What's New Toast Component
 * A custom floating card that displays new features after version update
 */

import { Box, Badge, Button, Card, HStack, Portal, Text, VStack, CloseButton, Image } from '@chakra-ui/react'
import { useState } from 'react'
import { t } from '@/utils/i18n'
import { EXTERNAL_LINKS } from '@/common/config'
import { useEventEmitter } from '@/hooks/useEventBus'
import type { ReleaseNote, ReleaseNotePromoAction } from './config'

interface WhatsNewToastProps {
  version: string
  features: ReleaseNote[]
  onClose: () => void
}

export function WhatsNewToast({ version, features, onClose }: WhatsNewToastProps) {
  const [failedPromoImages, setFailedPromoImages] = useState<Set<string>>(new Set())
  const { emitSync } = useEventEmitter()

  const resolvePromoImageSrc = (promoImagePath: string) => {
    if (/^(https?:|data:|blob:|chrome-extension:|moz-extension:)/.test(promoImagePath)) {
      return promoImagePath
    }

    try {
      return browser.runtime.getURL(promoImagePath as any)
    } catch {
      return promoImagePath
    }
  }

  const handleReleaseNotesClick = () => {
    window.open(EXTERNAL_LINKS.RELEASE_NOTES, '_blank', 'noopener,noreferrer')
    onClose()
  }

  const handlePromoActionClick = (action?: ReleaseNotePromoAction) => {
    if (!action) return

    if (action.action === 'setting-panel') {
      emitSync('settings:open', {
        from: 'whats-new',
        open: true,
        module: action.params.tab,
      })
      onClose()
    }
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
          maxH="280px"
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
              {features.map((feature, index) => {
                const promoImageSrc = feature.promoImagePath
                  ? resolvePromoImageSrc(feature.promoImagePath)
                  : null

                return (
                  <Box key={index}>
                    <Text
                      fontSize="sm"
                      fontWeight="semibold"
                      color="fg"
                      mb="1"
                    >
                      {t(feature.titleKey)}
                    </Text>
                    {promoImageSrc && !failedPromoImages.has(promoImageSrc) && (
                      <Image
                        src={promoImageSrc}
                        alt=""
                        w="100%"
                        h="60px"
                        borderRadius="md"
                        objectFit="cover"
                        mb="2"
                        cursor={feature.promoAction ? 'pointer' : 'default'}
                        transition="transform 0.2s ease, filter 0.2s ease, box-shadow 0.2s ease"
                        _hover={feature.promoAction ? {
                          transform: 'scale(1.01)',
                          filter: 'brightness(1.03)',
                          boxShadow: 'sm',
                        } : undefined}
                        onClick={() => handlePromoActionClick(feature.promoAction)}
                        onError={(event) => {
                          const failedSrc = event.currentTarget.currentSrc || event.currentTarget.src
                          if (!failedSrc) return
                          setFailedPromoImages((prev) => {
                            if (prev.has(failedSrc)) return prev
                            const next = new Set(prev)
                            next.add(failedSrc)
                            return next
                          })
                        }}
                      />
                    )}
                    <Text fontSize="sm" color="fg.muted" lineHeight="1.6">
                      {t(feature.descriptionKey)}
                    </Text>
                  </Box>
                )
              })}
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
