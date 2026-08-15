import { describe, expect, it, vi } from 'vitest'

const { defineItem } = vi.hoisted(() => ({
  defineItem: vi.fn(() => ({
    getValue: vi.fn(),
    setValue: vi.fn(),
    watch: vi.fn(),
  })),
}))

vi.mock('#imports', () => ({
  storage: { defineItem },
}))

import { DEFAULT_THEME_BLOOM_ENABLED } from './storage'

describe('popup storage defaults', () => {
  it('enables Theme Bloom when no preference has been saved', () => {
    expect(DEFAULT_THEME_BLOOM_ENABLED).toBe(true)
    expect(defineItem).toHaveBeenCalledWith('sync:enableThemeBloom', {
      fallback: true,
    })
  })
})
