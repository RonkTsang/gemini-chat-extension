import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { browser } from 'wxt/browser'
import { startSettingsEntry } from './settingsEntry'
import { readSettingsEntryStatus, SETTINGS_ENTRY_STATUS_KEY } from '@/services/settingsEntryStatus'
import { SETTINGS_OPEN_FROM_POPUP_MESSAGE } from '@/types/runtime-messages'

const mocks = vi.hoisted(() => ({
  stored: {} as Record<string, unknown>,
  get: vi.fn(), query: vi.fn(), create: vi.fn(), reload: vi.fn(), sendMessage: vi.fn(),
  updated: new Set<(id: number, change: { status: 'loading' | 'complete' }) => void>(),
}))
vi.mock('wxt/browser', () => ({ browser: {
  tabs: { get: mocks.get, query: mocks.query, create: mocks.create, reload: mocks.reload, sendMessage: mocks.sendMessage,
    onUpdated: { addListener: (fn: never) => mocks.updated.add(fn), removeListener: (fn: never) => mocks.updated.delete(fn) },
  },
  storage: { session: {
    get: vi.fn(async () => ({ ...mocks.stored })),
    set: vi.fn(async (values: Record<string, unknown>) => { Object.assign(mocks.stored, values) }),
    remove: vi.fn(async (key: string) => { delete mocks.stored[key] }),
  } },
} }))
const message = { type: SETTINGS_OPEN_FROM_POPUP_MESSAGE, tabId: 1, action: 'open' as const }
const source = { id: 1, windowId: 7, url: 'https://gemini.google.com/app' }
const status = () => mocks.stored[SETTINGS_ENTRY_STATUS_KEY]
async function flush() { await vi.advanceTimersByTimeAsync(0) }

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(100_000)
  vi.clearAllMocks()
  mocks.stored = {}
  mocks.get.mockResolvedValue(source)
  mocks.query.mockResolvedValue([source])
  mocks.create.mockResolvedValue({ ...source, id: 2 })
  mocks.reload.mockImplementation(async (id: number) => {
    for (const listener of mocks.updated) {
      listener(id, { status: 'loading' })
      listener(id, { status: 'complete' })
    }
  })
  mocks.sendMessage.mockResolvedValue({ opened: true })
})
afterEach(async () => {
  await vi.advanceTimersByTimeAsync(11_000)
  vi.useRealTimers()
})

describe('popup settings entry', () => {
  it('requires explicit panel confirmation in the top frame', async () => {
    expect(await startSettingsEntry(message)).toEqual({ accepted: true })
    await flush()
    expect(status()).toMatchObject({ phase: 'opened', targetTabId: 1 })
    expect(mocks.sendMessage).toHaveBeenCalledWith(1, expect.objectContaining({ expiresAt: 110_000 }), { frameId: 0 })
  })
  it('rejects duplicates across windows while a receiver is unresponsive', async () => {
    mocks.sendMessage.mockReturnValue(new Promise(() => {}))
    await startSettingsEntry(message)
    expect(await startSettingsEntry({ ...message, tabId: 8 })).toEqual({ accepted: false, error: 'busy' })
    await vi.advanceTimersByTimeAsync(10_000)
    expect(status()).toMatchObject({ phase: 'failed', error: 'timeout' })
    mocks.sendMessage.mockResolvedValue({ opened: true })
    expect(await startSettingsEntry(message)).toEqual({ accepted: true })
  })
  it.each([undefined, {}, { opened: false }])('does not accept an invalid reply %s', async reply => {
    mocks.sendMessage.mockResolvedValue(reply)
    await startSettingsEntry(message)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(status()).toMatchObject({ phase: 'failed', error: 'timeout' })
  })
  it('creates a new active Gemini tab in the source window', async () => {
    mocks.get.mockResolvedValueOnce({ ...source, url: 'https://example.com' })
    await startSettingsEntry(message)
    await flush()
    expect(mocks.create).toHaveBeenCalledWith({ active: true, windowId: 7, url: 'https://gemini.google.com/app' })
    expect(status()).toMatchObject({ phase: 'opened', targetTabId: 2 })
  })
  it('stops without messaging when the target closes', async () => {
    mocks.get.mockResolvedValueOnce(source).mockRejectedValue(new Error('closed'))
    await startSettingsEntry(message)
    await flush()
    expect(status()).toMatchObject({ phase: 'failed', error: 'target-closed' })
    expect(mocks.sendMessage).not.toHaveBeenCalled()
  })
  it('stops on pending login navigation', async () => {
    mocks.get.mockResolvedValueOnce(source).mockResolvedValue({ ...source, pendingUrl: 'https://accounts.google.com/' })
    await startSettingsEntry(message)
    await flush()
    expect(status()).toMatchObject({ phase: 'failed', error: 'target-left' })
    expect(mocks.sendMessage).not.toHaveBeenCalled()
  })
  it('times out instead of claiming a login redirect when URL access is unavailable', async () => {
    mocks.get.mockResolvedValueOnce(source).mockResolvedValue({ id: 1, windowId: 7, status: 'loading' })
    mocks.sendMessage.mockRejectedValue(new Error('No receiver'))
    await startSettingsEntry(message)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(status()).toMatchObject({ phase: 'failed', error: 'timeout' })
    expect(mocks.sendMessage).toHaveBeenCalled()
  })
  it('opens a newly created Gemini tab even when its URL fields are hidden', async () => {
    mocks.get.mockResolvedValueOnce({ ...source, url: 'https://example.com' })
      .mockResolvedValue({ id: 2, windowId: 7, status: 'complete' })
    mocks.create.mockResolvedValue({ id: 2, windowId: 7 })
    await startSettingsEntry(message)
    await flush()
    expect(mocks.sendMessage).toHaveBeenCalledWith(2, expect.objectContaining({ type: 'settings:open-panel' }), { frameId: 0 })
    expect(status()).toMatchObject({ phase: 'opened', targetTabId: 2 })
  })
  it('ignores a confirmation arriving after the total deadline', async () => {
    let resolve!: (value: unknown) => void
    mocks.sendMessage.mockReturnValue(new Promise(r => { resolve = r }))
    await startSettingsEntry(message)
    await vi.advanceTimersByTimeAsync(10_000)
    resolve({ opened: true })
    await flush()
    expect(status()).toMatchObject({ phase: 'failed', error: 'timeout' })
  })
  it('bounds a stalled target lookup by the total deadline', async () => {
    mocks.get.mockResolvedValueOnce(source).mockReturnValue(new Promise(() => {}))
    await startSettingsEntry(message)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(status()).toMatchObject({ phase: 'failed', error: 'timeout' })
  })
  it('retries the existing target and refreshes only on explicit reload', async () => {
    mocks.stored[SETTINGS_ENTRY_STATUS_KEY] = { sourceTabId: 1, targetTabId: 1, phase: 'failed', error: 'timeout', expiresAt: 150_000 }
    await startSettingsEntry({ ...message, action: 'retry' })
    await flush()
    expect(mocks.create).not.toHaveBeenCalled()
    expect(mocks.reload).not.toHaveBeenCalled()
    mocks.stored[SETTINGS_ENTRY_STATUS_KEY] = { sourceTabId: 1, targetTabId: 1, phase: 'failed', expiresAt: 150_000 }
    await startSettingsEntry({ ...message, action: 'reload' })
    await flush()
    expect(mocks.reload).toHaveBeenCalledWith(1)
  })
  it('rejects recovery from an unrelated active page', async () => {
    mocks.stored[SETTINGS_ENTRY_STATUS_KEY] = { sourceTabId: 1, targetTabId: 1, phase: 'failed', expiresAt: 150_000 }
    mocks.query.mockResolvedValue([{ ...source, id: 99 }])
    expect(await startSettingsEntry({ ...message, action: 'reload' })).toEqual({ accepted: false, error: 'start-failed' })
    expect(mocks.reload).not.toHaveBeenCalled()
  })
  it('reuses the previous Gemini target when reopening from the source page with hidden target URLs', async () => {
    mocks.stored[SETTINGS_ENTRY_STATUS_KEY] = { sourceTabId: 1, targetTabId: 2, phase: 'failed', expiresAt: 150_000 }
    mocks.get.mockImplementation(async (id: number) => id === 1
      ? { ...source, url: 'https://example.com' } : { id: 2, windowId: 7 })
    await startSettingsEntry({ ...message, action: 'retry' })
    await flush()
    expect(mocks.create).not.toHaveBeenCalled()
    expect(mocks.sendMessage).toHaveBeenCalledWith(2, expect.anything(), { frameId: 0 })
    expect(status()).toMatchObject({ phase: 'opened', sourceTabId: 1, targetTabId: 2 })
  })
  it.each(['closed', 'departed'])('recreates Gemini when reopening after its page %s', async reason => {
    mocks.stored[SETTINGS_ENTRY_STATUS_KEY] = { sourceTabId: 1, targetTabId: 2, phase: 'failed', expiresAt: 150_000 }
    mocks.get.mockImplementation(async (id: number) => {
      if (id === 3) return { ...source, id: 3 }
      if (id === 2 && reason === 'closed') throw new Error('closed')
      return { ...source, id, url: 'https://example.com' }
    })
    mocks.create.mockResolvedValue({ ...source, id: 3 })
    await startSettingsEntry({ ...message, action: 'retry' })
    await flush()
    expect(mocks.create).toHaveBeenCalledWith({ active: true, windowId: 7, url: 'https://gemini.google.com/app' })
    expect(status()).toMatchObject({ phase: 'opened', targetTabId: 3 })
  })
  it('reopens after a startup failure without a target', async () => {
    mocks.stored[SETTINGS_ENTRY_STATUS_KEY] = { sourceTabId: 1, phase: 'failed', expiresAt: 150_000 }
    await startSettingsEntry({ ...message, action: 'retry' })
    await flush()
    expect(status()).toMatchObject({ phase: 'opened', targetTabId: 1 })
  })
  it('does not accept old-page replies while the requested reload is still loading', async () => {
    mocks.stored[SETTINGS_ENTRY_STATUS_KEY] = { sourceTabId: 1, targetTabId: 1, phase: 'failed', expiresAt: 150_000 }
    mocks.reload.mockImplementation(async () => {
      for (const listener of mocks.updated) listener(1, { status: 'loading' })
    })
    await startSettingsEntry({ ...message, action: 'reload' })
    await flush()
    // A complete event from another tab cannot finish this reload.
    for (const listener of mocks.updated) listener(2, { status: 'complete' })
    await vi.advanceTimersByTimeAsync(800)
    expect(mocks.sendMessage).not.toHaveBeenCalled()
    expect(status()).toMatchObject({ phase: 'opening' })
    for (const listener of mocks.updated) listener(1, { status: 'complete' })
    await flush()
    expect(status()).toMatchObject({ phase: 'opened' })
    expect(mocks.updated.size).toBe(0)
  })
  it.each(['timeout', 'rejected'])('cleans up the reload listener on %s', async reason => {
    mocks.stored[SETTINGS_ENTRY_STATUS_KEY] = { sourceTabId: 1, targetTabId: 1, phase: 'failed', expiresAt: 150_000 }
    if (reason === 'rejected') mocks.reload.mockRejectedValue(new Error('reload rejected'))
    else mocks.reload.mockResolvedValue(undefined)
    await startSettingsEntry({ ...message, action: 'reload' })
    await vi.advanceTimersByTimeAsync(10_000)
    expect(status()).toMatchObject({ phase: 'failed', error: reason === 'timeout' ? 'timeout' : 'start-failed' })
    expect(mocks.sendMessage).not.toHaveBeenCalled()
    expect(mocks.updated.size).toBe(0)
  })
  it('removes expired state so stale loading does not survive a restart', async () => {
    mocks.stored[SETTINGS_ENTRY_STATUS_KEY] = { sourceTabId: 1, phase: 'opening', expiresAt: 100_000 }
    expect(await readSettingsEntryStatus()).toBeNull()
    expect(browser.storage.session.remove).toHaveBeenCalledWith(SETTINGS_ENTRY_STATUS_KEY)
  })
})
