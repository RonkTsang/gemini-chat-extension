import { ChakraProvider } from '@chakra-ui/react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EXTERNAL_LINKS } from '@/common/config'
import { ABOUT_SUPPORT_ANCHOR } from '@/components/setting-panel/views/about/support'
import { system } from '@/components/ui/system'
import { WhatsNewToast } from './WhatsNewToast'

const emitSync = vi.fn()

vi.mock('@/hooks/useEventBus', () => ({
  useEventEmitter: () => ({ emitSync }),
}))

vi.mock('@/utils/i18n', () => ({
  t: (key: string) => key,
}))

describe('WhatsNewToast', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.unstubAllGlobals()
  })

  it('opens the support section in settings and closes the toast when the support link is clicked', async () => {
    const onClose = vi.fn()

    await act(async () => {
      root.render(
        <ChakraProvider value={system}>
          <WhatsNewToast
            version="0.16.0"
            features={[{ titleKey: 'featureTitle', descriptionKey: 'featureDescription' }]}
            onClose={onClose}
          />
        </ChakraProvider>,
      )
    })

    const releaseNotesLink = document.body.querySelector(`a[href="${EXTERNAL_LINKS.RELEASE_NOTES}"]`)
    expect(releaseNotesLink?.textContent).toContain('whatsnew.releaseNotes')

    const buttons = Array.from(document.body.querySelectorAll('button'))
    const supportButton = buttons.find((button) => button.textContent?.includes('whatsnew.supportLink'))
    expect(supportButton).toBeDefined()

    act(() => {
      supportButton!.click()
    })

    expect(emitSync).toHaveBeenCalledWith('settings:open', {
      from: 'whats-new',
      open: true,
      module: 'about',
      params: {
        anchor: ABOUT_SUPPORT_ANCHOR,
        animateSupportBorder: true,
      },
    })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
