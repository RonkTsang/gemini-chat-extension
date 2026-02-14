import { Box, Text, VStack, HStack, Circle } from '@chakra-ui/react'
import { HiUser } from 'react-icons/hi'
import { t } from '@/utils/i18n'

interface LivePreviewProps {
  primaryColor: string
}

/**
 * Live Preview panel — simulates a Gemini chat window.
 * The user message bubble and accent elements use the active theme's primary color.
 */
export function LivePreview({ primaryColor }: LivePreviewProps) {
  return (
    <Box>
      <Text
        fontSize="xs"
        fontWeight="bold"
        color="gemOnSurfaceVariant"
        textTransform="uppercase"
        letterSpacing="wider"
        mb={4}
        textAlign="center"
      >
        {t('settingPanel.theme.livePreview')}
      </Text>

      {/* Mock chat window */}
      <Box
        bg="white"
        borderRadius="2xl"
        shadow="lg"
        overflow="hidden"
        border="1px solid"
        borderColor="gray.100"
      >
        {/* Header bar */}
        <HStack px={4} py={3} borderBottom="1px solid" borderColor="gray.100">
          <Circle size="8px" bg="gray.300" />
          <Box flex="1" height="8px" bg="gray.200" borderRadius="full" maxWidth="120px" />
          <Box ml="auto">
            <Circle size="28px" bg={primaryColor} transition="background 0.3s">
              <HiUser color="white" size={14} />
            </Circle>
          </Box>
        </HStack>

        {/* Chat content */}
        <VStack align="stretch" px={4} py={4} gap={4} minHeight="280px">
          {/* Sidebar dots (left edge) */}
          <HStack gap={3} align="start">
            <VStack gap={2} pt={1}>
              <Circle size="10px" bg={primaryColor} transition="background 0.3s" />
              <Circle size="10px" bg="gray.200" />
              <Circle size="10px" bg="gray.200" />
            </VStack>

            <VStack align="stretch" flex="1" gap={3}>
              {/* User message */}
              <Box alignSelf="flex-end">
                <Box
                  bg={primaryColor}
                  color="white"
                  px={4}
                  py={2}
                  borderRadius="2xl"
                  borderBottomRightRadius="sm"
                  fontSize="xs"
                  maxWidth="200px"
                  transition="background 0.3s"
                >
                  Summarize this article for me.
                </Box>
              </Box>

              {/* Assistant response */}
              <Box alignSelf="flex-start">
                <Box
                  bg="gray.100"
                  px={4}
                  py={3}
                  borderRadius="2xl"
                  borderBottomLeftRadius="sm"
                  fontSize="xs"
                  color="gray.700"
                  maxWidth="220px"
                  lineHeight="1.5"
                >
                  The article discusses the impact of artificial intelligence on modern workflow productivity...
                </Box>
              </Box>
            </VStack>
          </HStack>

          {/* Spacer */}
          <Box flex="1" />

          {/* Input bar */}
          <HStack gap={2} pb={1}>
            <Box
              flex="1"
              height="32px"
              bg="gray.100"
              borderRadius="full"
            />
            <Box
              as="button"
              display="flex"
              alignItems="center"
              justifyContent="center"
              width="32px"
              height="32px"
              borderRadius="full"
              color="gray.400"
              fontSize="sm"
            >
              ▶
            </Box>
          </HStack>
        </VStack>
      </Box>
    </Box>
  )
}
