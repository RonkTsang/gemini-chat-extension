import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetValue, mockSetValue } = vi.hoisted(() => ({
  mockGetValue: vi.fn(),
  mockSetValue: vi.fn(),
}))

vi.mock('#imports', () => ({
  storage: {
    defineItem: () => ({
      getValue: mockGetValue,
      setValue: mockSetValue,
      watch: vi.fn(),
    }),
  },
}))

import {
  createSyncInputWidthPatch,
  createWidthModePatch,
  createWidthValuePatch,
  DEFAULT_CHAT_SETTINGS,
  getChatSettings,
  normalizeChatSettings,
  updateChatSettings,
} from './chatSettings'

describe('chatSettings', () => {
  beforeEach(() => {
    mockGetValue.mockReset()
    mockSetValue.mockReset()
  })

  it('normalizes invalid values and clamps width ranges', () => {
    expect(normalizeChatSettings(null)).toEqual(DEFAULT_CHAT_SETTINGS)
    expect(normalizeChatSettings({
      chatWidthMode: 'percent',
      chatWidthPercent: 10,
      chatWidthPx: 9999,
      inputWidthMode: 'invalid',
      inputWidthPercent: Number.NaN,
      inputWidthPx: 100,
      syncInputWidth: false,
      userMessageAlignment: 'left',
      userMessageFullWidth: true,
    })).toEqual({
      chatWidthMode: 'percent',
      chatWidthPercent: 35,
      chatWidthPx: 2000,
      inputWidthMode: 'default',
      inputWidthPercent: 50,
      inputWidthPx: 700,
      syncInputWidth: false,
      userMessageAlignment: 'left',
      userMessageFullWidth: true,
    })
  })

  it('normalizes legacy synchronized settings to the Chat Width values', () => {
    expect(normalizeChatSettings({
      ...DEFAULT_CHAT_SETTINGS,
      chatWidthMode: 'px',
      chatWidthPercent: 66,
      chatWidthPx: 1320,
      inputWidthMode: 'percent',
      inputWidthPercent: 84,
      inputWidthPx: 980,
      syncInputWidth: true,
    })).toMatchObject({
      chatWidthMode: 'px',
      chatWidthPercent: 66,
      chatWidthPx: 1320,
      inputWidthMode: 'px',
      inputWidthPercent: 66,
      inputWidthPx: 1320,
    })
  })

  it('reads normalized settings', async () => {
    mockGetValue.mockResolvedValue({
      ...DEFAULT_CHAT_SETTINGS,
      chatWidthMode: 'px',
      chatWidthPx: 1200,
    })

    await expect(getChatSettings()).resolves.toMatchObject({
      chatWidthMode: 'px',
      chatWidthPx: 1200,
    })
  })

  it('merges patches while preserving remembered unit values', async () => {
    mockGetValue.mockResolvedValue({
      ...DEFAULT_CHAT_SETTINGS,
      chatWidthPercent: 72,
      chatWidthPx: 1440,
    })

    await expect(updateChatSettings({
      chatWidthMode: 'px',
    })).resolves.toMatchObject({
      chatWidthMode: 'px',
      chatWidthPercent: 72,
      chatWidthPx: 1440,
    })
    expect(mockSetValue).toHaveBeenCalledWith(expect.objectContaining({
      chatWidthMode: 'px',
      chatWidthPercent: 72,
      chatWidthPx: 1440,
    }))
  })

  it('creates bidirectional width patches while synchronization is enabled', () => {
    expect(createWidthModePatch('input', 'px', true)).toEqual({
      chatWidthMode: 'px',
      inputWidthMode: 'px',
    })
    expect(createWidthValuePatch('input', 'percent', 64, true)).toEqual({
      chatWidthPercent: 64,
      inputWidthPercent: 64,
    })
    expect(createWidthValuePatch('chat', 'px', 1280, true)).toEqual({
      chatWidthPx: 1280,
      inputWidthPx: 1280,
    })
  })

  it('keeps width patches independent when synchronization is disabled', () => {
    expect(createWidthModePatch('input', 'percent', false)).toEqual({
      inputWidthMode: 'percent',
    })
    expect(createWidthValuePatch('input', 'percent', 72, false)).toEqual({
      inputWidthPercent: 72,
    })
  })

  it('aligns persisted Input Width values when synchronization is enabled', () => {
    expect(createSyncInputWidthPatch({
      ...DEFAULT_CHAT_SETTINGS,
      chatWidthMode: 'px',
      chatWidthPercent: 68,
      chatWidthPx: 1320,
      inputWidthMode: 'percent',
      inputWidthPercent: 84,
      inputWidthPx: 980,
      syncInputWidth: false,
    }, true)).toEqual({
      syncInputWidth: true,
      inputWidthMode: 'px',
      inputWidthPercent: 68,
      inputWidthPx: 1320,
    })
  })
})
