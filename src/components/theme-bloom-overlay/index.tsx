import { useEffect, useState } from 'react'
import { toaster } from '@/components/ui/toaster'
import type { ThemeBloomVisualState } from '@/common/event'
import { useEvent } from '@/hooks/useEventBus'
import { tt } from '@/utils/i18n'

const IDLE_STATE: ThemeBloomVisualState = { state: 'idle' }

const overlayStyles = `
  .gpk-theme-bloom-overlay {
    position: fixed;
    inset: 0;
    z-index: 2147483647;
    pointer-events: none;
    overflow: hidden;
    color: #fff;
    font-family: Google Sans, Inter, system-ui, sans-serif;
  }

  .gpk-theme-bloom-edge {
    position: absolute;
    inset: 0;
    border: 2px solid color-mix(in srgb, var(--gpk-theme-bloom-color), transparent 35%);
    box-shadow: inset 0 0 40px color-mix(in srgb, var(--gpk-theme-bloom-color), transparent 68%);
    animation: gpk-theme-bloom-edge 1.4s ease-in-out infinite alternate;
  }

  .gpk-theme-bloom-seed {
    position: absolute;
    width: 34px;
    height: 34px;
    border-radius: 50%;
    transform: translate(-50%, -50%);
    background: var(--gpk-theme-bloom-color);
    box-shadow:
      0 0 0 7px color-mix(in srgb, var(--gpk-theme-bloom-color), transparent 72%),
      0 0 34px 12px color-mix(in srgb, var(--gpk-theme-bloom-color), transparent 55%);
  }

  .gpk-theme-bloom-seed[data-phase="analyzing"] {
    animation: gpk-theme-bloom-pulse 900ms ease-in-out infinite;
  }

  .gpk-theme-bloom-copy {
    position: absolute;
    transform: translate(-50%, calc(-100% - 28px));
    padding: 8px 12px;
    border: 1px solid rgb(255 255 255 / 24%);
    border-radius: 999px;
    background: rgb(20 20 20 / 76%);
    box-shadow: 0 8px 24px rgb(0 0 0 / 18%);
    font-size: 13px;
    font-weight: 600;
    letter-spacing: .01em;
    white-space: nowrap;
    backdrop-filter: blur(10px);
  }

  .gpk-theme-bloom-aura {
    position: absolute;
    width: 440px;
    height: 440px;
    border-radius: 50%;
    transform: translate3d(-50%, -50%, 0) scale(.06);
    transform-origin: center;
    will-change: transform, opacity;
    background: radial-gradient(circle, color-mix(in srgb, var(--gpk-theme-bloom-color), white 24%) 0%, color-mix(in srgb, var(--gpk-theme-bloom-color), transparent 36%) 30%, transparent 72%);
    animation: gpk-theme-bloom-aura 500ms cubic-bezier(.22, .61, .36, 1) both;
  }

  @keyframes gpk-theme-bloom-edge {
    from { opacity: .45; }
    to { opacity: .9; }
  }

  @keyframes gpk-theme-bloom-pulse {
    0%, 100% { transform: translate(-50%, -50%) scale(.88); }
    50% { transform: translate(-50%, -50%) scale(1.12); }
  }

  @keyframes gpk-theme-bloom-aura {
    0% { transform: translate3d(-50%, -50%, 0) scale(.06); opacity: 0; }
    14% { opacity: .9; }
    68% { transform: translate3d(-50%, -50%, 0) scale(1); opacity: .34; }
    100% { transform: translate3d(-50%, -50%, 0) scale(1.55); opacity: 0; }
  }

  @media (prefers-reduced-motion: reduce) {
    .gpk-theme-bloom-edge,
    .gpk-theme-bloom-seed[data-phase="analyzing"],
    .gpk-theme-bloom-aura {
      animation-duration: 120ms;
      animation-iteration-count: 1;
    }

    .gpk-theme-bloom-aura {
      animation-name: gpk-theme-bloom-aura-reduced;
    }
  }

  @keyframes gpk-theme-bloom-aura-reduced {
    from { opacity: 0; }
    50% { opacity: .22; }
    to { opacity: 0; }
  }
`

export function ThemeBloomOverlay() {
  const [visualState, setVisualState] = useState<ThemeBloomVisualState>(IDLE_STATE)

  useEvent('theme-bloom:state-change', (nextState) => {
    setVisualState(nextState)
  })

  useEffect(() => {
    if (visualState.state !== 'error' || !visualState.message) return
    toaster.create({ type: 'error', title: visualState.message })
  }, [visualState])

  const { state, origin, accentColor = '#4285f4' } = visualState

  if (
    state === 'idle'
    || state === 'error'
    || state === 'over-native-upload'
    || !origin
  ) {
    return null
  }

  const style = {
    '--gpk-theme-bloom-color': accentColor,
  } as React.CSSProperties
  const position = {
    left: origin.clientX,
    top: origin.clientY,
  }
  const isTransitioning = state === 'transitioning'
  const copy = state === 'analyzing'
    ? tt('settingPanel.theme.themeBloom.analyzing', 'Matching your theme…')
    : tt('settingPanel.theme.themeBloom.dropHint', 'Drop to apply theme')

  return (
    <div className="gpk-theme-bloom-overlay" style={style} aria-hidden="true">
      <style>{overlayStyles}</style>
      {!isTransitioning && <div className="gpk-theme-bloom-edge" />}
      <div
        className="gpk-theme-bloom-seed"
        data-phase={state}
        style={position}
      />
      {!isTransitioning && (
        <div className="gpk-theme-bloom-copy" style={position}>
          {copy}
        </div>
      )}
      {isTransitioning && (
        <div className="gpk-theme-bloom-aura" style={position} />
      )}
    </div>
  )
}
