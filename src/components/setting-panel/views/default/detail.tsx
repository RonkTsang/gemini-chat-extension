import React from 'react'
import { Box, Button, HStack, Text, VStack, Icon } from '@chakra-ui/react'
import { FiArrowLeft, FiInfo } from 'react-icons/fi'
import type { SettingViewComponent } from '../../types'

export const DefaultDetailView: SettingViewComponent = ({ section, goBack }) => (
  <VStack align="stretch" gap={6} height="100%">
    <Box
      flex={1}
      borderRadius="lg"
      p={8}
      display="flex"
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      textAlign="center"
      bg="gray.50"
      border="1px solid"
      borderColor="gray.200"
    >
      <VStack gap={4} maxW="md">
        <Box
          p={3}
          borderRadius="full"
          bg="orange.50"
          color="orange.500"
          display="flex"
          alignItems="center"
          justifyContent="center"
        >
          <Icon as={FiInfo} boxSize={6} />
        </Box>
        
        <VStack gap={2}>
          <Text fontSize="xl" fontWeight="bold" color="gray.800">
            Feature in Development
          </Text>
          <Text color="gray.600" fontSize="md">
            This {section.title.toLowerCase()} feature is currently being developed and will be available soon.
          </Text>
        </VStack>
        
        <Box
          bg="blue.50"
          borderRadius="md"
          p={4}
          border="1px solid"
          borderColor="blue.200"
          w="full"
        >
          <Text fontSize="sm" color="blue.700" fontWeight="medium">
            🚀 What to expect:
          </Text>
          <Text fontSize="sm" color="blue.600" mt={1}>
            Advanced configuration options, enhanced user experience, and powerful new capabilities.
          </Text>
        </Box>
      </VStack>
    </Box>
  </VStack>
)
