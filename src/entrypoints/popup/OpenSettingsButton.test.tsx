import { act, type PropsWithChildren } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { OpenSettingsButton } from './OpenSettingsButton'
import { SETTINGS_ENTRY_STATUS_KEY } from '@/services/settingsEntryStatus'

const mocks = vi.hoisted(() => ({
  stored: {} as Record<string, unknown>, activeId: 1,
  send: vi.fn(), get: vi.fn(), changed: new Set<(changes: Record<string, unknown>, area: string) => void>(),
  activated: new Set<() => void>(),
}))
vi.mock('wxt/browser', () => ({ browser: {
  runtime: { sendMessage: mocks.send },
  tabs: {
    query: async () => [{ id: mocks.activeId, windowId: 7 }],
    get: mocks.get,
    onActivated: { addListener: (fn: never) => mocks.activated.add(fn), removeListener: (fn: never) => mocks.activated.delete(fn) },
  },
  storage: {
    session: { get: async () => mocks.stored, remove: async (key: string) => { delete mocks.stored[key] } },
    onChanged: { addListener: (fn: never) => mocks.changed.add(fn), removeListener: (fn: never) => mocks.changed.delete(fn) },
  },
} }))
vi.mock('@/utils/i18n', () => ({ t: (key: string) => key }))
vi.mock('@chakra-ui/react', () => {
  const Container = ({ children }: PropsWithChildren) => <div>{children}</div>
  return { Stack: Container, HStack: Container, Text: Container,
    Button: ({ children, onClick, disabled }: PropsWithChildren<{ onClick: () => void; disabled: boolean }>) => <button onClick={onClick} disabled={disabled}>{children}</button> }
})
let root: Root
let container: HTMLDivElement
let close: ReturnType<typeof vi.spyOn>
const result = (phase: 'opening' | 'opened' | 'failed') => ({ sourceTabId: 1, targetTabId: 2, phase, expiresAt: Date.now() + 60_000, error: phase === 'failed' ? 'timeout' : undefined })
async function mount() { await act(async () => root.render(<OpenSettingsButton />)) }
async function update(phase: 'opening' | 'opened' | 'failed') {
  await act(async () => {
    for (const fn of mocks.changed) fn({ [SETTINGS_ENTRY_STATUS_KEY]: { newValue: result(phase) } }, 'session')
  })
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  mocks.stored = {}
  mocks.activeId = 1
  mocks.send.mockReset().mockResolvedValue({ accepted: true })
  mocks.get.mockReset().mockImplementation(async (id: number) => ({ id, windowId: 7, url: 'https://gemini.google.com/app' }))
  close = vi.spyOn(window, 'close').mockImplementation(() => {})
  container = document.createElement('div')
  root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); vi.restoreAllMocks() })
it('ignores old success on reopening without closing the popup', async () => {
  mocks.stored[SETTINGS_ENTRY_STATUS_KEY] = result('opened')
  await mount()
  expect(container.textContent).toBe('popupOpenSettings')
  expect(close).not.toHaveBeenCalled()
})
it('closes only after fresh success for a user click', async () => {
  await mount()
  await act(async () => container.querySelector('button')!.click())
  await update('opening')
  expect(close).not.toHaveBeenCalled()
  await update('opened')
  expect(close).toHaveBeenCalledOnce()
  expect(container.textContent).toBe('popupOpenSettings')
})
it('shows one reload action for the existing Gemini page and clears recovery on unrelated pages', async () => {
  mocks.stored[SETTINGS_ENTRY_STATUS_KEY] = result('failed')
  await mount()
  expect(container.querySelectorAll('button')).toHaveLength(1)
  const reload = container.querySelector('button')!
  expect(reload.textContent).toBe('popupSettingsReload')
  await act(async () => reload.click())
  expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({ tabId: 2, action: 'reload' }))
  mocks.activeId = 99
  await act(async () => { for (const fn of mocks.activated) fn() })
  expect(container.textContent).not.toContain('popupSettingsRetry')
  expect(container.textContent).not.toContain('popupSettingsReload')
  expect(container.textContent).not.toContain('popupSettingsStartFailed')
})
it.each(['timeout', 'target-closed', 'target-left', 'start-failed'])('uses the same failure feedback for %s', async error => {
  mocks.stored[SETTINGS_ENTRY_STATUS_KEY] = { ...result('failed'), error }
  await mount()
  expect(container.textContent).toBe('popupSettingsReloadpopupSettingsStartFailed')
  expect(container.querySelectorAll('button')).toHaveLength(1)
})
it.each(['closed', 'departed'])('keeps reopening available without refreshing a %s Gemini page', async reason => {
  mocks.stored[SETTINGS_ENTRY_STATUS_KEY] = result('failed')
  if (reason === 'closed') mocks.get.mockRejectedValue(new Error('closed'))
  else mocks.get.mockResolvedValue({ id: 2, windowId: 7, url: 'https://example.com' })
  await mount()
  expect(container.textContent).toBe('popupSettingsRetrypopupSettingsStartFailed')
  expect(container.querySelectorAll('button')).toHaveLength(1)
  await act(async () => container.querySelector('button')!.click())
  expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({ tabId: 1, action: 'retry' }))
})
it('restarts normally after a rejected start without a saved target', async () => {
  mocks.send.mockResolvedValueOnce({ accepted: false, error: 'start-failed' })
  await mount()
  await act(async () => container.querySelector('button')!.click())
  expect(container.textContent).toBe('popupSettingsRetrypopupSettingsStartFailed')
  await act(async () => container.querySelector('button')!.click())
  expect(mocks.send).toHaveBeenLastCalledWith(expect.objectContaining({ tabId: 1, action: 'open' }))
})
it('shows only opening and prevents duplicate clicks even on another tab', async () => {
  mocks.stored[SETTINGS_ENTRY_STATUS_KEY] = result('opening')
  mocks.activeId = 99
  await mount()
  const button = container.querySelector('button')!
  expect(button.disabled).toBe(true)
  expect(container.textContent).toBe('popupOpeningSettings')
  await act(async () => button.click())
  expect(mocks.send).not.toHaveBeenCalled()
})
it('maps a busy rejection to the existing opening state', async () => {
  await mount()
  mocks.stored[SETTINGS_ENTRY_STATUS_KEY] = result('opening')
  mocks.send.mockResolvedValue({ accepted: false, error: 'busy' })
  await act(async () => container.querySelector('button')!.click())
  expect(container.textContent).toBe('popupOpeningSettings')
  expect(container.querySelector('button')!.disabled).toBe(true)
})
it('reloads only the saved Gemini tab on explicit user action', async () => {
  mocks.stored[SETTINGS_ENTRY_STATUS_KEY] = result('failed')
  await mount()
  const reload = [...container.querySelectorAll('button')].find(button => button.textContent === 'popupSettingsReload')!
  await act(async () => reload.click())
  expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({ tabId: 2, action: 'reload' }))
})
it('leaves background work alone and removes popup subscriptions on unmount', async () => {
  await mount()
  await act(async () => container.querySelector('button')!.click())
  await act(async () => root.unmount())
  expect(mocks.changed.size).toBe(0)
  expect(mocks.activated.size).toBe(0)
  expect(mocks.send).toHaveBeenCalledOnce()
})
