import { Box, Button, CloseButton, Heading, Link, Text, VStack } from '@chakra-ui/react'
import { useEffect, useId, useRef } from 'react'
import { LuArrowRight, LuArrowUpRight } from 'react-icons/lu'
import { PRODUCT_NAME } from '@/common/config'
import { eventBus } from '@/utils/eventbus'
import { getCurrentLocale, t } from '@/utils/i18n'
import { finishEnter, finishFloat, finishLift, finishSparkle, finishSway } from './animations'

const resources = [
  { key: 'guide', emoji: '📖', path: '/guide/quick-start/' },
  { key: 'support', emoji: '💬', path: '/support/' },
] as const

export function FinishCard({ onFinish }: { onFinish: () => void }) {
  const buttonRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const descriptionId = useId()
  const prefix = getCurrentLocale().replace('_', '-').toLowerCase().startsWith('zh-cn')
    ? '/zh-cn' : ''

  useEffect(() => { buttonRef.current?.focus() }, [])

  return (
    <Box
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      data-gpk-onboarding="finish"
      position="relative" bg="bg.panel" color="fg" borderWidth="1px" borderColor="border.emphasized"
      borderRadius="2xl" shadow="2xl" p={{ base: 5, md: 7 }} w="400px" maxW="calc(100vw - 32px)"
      maxH="calc(100dvh - 32px)" overflowY="auto"
      css={{
        animation: `${finishEnter} 220ms cubic-bezier(0.23, 1, 0.32, 1) both`,
        '& [data-finish-entrance]': {
          animation: `${finishEnter} 200ms cubic-bezier(0.23, 1, 0.32, 1) both`,
          animationDelay: '60ms',
        },
        '& [data-finish-entrance="action"]': { animationDelay: '100ms' },
        '& [data-finish-emoji]': { animation: `${finishLift} 260ms cubic-bezier(0.23, 1, 0.32, 1) both` },
        '& [data-finish-emoji="rocket"]': {
          animation: `${finishLift} 260ms cubic-bezier(0.23, 1, 0.32, 1) both, ${finishFloat} 2.8s ease-in-out 260ms infinite`,
        },
        '& [data-finish-emoji^="star"]': { animation: `${finishSparkle} 2.4s ease-in-out infinite` },
        '& [data-finish-emoji="star-small"]': { animationDelay: '-1.2s' },
        '& [data-finish-badge]': { animation: `${finishSway} 3.6s ease-in-out infinite` },
        '@media (prefers-reduced-motion: reduce)': {
          animation: 'none',
          '& [data-finish-entrance], & [data-finish-emoji], & [data-finish-badge]': { animation: 'none' },
        },
      }}
    >
      <CloseButton position="absolute" top={2} right={2} size="sm" aria-label={t('onboarding.skip')} onClick={onFinish} />
      <Text textAlign="center" fontSize="xs" fontWeight="medium" color="fg.muted" letterSpacing="0.04em" mt={1}>
        {PRODUCT_NAME}
      </Text>
      <Box aria-hidden="true" position="relative" w="80px" h="80px" mx="auto" mt={5} mb={5}
        display="grid" placeItems="center">
        <Box position="absolute" inset={0} bg="colorPalette.subtle" borderRadius="3xl" transform="rotate(-8deg)" data-finish-badge />
        <Box as="span" position="relative" fontSize="44px" lineHeight={1} data-finish-emoji="rocket">🚀</Box>
        <Box as="span" position="absolute" right="-12px" top="-4px" fontSize="22px" data-finish-emoji="stars">✨</Box>
        <Box as="span" position="absolute" left="-9px" bottom="4px" fontSize="15px" color="colorPalette.fg" data-finish-emoji="star-small">✦</Box>
      </Box>
      <Heading as="h2" id={titleId} fontSize="2xl" lineHeight="1.25" fontWeight="semibold" letterSpacing="-0.025em" textAlign="center">
        {t('onboarding.finish.title')}
      </Heading>
      <Text id={descriptionId} fontSize="sm" color="fg.muted" lineHeight="1.65" textAlign="center" mt={3}>
        {t('onboarding.finish.description')}
      </Text>
      <VStack align="stretch" gap={2} mt={6} data-finish-entrance="resources">
        {resources.map(resource => (
          <Link key={resource.key} href={`https://gpk.ronktsang.com${prefix}${resource.path}`}
            target="_blank" rel="noopener noreferrer" display="flex" alignItems="center" gap={3} p={3}
            bg="bg.subtle" borderWidth="1px" borderColor="border.subtle" borderRadius="xl" textDecoration="none"
            transition="transform 160ms cubic-bezier(0.23, 1, 0.32, 1), background-color 160ms ease, border-color 160ms ease"
            _hover={{ bg: 'bg.muted', borderColor: 'border.emphasized', textDecoration: 'none', transform: 'translateY(-1px)' }}
            _active={{ transform: 'translateY(0)' }}
            css={{ '@media (prefers-reduced-motion: reduce)': { transition: 'none', transform: 'none' } }}>
            <Box as="span" aria-hidden="true" fontSize="24px" lineHeight={1} flexShrink={0}>{resource.emoji}</Box>
            <Box flex={1}>
              <Text fontSize="sm" fontWeight="medium">{t(`onboarding.${resource.key}`)}</Text>
              <Text fontSize="xs" color="fg.muted" mt={0.5}>{t(`onboarding.finish.${resource.key}Description`)}</Text>
            </Box>
            <LuArrowUpRight aria-hidden="true" size={16} />
          </Link>
        ))}
      </VStack>
      <Button ref={buttonRef} size="lg" w="full" mt={5} onClick={() => {
        onFinish()
        void eventBus.emit('settings:open', { open: true, from: 'onboarding', module: 'enhancements' })
      }} data-finish-entrance="action">
        {t('onboarding.done')}
        <LuArrowRight aria-hidden="true" />
      </Button>
    </Box>
  )
}
