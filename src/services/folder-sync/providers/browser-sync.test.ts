import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  values: new Map<string, unknown>(),
  usedBytes: 0,
  failManifestWrite: false,
}))

vi.mock('wxt/browser', () => ({
  browser: {
    storage: {
      sync: {
        QUOTA_BYTES: 100_000,
        get: vi.fn(async (keys: string | string[] | null) => {
          if (keys === null) return Object.fromEntries(state.values)
          const requested = Array.isArray(keys) ? keys : [keys]
          return Object.fromEntries(requested.map((key) => [key, state.values.get(key)]))
        }),
        set: vi.fn(async (values: Record<string, unknown>) => {
          if (state.failManifestWrite && Object.keys(values).some((key) => key.endsWith(':manifest'))) {
            throw new Error('manifest write failed')
          }
          Object.entries(values).forEach(([key, value]) => state.values.set(key, value))
        }),
        remove: vi.fn(async (keys: string[]) => keys.forEach((key) => state.values.delete(key))),
        getBytesInUse: vi.fn(async () => state.usedBytes),
      },
    },
  },
}))

import { encodeLzStringBase64, sha256Hex } from '../codec'
import { BrowserSyncFolderProvider } from './browser-sync'
import type { FolderSyncEnvelope } from '@/domain/folder/types'

const scope = 'account-scope-0001'

async function envelope(revision: string): Promise<FolderSyncEnvelope> {
  const payload = encodeLzStringBase64({
    schemaVersion: 1,
    accountScopeId: scope,
    folders: [],
    memberships: [],
    chatReferences: [],
    settings: {
      accountScopeId: scope,
      enabled: true,
      hideOrganizedChats: false,
      collapsedFolderIds: [],
      updatedAt: '2026-01-01T00:00:00.000Z',
      fieldVersions: {},
    },
    exportedAt: '2026-01-01T00:00:00.000Z',
  })
  return {
    appId: 'gemini-power-kit-folders', schemaVersion: 1, syncProtocolVersion: 1,
    accountScopeId: scope, authority: { provider: 'browser-sync', epoch: 'epoch-a' },
    dataRevision: revision, parentRevisions: [], generatedByDeviceId: 'device-a',
    generatedAt: '2026-01-01T00:00:00.000Z', encoding: { codec: 'lz-string-base64', codecVersion: 1 },
    contentHash: await sha256Hex(payload), payload,
  }
}

describe('BrowserSyncFolderProvider', () => {
  beforeEach(() => {
    state.values.clear()
    state.usedBytes = 0
    state.failManifestWrite = false
  })

  it('retains a complete previous generation when the active generation is corrupt', async () => {
    const provider = new BrowserSyncFolderProvider()
    const first = await envelope('revision-1')
    const second = await envelope('revision-2')
    await provider.publish(first)
    await provider.publish(second)

    const manifest = state.values.get(`folders:${scope}:manifest`) as { active: { generation: string } }
    for (const key of [...state.values.keys()]) {
      if (key.includes(`:${manifest.active.generation}:chunk:`)) state.values.delete(key)
    }
    await expect(provider.read(scope)).resolves.toMatchObject({ dataRevision: 'revision-1' })
  })

  it('keeps only the active and previous local generations after repeated publishes', async () => {
    const provider = new BrowserSyncFolderProvider()
    await provider.publish(await envelope('revision-1'), 'generation-1')
    await provider.publish(await envelope('revision-2'), 'generation-2')
    await provider.publish(await envelope('revision-3'), 'generation-3')

    const manifest = state.values.get(`folders:${scope}:manifest`) as {
      active: { generation: string }
      previous?: { generation: string }
    }
    expect(manifest.active.generation).toBe('generation-3')
    expect(manifest.previous?.generation).toBe('generation-2')
    expect([...state.values.keys()].filter((key) => key.includes(':chunk:'))).toEqual([
      `folders:${scope}:generation-2:chunk:0`,
      `folders:${scope}:generation-3:chunk:0`,
    ])
  })

  it('does not replace a readable manifest when the manifest switch fails and reports the 60% warning', async () => {
    const provider = new BrowserSyncFolderProvider()
    await provider.publish(await envelope('revision-1'))
    state.usedBytes = 61_000
    const result = await provider.publish(await envelope('revision-2'))
    expect(result.warning).toBe('near-quota')

    state.failManifestWrite = true
    await expect(provider.publish(await envelope('revision-3'), 'generation-3')).rejects.toThrow('manifest write failed')
    await expect(provider.read(scope)).resolves.toMatchObject({ dataRevision: 'revision-2' })
    expect([...state.values.keys()].some((key) => key.includes(':generation-3:chunk:'))).toBe(false)
  })
})
