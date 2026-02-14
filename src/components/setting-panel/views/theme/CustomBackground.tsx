import { Box, Text, VStack, HStack, Button } from '@chakra-ui/react'
import { HiOutlineCloudUpload } from 'react-icons/hi'
import { t } from '@/utils/i18n'

/**
 * Custom Background section — placeholder UI only (non-functional).
 * Displays the upload area, transparency slider, and blur slider
 * as disabled placeholders for future implementation.
 */
export function CustomBackground() {
  return (
    <Box>
      <Text
        fontSize="xs"
        fontWeight="bold"
        color="gemOnSurfaceVariant"
        textTransform="uppercase"
        letterSpacing="wider"
        mb={4}
      >
        {t('settingPanel.theme.customBackground')}
      </Text>

      {/* Upload area */}
      <Box
        border="2px dashed"
        borderColor="gray.300"
        borderRadius="xl"
        py={8}
        px={4}
        textAlign="center"
        opacity={0.5}
        cursor="not-allowed"
        mb={6}
      >
        <VStack gap={3}>
          <Box color="blue.400" fontSize="2xl">
            <HiOutlineCloudUpload size={32} />
          </Box>
          <Text fontSize="sm" fontWeight="medium" color="gemOnSurface">
            {t('settingPanel.theme.dropBackground')}
          </Text>
          <Text fontSize="xs" color="gray.400">
            {t('settingPanel.theme.fileTypes')}
          </Text>
          <Button
            size="sm"
            variant="outline"
            colorPalette="blue"
            disabled
          >
            {t('settingPanel.theme.selectFile')}
          </Button>
        </VStack>
      </Box>

      {/* Transparency slider (placeholder) */}
      <HStack justify="space-between" mb={2}>
        <Text fontSize="sm" fontWeight="medium" color="gemOnSurface">
          {t('settingPanel.theme.transparency')}
        </Text>
        <Text fontSize="sm" fontWeight="medium" color="blue.400">
          20%
        </Text>
      </HStack>
      <Box
        height="6px"
        bg="gray.200"
        borderRadius="full"
        mb={6}
        position="relative"
        opacity={0.5}
        cursor="not-allowed"
      >
        <Box
          position="absolute"
          left="0"
          top="0"
          height="100%"
          width="20%"
          bg="blue.400"
          borderRadius="full"
        />
        <Box
          position="absolute"
          left="20%"
          top="50%"
          transform="translate(-50%, -50%)"
          width="14px"
          height="14px"
          bg="blue.500"
          borderRadius="full"
          border="2px solid white"
          shadow="sm"
        />
      </Box>

      {/* Blur Intensity slider (placeholder) */}
      <HStack justify="space-between" mb={2}>
        <Text fontSize="sm" fontWeight="medium" color="gemOnSurface">
          {t('settingPanel.theme.blurIntensity')}
        </Text>
        <Text fontSize="sm" fontWeight="medium" color="blue.400">
          8px
        </Text>
      </HStack>
      <Box
        height="6px"
        bg="gray.200"
        borderRadius="full"
        position="relative"
        opacity={0.5}
        cursor="not-allowed"
      >
        <Box
          position="absolute"
          left="0"
          top="0"
          height="100%"
          width="40%"
          bg="blue.400"
          borderRadius="full"
        />
        <Box
          position="absolute"
          left="40%"
          top="50%"
          transform="translate(-50%, -50%)"
          width="14px"
          height="14px"
          bg="blue.500"
          borderRadius="full"
          border="2px solid white"
          shadow="sm"
        />
      </Box>
    </Box>
  )
}
