import { describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  values: new Map<string, unknown>(),
  listener: undefined as ((message: unknown) => Promise<unknown> | undefined) | undefined,
  set: vi.fn(),
}))

vi.mock('wxt/browser', () => ({
  browser: {
    storage: {
      local: {
        get: vi.fn(async (key: string) => ({ [key]: state.values.get(key) })),
        set: state.set.mockImplementation(async (value: Record<string, unknown>) => {
          Object.entries(value).forEach(([key, entry]) => state.values.set(key, entry))
        }),
      },
    },
    runtime: {
      onMessage: { addListener: vi.fn((listener) => { state.listener = listener }) },
    },
  },
}))

import { FolderDeviceIdProvider, startFolderDeviceIdProvider } from './folderDeviceId'

describe('FolderDeviceIdProvider', () => {
  it('single-flights concurrent requests and exposes the same persisted ID through the background message handler', async () => {
    let setCalls = 0
    const storage = {
      get: async (key: string) => ({ [key]: state.values.get(key) }),
      set: async (value: Record<string, string>) => { setCalls += 1; Object.entries(value).forEach(([key, entry]) => state.values.set(key, entry)) },
    }
    const provider = new FolderDeviceIdProvider(storage)
    const ids = await Promise.all(Array.from({ length: 8 }, () => provider.get()))
    expect(new Set(ids).size).toBe(1)
    expect(setCalls).toBe(1)

    startFolderDeviceIdProvider()
    const [first, second] = await Promise.all([
      state.listener?.({ type: 'folders:get-device-id' }),
      state.listener?.({ type: 'folders:get-device-id' }),
    ])
    expect(first).toEqual(second)
    expect(first).toMatchObject({ deviceId: expect.any(String) })
  })

  it('reuses an existing ID without writing and fails closed when storage readback is invalid', async () => {
    let writes = 0
    const existing = new FolderDeviceIdProvider({
      get: async (key) => ({ [key]: 'persisted-device' }),
      set: async () => { writes += 1 },
    })
    await expect(existing.get()).resolves.toBe('persisted-device')
    expect(writes).toBe(0)

    const invalid = new FolderDeviceIdProvider({
      get: async (key) => ({ [key]: undefined }),
      set: async () => { writes += 1 },
    })
    await expect(invalid.get()).rejects.toThrow('Unable to persist')
  })
})
