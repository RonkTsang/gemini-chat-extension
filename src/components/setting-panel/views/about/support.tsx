import { Box, Icon } from '@chakra-ui/react'
import { FaHeart } from 'react-icons/fa'
import type { Ref } from 'react'
import { useColorModeValue } from '@/components/ui/color-mode'

export const ABOUT_SUPPORT_ANCHOR = 'support-project'

export function SupportProjectIcon() {
  const color = useColorModeValue('pink.600', 'pink.400')
  return (
    <Icon as={FaHeart} boxSize="20px" color={color} aria-hidden="true" />
  )
}

export function SupportBorderTrace({ traceRef }: { traceRef: Ref<HTMLDivElement> }) {
  return (
    <Box
      aria-hidden="true"
      position="absolute"
      inset="-1px"
      zIndex={-1}
      borderRadius="inherit"
      overflow="hidden"
      pointerEvents="none"
      css={{
        containerType: 'size',
        padding: '1.5px',
        mask: 'linear-gradient(black 0 0) content-box, linear-gradient(black 0 0)',
        maskComposite: 'exclude',
      }}
    >
      <Box
        ref={traceRef}
        position="absolute"
        top="50%"
        left="50%"
        w="calc(100cqw + 100cqh)"
        aspectRatio={1}
        opacity={0}
        css={{
          translate: '-50% -50%',
          background: `conic-gradient(
            transparent 0deg 305deg,
            color-mix(in srgb, var(--support-border-highlight) 36%, transparent) 332deg,
            var(--support-border-highlight) 354deg,
            transparent 360deg
          )`,
        }}
      />
    </Box>
  )
}

export function emphasizeSupportBorder(card: HTMLElement, trace: HTMLElement, animate: boolean): () => void {
  const motion = window.matchMedia('(prefers-reduced-motion: no-preference)')
  const showStaticBorder = () => card.setAttribute('data-support-emphasis', '')
  const clearStaticBorder = () => card.removeAttribute('data-support-emphasis')

  if (!animate || !motion.matches || typeof trace.animate !== 'function'
    || !CSS.supports('mask-composite: exclude') || !CSS.supports('width: 1cqw')) {
    showStaticBorder()
    return clearStaticBorder
  }

  const animation = trace.animate([
    { rotate: '0turn', opacity: 0 },
    { rotate: '0.07turn', opacity: 1, offset: 0.07 },
    { rotate: '0.85turn', opacity: 1, offset: 0.85 },
    { rotate: '1turn', opacity: 0 },
  ], { duration: 820 })

  const handleMotionChange = () => {
    if (!motion.matches) {
      animation.cancel()
      showStaticBorder()
    }
  }
  motion.addEventListener('change', handleMotionChange)

  return () => {
    motion.removeEventListener('change', handleMotionChange)
    animation.cancel()
    clearStaticBorder()
  }
}
