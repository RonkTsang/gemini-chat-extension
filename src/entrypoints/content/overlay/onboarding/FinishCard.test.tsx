import { ChakraProvider, defaultSystem } from '@chakra-ui/react'
import createCache from '@emotion/cache'
import { CacheProvider } from '@emotion/react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { eventBus } from '@/utils/eventbus'
import { FinishCard } from './FinishCard'
import { finishEnter, finishFloat, finishLift, finishSparkle, finishSway } from './animations'

vi.mock('@/utils/i18n', () => ({ t: (key: string) => key, getCurrentLocale: () => 'en' }))

it('emits real animation keyframes through Chakra instead of normalizing them as style properties', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  const cache = createCache({ key: 'onboarding-test', speedy: false })
  try {
    act(() => root.render(
      <CacheProvider value={cache}>
        <ChakraProvider value={defaultSystem}>
          <FinishCard onFinish={() => undefined} />
        </ChakraProvider>
      </CacheProvider>,
    ))
    const css = cache.sheet.tags.map(tag => tag.textContent).join('')
    for (const animation of [finishEnter, finishFloat, finishLift, finishSparkle, finishSway]) {
      expect(css).toContain(`@keyframes ${animation.name}{`)
    }
    expect(css).toMatch(/prefers-reduced-motion:\s*reduce/)
  } finally {
    act(() => root.unmount())
    cache.sheet.flush()
    container.remove()
    vi.unstubAllGlobals()
  }
})

it('opens enhancements after completing the tour, while closing only dismisses it', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  const onFinish = vi.fn()
  const onOpen = vi.fn(() => expect(onFinish).toHaveBeenCalled())
  const unsubscribe = eventBus.on('settings:open', onOpen)
  try {
    act(() => root.render(
      <ChakraProvider value={defaultSystem}>
        <FinishCard onFinish={onFinish} />
      </ChakraProvider>,
    ))
    act(() => container.querySelector<HTMLButtonElement>('[aria-label="onboarding.skip"]')!.click())
    expect(onFinish).toHaveBeenCalledTimes(1)
    expect(onOpen).not.toHaveBeenCalled()

    act(() => container.querySelector<HTMLButtonElement>('[data-finish-entrance="action"]')!.click())
    expect(onFinish).toHaveBeenCalledTimes(2)
    expect(onOpen).toHaveBeenCalledExactlyOnceWith({ open: true, from: 'onboarding', module: 'enhancements' })
  } finally {
    act(() => root.unmount())
    unsubscribe()
    container.remove()
    vi.unstubAllGlobals()
  }
})
