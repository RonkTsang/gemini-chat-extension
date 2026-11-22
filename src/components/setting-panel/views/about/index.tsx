import React, { useState, useEffect, useLayoutEffect, useRef } from 'react'
import { Box, VStack, HStack, Heading, Text, Button, Image, Badge } from '@chakra-ui/react'
import { useColorModeValue } from '@/components/ui/color-mode'
import {
  HiOutlineChat,
  HiOutlineThumbUp,
} from 'react-icons/hi'
import { FaGithub } from 'react-icons/fa'
import { LuPuzzle } from 'react-icons/lu'
import { TbMoodShare } from "react-icons/tb";
import koFiLogo from '@/assets/ko-fi.webp?inline'
import type { NavigationSection } from '../../config'
import type { SettingViewComponent } from '../../types'
import { ABOUT_SUPPORT_ANCHOR, emphasizeSupportBorder, SupportBorderTrace, SupportProjectIcon } from './support'
import { EXTERNAL_LINKS, PRODUCT_NAME } from '@/common/config'
import { t } from '@/utils/i18n'
import { isExtensionContextValid } from '@/utils/contextMonitor'
import packageJson from '../../../../../package.json'
import iconPath from '/icon/512.png'

const supportColors = {
  light: {
    background: '#fcf5f8',
    border: '#efd9e3',
    highlight: '#c25e87',
    coffeeBackground: '#f1d9e5',
    coffeeHover: '#eccbdd',
    coffeeText: '#4c1b35',
  },
  dark: {
    background: '#2c232b',
    border: '#513745',
    highlight: '#cb729a',
    coffeeBackground: '#58374b',
    coffeeHover: '#694158',
    coffeeText: '#ffe4ef',
  },
}

export const AboutView: SettingViewComponent<NavigationSection> = ({ route }) => {
  const scrollArea = useRef<HTMLDivElement>(null)
  const supportCard = useRef<HTMLDivElement>(null)
  const supportHeading = useRef<HTMLHeadingElement>(null)
  const supportBorderTrace = useRef<HTMLDivElement>(null)
  const [logoUrl, setLogoUrl] = useState<string>('')
  const [version] = useState(() => {
    try {
      return (typeof browser !== 'undefined' && browser.runtime?.getManifest()?.version) || packageJson.version
    } catch {
      return packageJson.version
    }
  })

  useEffect(() => {
    // Check if extension context is valid before calling getURL
    if (isExtensionContextValid()) {
      setLogoUrl(browser.runtime.getURL(iconPath as any))
    }
  }, [])

  useLayoutEffect(() => {
    if (route.params?.anchor !== ABOUT_SUPPORT_ANCHOR) {
      if (scrollArea.current) scrollArea.current.scrollTop = 0
      return
    }

    const card = supportCard.current
    const trace = supportBorderTrace.current
    if (!card || !trace) return

    card.scrollIntoView({ block: 'start', inline: 'nearest', behavior: 'instant' })
    supportHeading.current?.focus({ preventScroll: true })
    return emphasizeSupportBorder(card, trace, route.params.animateSupportBorder === true)
  }, [route])

  // Color mode values
  const textColor = useColorModeValue('gray.800', 'whiteAlpha.900')
  const secondaryTextColor = useColorModeValue('gray.600', 'whiteAlpha.700')
  const mutedTextColor = useColorModeValue('gray.500', 'whiteAlpha.600')
  const buttonBg = useColorModeValue('gray.100', 'whiteAlpha.100')
  const buttonHoverBg = useColorModeValue('gray.200', 'whiteAlpha.200')
  const accentColor = useColorModeValue('blue.500', 'blue.400')
  const support = useColorModeValue(supportColors.light, supportColors.dark)

  // Open external links in content script environment
  const openExternalLink = (url: string) => {
    if (!url) {
      console.warn('URL is empty')
      return
    }
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  // Share functionality implementation
  const handleShare = async () => {
    const shareUrl = EXTERNAL_LINKS.SHARE

    // Try to use Web Share API
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Gemini Power Kit',
          text: 'Check out this awesome extension for Gemini!',
          url: shareUrl,
        })
        return
      } catch (err) {
        // User cancelled or not supported, fallback to opening link
        console.log('Share cancelled or not supported:', err)
      }
    }

    // Fallback: directly open the link
    openExternalLink(shareUrl)
  }

  return (
    <Box
      h="100%"
      w="100%"
      display="flex"
      flexDirection="column"
    >
      {/* Scrollable content area */}
      <Box
        ref={scrollArea}
        flex={1}
        overflowY="auto"
        p={{ base: 4, md: 8 }}
      >
        <VStack gap={8} maxW="600px" mx="auto" align="stretch">
          {/* Top product card */}
          <Box>
            <HStack gap={4} align="center">
              {/* Product Logo */}
              {logoUrl && (
                <Box flexShrink={0}>
                  <Image
                    src={logoUrl}
                    alt="Gemini Power Kit Logo"
                    boxSize="80px"
                    borderRadius="lg"
                  />
                </Box>
              )}

              {/* Product information */}
              <VStack align="flex-start" gap={3} flex={1}>
                <HStack gap={2} align="center">
                  <Text fontSize="2xl" fontWeight="bold" color={textColor}>
                    {PRODUCT_NAME}
                  </Text>
                  {version && (
                    <Badge size="sm">
                      v{version}
                    </Badge>
                  )}
                </HStack>
                <Text fontSize="md" color={secondaryTextColor}>
                  Your <Text as="span" color={accentColor} fontWeight="medium">Essential Companion</Text> for Gemini
                </Text>
              </VStack>
            </HStack>
          </Box>

          {/* Motivation section */}
          <VStack align="flex-start" gap={3}>
            <Text fontSize="lg" fontWeight="bold" color={textColor}>
              {t('aboutPage.motivation.title')}
            </Text>
            <Text fontSize="sm" color={secondaryTextColor} lineHeight="1.6">
              {t('aboutPage.motivation.content')}
            </Text>
          </VStack>

          {/* Feedback section */}
          <VStack align="flex-start" gap={3}>
            <Text fontSize="lg" fontWeight="bold" color={textColor}>
              {t('aboutPage.feedback.title')}
            </Text>
            <HStack gap={3} w="100%" wrap="wrap">
              <Button
                variant="ghost"
                size="sm"
                bg={buttonBg}
                _hover={{ bg: buttonHoverBg }}
                onClick={() => openExternalLink(EXTERNAL_LINKS.FEATURE_REQUEST)}
                flexShrink={0}
              >
                <LuPuzzle size={18} />
                <Text ml={2}>{t('aboutPage.feedback.featureRequest')}</Text>
              </Button>
              <Button
                asChild
                variant="ghost"
                size="sm"
                bg={buttonBg}
                _hover={{ bg: buttonHoverBg }}
                flexShrink={0}
              >
                <a href={EXTERNAL_LINKS.HELP} target="_blank" rel="noopener noreferrer">
                  <HiOutlineChat size={18} aria-hidden="true" />
                  <Text ml={2}>{t('aboutPage.feedback.bugSupport')}</Text>
                </a>
              </Button>
            </HStack>
          </VStack>

          {/* Open Source section */}
          <VStack align="flex-start" gap={3}>
            <Text fontSize="lg" fontWeight="bold" color={textColor}>
              {t('aboutPage.openSource.title')}
            </Text>
            <Button
              variant="ghost"
              size="sm"
              bg={buttonBg}
              _hover={{ bg: buttonHoverBg }}
              onClick={() => openExternalLink(EXTERNAL_LINKS.GITHUB)}
            >
              <FaGithub size={18} />
              <Text ml={2}>Github</Text>
            </Button>
          </VStack>

          <VStack
            as="section"
            ref={supportCard}
            align="stretch"
            gap={2}
            p={{ base: 4, md: 5 }}
            position="relative"
            isolation="isolate"
            borderWidth="1px"
            borderRadius="xl"
            bg={support.background}
            borderColor={support.border}
            css={{
              '--support-border-highlight': support.highlight,
              '&[data-support-emphasis]': { borderColor: 'var(--support-border-highlight)' },
            }}
          >
            <SupportBorderTrace traceRef={supportBorderTrace} />
            <Heading
              as="h3"
              ref={supportHeading}
              tabIndex={-1}
              display="flex"
              alignItems="center"
              gap={2}
              fontSize="lg"
              fontWeight="bold"
              color={textColor}
            >
              <SupportProjectIcon />
              {t('aboutPage.donate.title')}
            </Heading>
            <Text fontSize="sm" color={secondaryTextColor} lineHeight="1.7" maxW="58ch">
              {t('aboutPage.donate.description', PRODUCT_NAME)}
            </Text>
            <HStack
              gap={2}
              mt={2}
              wrap="wrap"
              css={{
                '& > :is(a, button)': {
                  maxWidth: '100%',
                  minHeight: '9',
                  height: 'auto',
                  paddingBlock: '1.5',
                  whiteSpace: 'normal',
                },
              }}
            >
              <Button
                asChild
                variant="solid"
                size="sm"
                bg={support.coffeeBackground}
                color={support.coffeeText}
                _hover={{ bg: support.coffeeHover }}
                fontWeight="semibold"
              >
                <a href={EXTERNAL_LINKS.COFFEE} target="_blank" rel="noopener noreferrer">
                  <Image src={koFiLogo} alt="" boxSize="18px" objectFit="contain" flexShrink={0} />
                  <Text>{t('aboutPage.donate.buyMeCoffee')}</Text>
                </a>
              </Button>
              <Button
                asChild
                variant="ghost"
                size="sm"
                color={secondaryTextColor}
                _hover={{ bg: 'transparent', textDecoration: 'underline' }}
              >
                <a href={EXTERNAL_LINKS.REVIEW} target="_blank" rel="noopener noreferrer">
                  <HiOutlineThumbUp size={18} aria-hidden="true" />
                  <Text>{t('aboutPage.feedback.leaveReview')}</Text>
                </a>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                color={secondaryTextColor}
                _hover={{ bg: 'transparent', textDecoration: 'underline' }}
                onClick={handleShare}
              >
                <TbMoodShare size={18} aria-hidden="true" />
                <Text>{t('aboutPage.donate.share')}</Text>
              </Button>
            </HStack>
          </VStack>
        </VStack>
      </Box>

      {/* Copyright information - fixed at bottom */}
      <Box
        py={3}
        px={8}
        borderTopWidth="0"
        flexShrink={0}
      >
        <Text fontSize="xs" color={mutedTextColor} textAlign="center">
          {`Copyright © ${typeof packageJson.author === 'string' ? packageJson.author : (packageJson.author as { name?: string })?.name || ''}`}
        </Text>
      </Box>
    </Box>
  )
}
