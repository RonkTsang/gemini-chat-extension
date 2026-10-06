import { act, StrictMode, type PropsWithChildren } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { SettingPanel } from './index'
import { eventBus } from '@/utils/eventbus'
import { SETTINGS_OPEN_PANEL_MESSAGE } from '@/types/runtime-messages'

const mocks = vi.hoisted(() => ({ listeners: new Set<(message: unknown, sender: { id: string }, reply: (value: unknown) => void) => unknown>(), section: vi.fn() }))
vi.mock('wxt/browser', () => ({ browser: { runtime: {
  id: 'extension', onMessage: {
    addListener: (listener: never) => mocks.listeners.add(listener),
    removeListener: (listener: never) => mocks.listeners.delete(listener),
  },
} } }))
vi.mock('./views', () => ({ registerDefaultViews: vi.fn() }))
vi.mock('./Sidebar', () => ({ Sidebar: () => null }))
vi.mock('./ContentArea', () => ({ ContentArea: () => null }))
vi.mock('@/stores/settingStore', () => ({ setActiveSection: mocks.section }))
vi.mock('@chakra-ui/react', () => {
  const Container = ({ children }: PropsWithChildren) => <div>{children}</div>
  return {
    CloseButton: () => null, Portal: Container, Flex: Container, Box: Container,
    Dialog: { Root: ({ open, children }: PropsWithChildren<{ open: boolean }>) => <div data-open={open}>{children}</div>,
      Backdrop: Container, Positioner: Container, Content: Container, Header: Container, Body: Container, CloseTrigger: Container },
  }
})
let root: Root
let container: HTMLDivElement
beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.clearAllMocks()
  container = document.createElement('div')
  root = createRoot(container)
  await act(async () => root.render(<StrictMode><SettingPanel /></StrictMode>))
})
afterEach(async () => { await act(async () => root.unmount()) })
function request(reply: (value: unknown) => void, expiresAt = Date.now() + 1000, id = 'extension') {
  return [...mocks.listeners][0]({ type: SETTINGS_OPEN_PANEL_MESSAGE, expiresAt }, { id }, reply)
}
it('subscribes before receiving and confirms only after React commits', async () => {
  const reply = vi.fn()
  await act(async () => {
    expect(request(reply)).toBe(true)
    expect(reply).not.toHaveBeenCalled()
  })
  expect(container.querySelector('[data-open="true"]')).not.toBeNull()
  expect(reply).toHaveBeenCalledWith({ opened: true })
  expect(mocks.section).toHaveBeenCalledWith('enhancements')
})
it('preserves the active section when already open', async () => {
  await act(async () => { eventBus.emitSync('settings:open', { from: 'popup', open: true, module: 'quickFollowup' }) })
  mocks.section.mockClear()
  const reply = vi.fn()
  request(reply)
  expect(reply).toHaveBeenCalledWith({ opened: true })
  expect(mocks.section).not.toHaveBeenCalled()
})
it('ignores expired or foreign requests', () => {
  const reply = vi.fn()
  request(reply, Date.now() - 1)
  expect(reply).toHaveBeenCalledWith({ opened: false })
  reply.mockClear()
  request(reply, Date.now() + 1000, 'foreign')
  expect(reply).not.toHaveBeenCalled()
  expect(mocks.section).not.toHaveBeenCalled()
})
it('keeps one listener after StrictMode remount and cleans it on unmount', async () => {
  expect(mocks.listeners.size).toBe(1)
  await act(async () => root.unmount())
  expect(mocks.listeners.size).toBe(0)
})

it('settles a pending reply on replacement and unmount', async () => {
  const first = vi.fn()
  const second = vi.fn()
  await act(async () => {
    request(first)
    request(second)
    expect(first).toHaveBeenCalledWith({ opened: false })
    root.unmount()
  })
  expect(second).toHaveBeenCalledWith({ opened: false })
  expect(mocks.listeners.size).toBe(0)
})
