import { ChakraProvider, EnvironmentProvider, defaultSystem } from '@chakra-ui/react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'

import { SettingsToaster, settingsToaster } from './toaster'

afterEach(() => {
  settingsToaster.remove()
  vi.restoreAllMocks()
})

it('portals toast above the panel within its Shadow DOM, tracks its bounds, and clears on close', async () => {
  const host = document.createElement('div')
  document.body.append(host)
  const shadow = host.attachShadow({ mode: 'open' })
  const mount = document.createElement('div')
  const anchor = document.createElement('div')
  shadow.append(mount, anchor)
  const bounds = vi.spyOn(anchor, 'getBoundingClientRect')
  bounds.mockReturnValue(new DOMRect(100, 50, 1000, 800))
  const root = createRoot(mount)
  const render = (open: boolean) => root.render(
    <EnvironmentProvider value={() => shadow}>
      <ChakraProvider value={defaultSystem}>
        <SettingsToaster anchor={anchor} open={open} />
      </ChakraProvider>
    </EnvironmentProvider>,
  )
  try {
    await act(async () => render(true))
    await act(async () => { settingsToaster.create({ type: 'success', closable: true, title: 'Folder organization restored.' }) })
    const region = shadow.querySelector<HTMLElement>('[data-scope="toast"][data-part="group"]')!
    expect(region).not.toBeNull()
    expect(mount.contains(region)).toBe(false)
    expect(region.style.position).toBe('fixed')
    expect(region.style.top).toBe('66px')
    expect(region.style.left).toBe('600px')
    expect(region.textContent).toContain('Folder organization restored.')
    expect(anchor.textContent).toBe('')
    expect(region.querySelector('[data-part="close-trigger"]')).not.toBeNull()

    bounds.mockReturnValue(new DOMRect(0, 20, 320, 600))
    await act(async () => window.dispatchEvent(new Event('resize')))
    expect(region.style.top).toBe('36px')
    expect(region.style.left).toBe('160px')
    expect(region.style.width).toBe('288px')

    await act(async () => render(false))
    expect(shadow.querySelector('[data-scope="toast"][data-part="group"]')).toBeNull()
    expect(settingsToaster.getCount()).toBe(0)
  } finally {
    await act(async () => root.unmount())
    host.remove()
  }
})
