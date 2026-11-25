import { ChakraProvider } from '@chakra-ui/react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { EXTERNAL_LINKS } from '@/common/config'
import { system } from '@/components/ui/system'
import { setActiveSection } from '@/stores/settingStore'
import { registerView } from './config'
import { ContentArea } from './ContentArea'
import { Sidebar } from './Sidebar'
import { AboutView } from './views/about'

vi.mock('@/components/icons', () => ({ ImagePromptIcon: () => null }))
vi.mock('@/utils/i18n', () => ({ t: (key: string) => key }))

it('opens the support card with the appropriate emphasis for keyboard and pointer navigation', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const scrollIntoView = vi.spyOn(HTMLElement.prototype, 'scrollIntoView')
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)

  try {
    registerView('enhancements/index', () => null)
    registerView('about/index', AboutView)
    setActiveSection('enhancements')
    await act(async () => {
      root.render(
        <ChakraProvider value={system}>
          <Sidebar />
          <ContentArea />
        </ChakraProvider>,
      )
    })

    const buttons = Array.from(container.querySelectorAll('button'))
    const supportButton = buttons.find((button) => button.textContent === 'aboutPage.donate.title')!
    const aboutButton = buttons.find((button) => button.textContent === 'settingPanel.config.about.title')!

    act(() => supportButton.click())

    const heading = container.querySelector('h3')
    const supportSection = heading!.closest('section')!
    expect(heading?.textContent).toBe('aboutPage.donate.title')
    expect(document.activeElement).toBe(heading)
    expect(scrollIntoView.mock.instances).toContain(supportSection)
    expect(supportSection.hasAttribute('data-support-emphasis')).toBe(true)
    expect(supportButton.getAttribute('aria-current')).toBe('true')
    expect(aboutButton.hasAttribute('aria-current')).toBe(false)
    expect(supportSection?.querySelector(`a[href="${EXTERNAL_LINKS.REVIEW}"]`)?.textContent)
      .toBe('aboutPage.feedback.leaveReview')
    expect(supportSection?.querySelector(`a[href="${EXTERNAL_LINKS.COFFEE}"] img`)?.getAttribute('alt')).toBe('')
    expect(container.querySelector(`a[href="${EXTERNAL_LINKS.HELP}"]`)?.textContent)
      .toBe('aboutPage.feedback.bugSupport')
    expect(supportSection?.querySelector(`a[href="${EXTERNAL_LINKS.HELP}"]`)).toBeNull()

    act(() => aboutButton.click())
    expect(aboutButton.getAttribute('aria-current')).toBe('true')
    expect(supportButton.hasAttribute('aria-current')).toBe(false)
    expect(supportSection.hasAttribute('data-support-emphasis')).toBe(false)
    expect(scrollIntoView).toHaveBeenCalledTimes(1)

    const trace = supportSection.querySelector('[aria-hidden="true"] > div')!
    const cancel = vi.fn()
    const animate = vi.fn(() => ({ cancel }))
    Object.assign(trace, { animate })
    vi.spyOn(CSS, 'supports').mockReturnValue(true)
    const motion = window.matchMedia('(prefers-reduced-motion: no-preference)')
    const allowsMotion = vi.spyOn(motion, 'matches', 'get').mockReturnValue(true)
    vi.spyOn(window, 'matchMedia').mockReturnValue(motion)
    const clickSupport = () => act(() => {
      supportButton.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }))
    })

    clickSupport()
    expect(animate).toHaveBeenCalledTimes(1)
    expect(supportSection.hasAttribute('data-support-emphasis')).toBe(false)

    clickSupport()
    expect(animate).toHaveBeenCalledTimes(2)
    expect(cancel).toHaveBeenCalledTimes(1)

    allowsMotion.mockReturnValue(false)
    motion.dispatchEvent(new Event('change'))
    expect(cancel).toHaveBeenCalledTimes(2)
    expect(supportSection.hasAttribute('data-support-emphasis')).toBe(true)

    clickSupport()
    expect(animate).toHaveBeenCalledTimes(2)
    expect(supportSection.hasAttribute('data-support-emphasis')).toBe(true)
    act(() => aboutButton.click())
    expect(supportSection.hasAttribute('data-support-emphasis')).toBe(false)
  } finally {
    act(() => root.unmount())
    container.remove()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  }
})
