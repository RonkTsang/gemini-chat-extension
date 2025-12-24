import React, { useState, useEffect } from 'react'
import { Box, VStack, HStack, Text, Button, Image, Badge } from '@chakra-ui/react'
import { useColorModeValue } from '@/components/ui/color-mode'
import {  
  HiOutlineChat, 
  HiOutlineThumbUp,
} from 'react-icons/hi'
import { FaGithub } from 'react-icons/fa'
import { LuPuzzle, LuCoffee } from 'react-icons/lu'
import { TbMoodShare } from "react-icons/tb";
import type { SettingViewComponent } from '../../types'
import { EXTERNAL_LINKS } from '@/common/config'
import { t } from '@/utils/i18n'
import packageJson from '../../../../../package.json'
import iconPath from '/icon/512.png'

export const AboutView: SettingViewComponent = () => {
  // Get extension resource URL when component mounts
  const [logoUrl, setLogoUrl] = useState<string>('')

  useEffect(() => {
    setLogoUrl(browser.runtime.getURL(iconPath as any))
  }, [])

  // Color mode values
  const textColor = useColorModeValue('gray.800', 'whiteAlpha.900')
  const secondaryTextColor = useColorModeValue('gray.600', 'whiteAlpha.700')
  const mutedTextColor = useColorModeValue('gray.500', 'whiteAlpha.600')
  const buttonBg = useColorModeValue('gray.100', 'whiteAlpha.100')
  const buttonHoverBg = useColorModeValue('gray.200', 'whiteAlpha.200')
  const accentColor = useColorModeValue('blue.500', 'blue.400')

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
        flex={1}
        overflowY="auto"
        p={8}
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
                  {t('aboutPage.productName')}
                </Text>
                <Badge colorPalette="blue" size="sm">
                  v{packageJson.version}
                </Badge>
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
              variant="ghost"
              size="sm"
              bg={buttonBg}
              _hover={{ bg: buttonHoverBg }}
              onClick={() => openExternalLink(EXTERNAL_LINKS.BUG_REPORT)}
              flexShrink={0}
            >
              <HiOutlineChat size={18} />
              <Text ml={2}>{t('aboutPage.feedback.bugSupport')}</Text>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              bg={buttonBg}
              _hover={{ bg: buttonHoverBg }}
              onClick={() => openExternalLink(EXTERNAL_LINKS.REVIEW)}
              flexShrink={0}
            >
              <HiOutlineThumbUp size={18} />
              <Text ml={2}>{t('aboutPage.feedback.leaveReview')}</Text>
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

        {/* Donate section */}
        <VStack align="flex-start" gap={3}>
          <Text fontSize="lg" fontWeight="bold" color={textColor}>
            {t('aboutPage.donate.title')}
          </Text>
          <Text fontSize="sm" color={secondaryTextColor} lineHeight="1.6">
            {t('aboutPage.donate.description')} 🤗
          </Text>
          <HStack gap={3} w="100%" wrap="wrap">
            <Button
              variant="ghost"
              size="sm"
              bg={buttonBg}
              _hover={{ bg: buttonHoverBg }}
              onClick={() => openExternalLink(EXTERNAL_LINKS.COFFEE)}
              flexShrink={0}
            >
              <LuCoffee size={18} />
              <Text ml={2}>{t('aboutPage.donate.buyMeCoffee')}</Text>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              bg={buttonBg}
              _hover={{ bg: buttonHoverBg }}
              onClick={handleShare}
              flexShrink={0}
            >
              <TbMoodShare size={18} />
              <Text ml={2}>{t('aboutPage.donate.share')}</Text>
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

