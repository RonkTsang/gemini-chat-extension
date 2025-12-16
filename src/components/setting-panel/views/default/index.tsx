import React, { useState, useEffect } from 'react'
import { Box, Text, VStack, Button, Center } from '@chakra-ui/react'
import { useColorModeValue } from '@/components/ui/color-mode'
import { TimelineRoot, TimelineItem, TimelineConnector, TimelineContent, TimelineIndicator, TimelineSeparator } from '@/components/ui/timeline'
import { keyframes } from '@emotion/react'
import { FiCheck, FiZap } from 'react-icons/fi'
import type { SettingViewComponent } from '../../types'
import { call } from '@/utils/bridge'

// Pulse animation for the active step
const pulse = keyframes`
  0% { box-shadow: 0 0 0 0 rgba(66, 153, 225, 0.4); }
  70% { box-shadow: 0 0 0 10px rgba(66, 153, 225, 0); }
  100% { box-shadow: 0 0 0 0 rgba(66, 153, 225, 0); }
`

// Float animation for flying emojis
const floatUp = keyframes`
  0% { transform: translateY(0) scale(0.5); opacity: 1; }
  100% { transform: translateY(-100px) scale(1.2); opacity: 0; }
`

const LOADING_MESSAGES = [
  "Polishing pixels...",
  "Brewing coffee for AI...",
  "Connecting neurons...",
  "Stacking divs...",
  "Catching bugs...",
  "Training hamsters...",
  "Centering things...",
]

export const DefaultIndexView: SettingViewComponent = ({ section }) => {
  const [messageIndex, setMessageIndex] = useState(0)
  const [boosts, setBoosts] = useState<{ id: number; emoji: string; left: number }[]>([])
  const [hasBoosted, setHasBoosted] = useState(false)

  // Color Mode Values
  const titleColor = useColorModeValue("gray.700", "whiteAlpha.900")
  const subtitleColor = useColorModeValue("gray.500", "whiteAlpha.600")
  const activeTextColor = useColorModeValue("gray.800", "white")
  const inactiveTextColor = useColorModeValue("gray.400", "gray.600")

  // Rotate loading messages
  useEffect(() => {
    const interval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % LOADING_MESSAGES.length)
    }, 3000)
    return () => clearInterval(interval)
  }, [])

  // Handle boost click
  const handleBoost = () => {
    setHasBoosted(true)
    const emojis = ['🚀', '✨', '🔥', '⚡️', '💫', '🌟']
    const newBoosts = Array.from({ length: 5 }).map((_, i) => ({
      id: Date.now() + i,
      emoji: emojis[Math.floor(Math.random() * emojis.length)],
      left: Math.random() * 80 - 40, // Random spread -40px to 40px
    }))
    setBoosts((prev) => [...prev, ...newBoosts])

    // Cleanup emojis after animation
    setTimeout(() => {
      setBoosts((prev) => prev.filter((b) => !newBoosts.find((nb) => nb.id === b.id)))
    }, 1000)

    void call('analytics.fireEvent', {
      name: 'boost_clicked',
      params: {
        feature: section.title,
      },
    });
  }

  return (
    <Center h="100%" w="100%" p={8} position="relative" overflow="hidden">
      <VStack gap={8} w="full" maxW="sm">
        {/* Header */}
        <VStack gap={2}>
          <Text fontSize="lg" fontWeight="bold" color={titleColor}>
            {section.title}
          </Text>
          <Text fontSize="sm" color={subtitleColor}>
            Is on the way 💦
          </Text>
        </VStack>

        {/* Timeline */}
        <TimelineRoot maxW="400px">
          {/* Step 1: Design & Concept (Completed) */}
          <TimelineItem>
            <TimelineConnector>
              <TimelineSeparator />
              <TimelineIndicator bg="green.500" color="white" borderColor="green.500">
                <FiCheck />
              </TimelineIndicator>
            </TimelineConnector>
            <TimelineContent>
              <Text fontWeight="medium" color={inactiveTextColor} fontSize="sm">
                Design & Concept
              </Text>
              <Text color={inactiveTextColor} fontSize="xs">
                Completed
              </Text>
            </TimelineContent>
          </TimelineItem>

          {/* Step 2: Development (Active) */}
          <TimelineItem>
            <TimelineConnector>
              <TimelineSeparator />
              <TimelineIndicator 
                bg="blue.500" 
                borderColor="blue.500" 
                animation={`${pulse} 2s infinite`}
              >
                <Box w="2" h="2" bg="white" borderRadius="full" />
              </TimelineIndicator>
            </TimelineConnector>
            <TimelineContent>
              <Text fontWeight="bold" color={activeTextColor} fontSize="sm">
                Development
              </Text>
              <Text color="blue.500" fontSize="xs" minW="140px">
                {LOADING_MESSAGES[messageIndex]}
              </Text>
            </TimelineContent>
          </TimelineItem>

          {/* Step 3: Launch (Pending) */}
          <TimelineItem>
            <TimelineIndicator borderColor={inactiveTextColor}>
            </TimelineIndicator>
            <TimelineContent>
              <Text color={inactiveTextColor} fontSize="sm">
                Launch
              </Text>
              <Text color={inactiveTextColor} fontSize="xs">
                Pending
              </Text>
            </TimelineContent>
          </TimelineItem>
        </TimelineRoot>

        {/* Interactive Boost Button */}
        <Box position="relative">
          <Button
            size="sm"
            variant={hasBoosted ? "outline" : "solid"}
            colorPalette={hasBoosted ? "gray" : "blue"}
            onClick={handleBoost}
            transition="all 0.2s"
            _hover={{ transform: 'translateY(-2px)' }}
            _active={{ transform: 'translateY(0)' }}
          >
            <FiZap />
            {hasBoosted ? "I'm on it, fam!" : "Boost Speed"}
          </Button>
          
          {/* Flying Emojis */}
          {boosts.map((boost) => (
            <Box
              key={boost.id}
              position="absolute"
              left="50%"
              top="0"
              ml={`${boost.left}px`}
              pointerEvents="none"
              animation={`${floatUp} 1s ease-out forwards`}
              fontSize="xl"
            >
              {boost.emoji}
            </Box>
          ))}
        </Box>
      </VStack>
    </Center>
  )
}
