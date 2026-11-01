import { keyframes } from '@emotion/react'

// Emotion registers these directly in the Shadow DOM cache, outside Chakra's style normalization.
export const tourEnter = keyframes({
  from: { opacity: 0, transform: 'translateY(4px)' },
  to: { opacity: 1, transform: 'translateY(0)' },
})

export const finishBackdrop = keyframes({ from: { opacity: 0 }, to: { opacity: 1 } })

export const finishEnter = keyframes({
  from: { opacity: 0, transform: 'translateY(10px) scale(0.97)' },
  to: { opacity: 1, transform: 'translateY(0) scale(1)' },
})

export const finishLift = keyframes({
  from: { opacity: 0, transform: 'translateY(8px) rotate(-18deg) scale(0.85)' },
  to: { opacity: 1, transform: 'translateY(0) rotate(-5deg) scale(1)' },
})

export const finishFloat = keyframes({
  '0%, 100%': { transform: 'translate(0, 0) rotate(-5deg) scale(1)' },
  '50%': { transform: 'translate(2px, -5px) rotate(1deg) scale(1.025)' },
})

export const finishSparkle = keyframes({
  '0%, 100%': { opacity: 0.55, transform: 'translateY(2px) rotate(-16deg) scale(0.8)' },
  '50%': { opacity: 1, transform: 'translateY(-4px) rotate(18deg) scale(1.28)' },
})

export const finishSway = keyframes({
  '0%, 100%': { transform: 'rotate(-8deg) scale(1)' },
  '50%': { transform: 'rotate(8deg) scale(1.06)' },
})
