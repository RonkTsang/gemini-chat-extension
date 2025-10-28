import React from 'react'
import { Box, Text, VStack, Icon, HStack } from '@chakra-ui/react'
import { FiClock, FiZap, FiStar } from 'react-icons/fi'
import type { SettingViewComponent } from '../../types'

export const DefaultIndexView: SettingViewComponent = ({ section }) => (
  <VStack align="stretch" gap={8} height="100%" justify="center">
    {/* Coming Soon Header */}
    <VStack gap={4} textAlign="center">
      <Box
        p={4}
        borderRadius="full"
        bg="blue.50"
        color="blue.500"
        display="flex"
        alignItems="center"
        justifyContent="center"
      >
        <Icon as={FiClock} boxSize={8} />
      </Box>
      
      <VStack gap={2}>
        <Text fontSize="2xl" fontWeight="bold" color="gray.800">
          Coming Soon
        </Text>
        <Text fontSize="lg" color="gray.600" maxW="md">
          We're working hard to bring you amazing new features for {section.title.toLowerCase()}.
        </Text>
      </VStack>
    </VStack>

    {/* Feature Preview Cards */}
    <VStack gap={4} align="stretch">
      <HStack gap={4} justify="center">
        <Box
          p={4}
          borderRadius="lg"
          bg="green.50"
          border="1px solid"
          borderColor="green.200"
          textAlign="center"
          minW="120px"
        >
          <Icon as={FiZap} boxSize={6} color="green.500" mb={2} />
          <Text fontSize="sm" fontWeight="medium" color="green.700">
            Fast & Reliable
          </Text>
        </Box>
        
        <Box
          p={4}
          borderRadius="lg"
          bg="purple.50"
          border="1px solid"
          borderColor="purple.200"
          textAlign="center"
          minW="120px"
        >
          <Icon as={FiStar} boxSize={6} color="purple.500" mb={2} />
          <Text fontSize="sm" fontWeight="medium" color="purple.700">
            Premium Features
          </Text>
        </Box>
      </HStack>
    </VStack>

    {/* Status Message */}
    <Box
      bg="gray.50"
      borderRadius="lg"
      p={6}
      textAlign="center"
      border="1px solid"
      borderColor="gray.200"
    >
      <VStack gap={3}>
        <Text fontSize="md" fontWeight="medium" color="gray.700">
          Stay tuned for updates!
        </Text>
        <Text fontSize="sm" color="gray.500" maxW="sm">
          We'll notify you as soon as new features are available. 
          Thank you for your patience and support.
        </Text>
      </VStack>
    </Box>
  </VStack>
)
