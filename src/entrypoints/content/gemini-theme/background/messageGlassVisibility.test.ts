import { describe, expect, it } from 'vitest'
import {
  resolveMessageGlassSurface,
  resolveMessageGlassSurfaces,
  resolveMessageGlassTransparency,
  resolveMessageGlassTransparencies,
} from './messageGlassVisibility'

const userSurface
  = 'var(--gem-sys-color--surface-container-high, var(--gem-sys-color--surface-container, #eef2ef))'
const lightModelSurface
  = 'var(--theme-50, var(--theme-25, color-mix(in srgb, var(--gem-sys-color--surface-container), #ffffff 35%)))'
const darkSolidSurface
  = 'var(--theme-900, var(--gem-sys-color--surface-container-high, var(--gem-sys-color--surface-container, #1f1f1f)))'
const darkModelLegacySurface
  = 'var(--theme-200, var(--gem-sys-color--surface-container-high, var(--gem-sys-color--surface-container, #2d2f31)))'
const darkDualLegacySurface
  = 'var(--theme-600, var(--gem-sys-color--surface-container-high, var(--gem-sys-color--surface-container, #2d2f31)))'

describe('message glass background visibility strategy', () => {
  it('anchors default visibility to the legacy transparency', () => {
    expect(resolveMessageGlassTransparency({
      backgroundVisibility: 0,
      surface: 'model',
      mode: 'dark',
    })).toBe(0)
    expect(resolveMessageGlassTransparency({
      backgroundVisibility: 5,
      surface: 'model',
      mode: 'dark',
    })).toBe(90)
    expect(resolveMessageGlassTransparency({
      backgroundVisibility: 10,
      surface: 'model',
      mode: 'dark',
    })).toBe(100)
  })

  it('resolves dark model and user values from per-surface anchors', () => {
    expect(resolveMessageGlassTransparency({
      backgroundVisibility: 4,
      surface: 'model',
      mode: 'dark',
    })).toBe(72)
    expect(resolveMessageGlassTransparency({
      backgroundVisibility: 5,
      surface: 'model',
      mode: 'dark',
    })).toBe(90)
    expect(resolveMessageGlassTransparency({
      backgroundVisibility: 6,
      surface: 'model',
      mode: 'dark',
    })).toBe(92)

    expect(resolveMessageGlassTransparency({
      backgroundVisibility: 4,
      surface: 'user',
      mode: 'dark',
    })).toBe(32)
    expect(resolveMessageGlassTransparency({
      backgroundVisibility: 5,
      surface: 'user',
      mode: 'dark',
    })).toBe(40)
    expect(resolveMessageGlassTransparency({
      backgroundVisibility: 6,
      surface: 'user',
      mode: 'dark',
    })).toBe(52)
  })

  it('resolves the full CSS variable set', () => {
    expect(resolveMessageGlassTransparencies(5)).toEqual({
      userLight: 40,
      userDark: 40,
      modelLight: 40,
      modelDark: 90,
      dualLight: 40,
      dualDark: 60,
    })
  })

  it('keeps light surfaces stable while dark low visibility moves toward dark solid surfaces', () => {
    expect(resolveMessageGlassSurface({
      backgroundVisibility: 4,
      surface: 'model',
      mode: 'light',
    })).toEqual({
      surfaceColor: lightModelSurface,
      legacySurfaceMixPercentage: 100,
      transparency: 32,
    })

    expect(resolveMessageGlassSurface({
      backgroundVisibility: 0,
      surface: 'model',
      mode: 'dark',
    })).toEqual({
      surfaceColor: darkSolidSurface,
      legacySurfaceMixPercentage: 0,
      transparency: 0,
    })
    expect(resolveMessageGlassSurface({
      backgroundVisibility: 4,
      surface: 'model',
      mode: 'dark',
    })).toEqual({
      surfaceColor:
        `color-mix(in srgb, ${darkSolidSurface}, ${darkModelLegacySurface} 64%)`,
      legacySurfaceMixPercentage: 64,
      transparency: 72,
    })
    expect(resolveMessageGlassSurface({
      backgroundVisibility: 5,
      surface: 'model',
      mode: 'dark',
    })).toEqual({
      surfaceColor: darkModelLegacySurface,
      legacySurfaceMixPercentage: 100,
      transparency: 90,
    })
    expect(resolveMessageGlassSurface({
      backgroundVisibility: 6,
      surface: 'model',
      mode: 'dark',
    })).toEqual({
      surfaceColor: darkModelLegacySurface,
      legacySurfaceMixPercentage: 100,
      transparency: 92,
    })
    expect(resolveMessageGlassSurface({
      backgroundVisibility: 10,
      surface: 'model',
      mode: 'dark',
    })).toEqual({
      surfaceColor: darkModelLegacySurface,
      legacySurfaceMixPercentage: 100,
      transparency: 100,
    })
  })

  it('resolves dark surface anchors for all message surfaces', () => {
    expect(resolveMessageGlassSurfaces(4)).toMatchObject({
      userDark: {
        surfaceColor:
          `color-mix(in srgb, ${darkSolidSurface}, ${userSurface} 64%)`,
        legacySurfaceMixPercentage: 64,
        transparency: 32,
      },
      modelDark: {
        surfaceColor:
          `color-mix(in srgb, ${darkSolidSurface}, ${darkModelLegacySurface} 64%)`,
        legacySurfaceMixPercentage: 64,
        transparency: 72,
      },
      dualDark: {
        surfaceColor:
          `color-mix(in srgb, ${darkSolidSurface}, ${darkDualLegacySurface} 64%)`,
        legacySurfaceMixPercentage: 64,
        transparency: 48,
      },
    })
  })
})
