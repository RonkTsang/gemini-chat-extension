/**
 * What's New Toast Component
 * A custom floating card that displays new features after version update
 */

import { Box, Badge, Button, Card, HStack, Icon, Link, Portal, Text, VStack, CloseButton, Image } from '@chakra-ui/react'
import { useState } from 'react'
import { FaHeart } from 'react-icons/fa'
import { HiOutlineAdjustments, HiOutlineExternalLink } from 'react-icons/hi'
import { t } from '@/utils/i18n'
import { EXTERNAL_LINKS } from '@/common/config'
import { ABOUT_SUPPORT_ANCHOR } from '@/components/setting-panel/views/about/support'
import { useColorModeValue } from '@/components/ui/color-mode'
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
  const supportHeartColor = useColorModeValue('pink.600', 'pink.400')

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

  const handleSupportClick = () => {
    emitSync('settings:open', {
      from: 'whats-new',
      open: true,
      module: 'about',
      params: {
        anchor: ABOUT_SUPPORT_ANCHOR,
        animateSupportBorder: true,
      },
    })
    onClose()
  }

  const handlePromoActionClick = (action?: ReleaseNotePromoAction) => {
    if (!action) return

    if (action.action === 'external-link') {
      window.open(action.params.url, '_blank', 'noopener,noreferrer')
      return
    }

    if (action.action === 'setting-panel') {
      emitSync('settings:open', {
        from: 'whats-new',
        open: true,
        module: action.params.tab,
      })
      return
    }

    if (action.action === 'theme-floating-panel') {
      emitSync('theme-floating-panel:open', {
        source: 'whats-new',
      })
      return
    }

    if (action.action === 'chat-settings-panel') {
      emitSync('chat-settings-panel:toggle', {
        source: 'whats-new',
      })
    }
  }

  return (
    <Portal>
      <Box
        position="fixed"
        bottom="4"
        right="4"
        zIndex="banner"
        w="360px"
        maxW="calc(100vw - 32px)"
      >
        <Card.Root
          borderWidth="1px"
          variant="elevated"
          display="flex"
          flexDirection="column"
          maxH="calc(100dvh - 32px)"
          overflow="hidden"
        >
          {/* Header */}
          <Card.Header pt="4" p="3" flexShrink="0">
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
          <Card.Body pt="1" pb="4" overflowY="auto" flex="1" minH="0">
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
                      <Box
                        as={feature.promoAction ? 'button' : 'div'}
                        display="block"
                        w="100%"
                        p="0"
                        border="0"
                        bg="transparent"
                        borderRadius="md"
                        mb="2"
                        aria-label={feature.promoAction
                          ? t(feature.actionLabelKey ?? feature.titleKey)
                          : undefined}
                        cursor={feature.promoAction ? 'pointer' : 'default'}
                        transition="transform 0.2s ease, filter 0.2s ease, box-shadow 0.2s ease"
                        _hover={feature.promoAction ? {
                          transform: 'scale(1.01)',
                          filter: 'brightness(1.03)',
                          boxShadow: 'sm',
                        } : undefined}
                        onClick={() => handlePromoActionClick(feature.promoAction)}
                        _focusVisible={{ outline: '2px solid', outlineColor: 'colorPalette.focusRing', outlineOffset: '2px' }}
                      >
                        <Image
                          src={promoImageSrc}
                          alt=""
                          w="100%"
                          aspectRatio={16 / 9}
                          objectFit="cover"
                          objectPosition="center"
                          borderRadius="md"
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
                      </Box>
                    )}
                    <Text fontSize="sm" color="fg.muted" lineHeight="1.6">
                      {t(feature.descriptionKey)}
                    </Text>
                    {feature.actionLabelKey && feature.promoAction && (
                      <Button
                        size="2xs"
                        variant="solid"
                        mt="2"
                        onClick={() => handlePromoActionClick(feature.promoAction)}
                      >
                        {feature.promoAction.action === 'external-link'
                          ? <HiOutlineExternalLink />
                          : <HiOutlineAdjustments />}
                        {t(feature.actionLabelKey)}
                      </Button>
                    )}
                  </Box>
                )
              })}
            </VStack>
          </Card.Body>


          {/* Footer */}
          <Card.Footer
            px="3"
            py="3"
            mt="1"
            borderTopWidth="1px"
            borderColor="border.subtle"
            justifyContent="center"
            alignItems="center"
            gap="3"
            flexWrap="wrap"
            flexShrink="0"
          >
            <Box
              as="button"
              display="inline-flex"
              alignItems="center"
              gap="1.5"
              py="1"
              borderRadius="sm"
              fontSize="xs"
              color="fg.muted"
              cursor="pointer"
              transition="color 0.15s ease"
              _hover={{
                color: 'fg',
                textDecoration: 'underline',
              }}
              _focusVisible={{
                outline: '2px solid',
                outlineColor: 'colorPalette.focusRing',
                outlineOffset: '2px',
              }}
              onClick={handleSupportClick}
            >
              <Icon as={FaHeart} boxSize="12px" color={supportHeartColor} aria-hidden="true" flexShrink={0} />
              <Text as="span">{t('whatsnew.supportLink')}</Text>
            </Box>
            <Box
              as="span"
              aria-hidden="true"
              w="1px"
              h="3"
              bg="border"
              flexShrink={0}
            />
            <Link
              href={EXTERNAL_LINKS.RELEASE_NOTES}
              target="_blank"
              rel="noopener noreferrer"
              display="inline-flex"
              alignItems="center"
              py="1"
              borderRadius="sm"
              fontSize="xs"
              color="fg.muted"
              textDecoration="none"
              transition="color 0.15s ease"
              _hover={{
                color: 'fg',
                textDecoration: 'underline',
              }}
              _focusVisible={{
                outline: '2px solid',
                outlineColor: 'colorPalette.focusRing',
                outlineOffset: '2px',
              }}
            >
              <Text as="span">{t('whatsnew.releaseNotes')}</Text>
            </Link>
          </Card.Footer>
        </Card.Root>
      </Box>
    </Portal>
  )
}
