export const MESSAGE_GLASS_BACKGROUND_VISIBILITY_MIN = 0
export const MESSAGE_GLASS_BACKGROUND_VISIBILITY_DEFAULT = 5
export const MESSAGE_GLASS_BACKGROUND_VISIBILITY_MAX = 10

export const MESSAGE_GLASS_VISIBILITY_STRATEGY
  = 'legacy-anchor-linear-v1' as const

export type MessageGlassVisibilityStrategy =
  typeof MESSAGE_GLASS_VISIBILITY_STRATEGY

export type MessageGlassSurface = 'user' | 'model' | 'dual'
export type MessageGlassThemeMode = 'light' | 'dark'

const GEMINI_LIGHT_MODEL_SURFACE
  = 'var(--theme-50, var(--theme-25, color-mix(in srgb, var(--gem-sys-color--surface-container), #ffffff 35%)))'
const GEMINI_DARK_SOLID_SURFACE
  = 'var(--theme-900, var(--gem-sys-color--surface-container-high, var(--gem-sys-color--surface-container, #1f1f1f)))'
const GEMINI_DARK_MODEL_LEGACY_SURFACE
  = 'var(--theme-200, var(--gem-sys-color--surface-container-high, var(--gem-sys-color--surface-container, #2d2f31)))'
const GEMINI_DARK_DUAL_LEGACY_SURFACE
  = 'var(--theme-600, var(--gem-sys-color--surface-container-high, var(--gem-sys-color--surface-container, #2d2f31)))'
const GEMINI_USER_SURFACE
  = 'var(--gem-sys-color--surface-container-high, var(--gem-sys-color--surface-container, #eef2ef))'

export interface MessageGlassSurfaceAnchor {
  solidSurfaceColor: string
  legacySurfaceColor: string
}

export const MESSAGE_GLASS_TRANSPARENCY_ANCHORS = {
  user: { light: 40, dark: 40 },
  model: { light: 40, dark: 90 },
  dual: { light: 40, dark: 60 },
} as const satisfies Record<
  MessageGlassSurface,
  Record<MessageGlassThemeMode, number>
>

export const MESSAGE_GLASS_SURFACE_ANCHORS = {
  user: {
    light: {
      solidSurfaceColor: GEMINI_USER_SURFACE,
      legacySurfaceColor: GEMINI_USER_SURFACE,
    },
    dark: {
      solidSurfaceColor: GEMINI_DARK_SOLID_SURFACE,
      legacySurfaceColor: GEMINI_USER_SURFACE,
    },
  },
  model: {
    light: {
      solidSurfaceColor: GEMINI_LIGHT_MODEL_SURFACE,
      legacySurfaceColor: GEMINI_LIGHT_MODEL_SURFACE,
    },
    dark: {
      solidSurfaceColor: GEMINI_DARK_SOLID_SURFACE,
      legacySurfaceColor: GEMINI_DARK_MODEL_LEGACY_SURFACE,
    },
  },
  dual: {
    light: {
      solidSurfaceColor: GEMINI_LIGHT_MODEL_SURFACE,
      legacySurfaceColor: GEMINI_LIGHT_MODEL_SURFACE,
    },
    dark: {
      solidSurfaceColor: GEMINI_DARK_SOLID_SURFACE,
      legacySurfaceColor: GEMINI_DARK_DUAL_LEGACY_SURFACE,
    },
  },
} as const satisfies Record<
  MessageGlassSurface,
  Record<MessageGlassThemeMode, MessageGlassSurfaceAnchor>
>

export interface ResolveMessageGlassTransparencyOptions {
  backgroundVisibility: number
  surface: MessageGlassSurface
  mode: MessageGlassThemeMode
  strategy?: MessageGlassVisibilityStrategy
}

export interface MessageGlassResolvedSurface {
  surfaceColor: string
  legacySurfaceMixPercentage: number
  transparency: number
}

export interface MessageGlassResolvedTransparencies {
  userLight: number
  userDark: number
  modelLight: number
  modelDark: number
  dualLight: number
  dualDark: number
}

export interface MessageGlassResolvedSurfaces {
  userLight: MessageGlassResolvedSurface
  userDark: MessageGlassResolvedSurface
  modelLight: MessageGlassResolvedSurface
  modelDark: MessageGlassResolvedSurface
  dualLight: MessageGlassResolvedSurface
  dualDark: MessageGlassResolvedSurface
}

export function clampMessageGlassBackgroundVisibility(value: number): number {
  return Math.min(
    MESSAGE_GLASS_BACKGROUND_VISIBILITY_MAX,
    Math.max(MESSAGE_GLASS_BACKGROUND_VISIBILITY_MIN, Math.round(value)),
  )
}

function resolveLegacyAnchorLinear(
  backgroundVisibility: number,
  legacy: number,
): number {
  const value = clampMessageGlassBackgroundVisibility(backgroundVisibility)

  if (value < MESSAGE_GLASS_BACKGROUND_VISIBILITY_DEFAULT) {
    return Math.round(
      legacy * (value / MESSAGE_GLASS_BACKGROUND_VISIBILITY_DEFAULT),
    )
  }

  return Math.round(
    legacy
    + (100 - legacy)
    * (
      (value - MESSAGE_GLASS_BACKGROUND_VISIBILITY_DEFAULT)
      / (
        MESSAGE_GLASS_BACKGROUND_VISIBILITY_MAX
        - MESSAGE_GLASS_BACKGROUND_VISIBILITY_DEFAULT
      )
    ),
  )
}

function resolveSurfaceColor(
  backgroundVisibility: number,
  mode: MessageGlassThemeMode,
  anchor: MessageGlassSurfaceAnchor,
): string {
  const value = clampMessageGlassBackgroundVisibility(backgroundVisibility)

  if (mode === 'light' || value >= MESSAGE_GLASS_BACKGROUND_VISIBILITY_DEFAULT) {
    return anchor.legacySurfaceColor
  }

  if (value === MESSAGE_GLASS_BACKGROUND_VISIBILITY_MIN) {
    return anchor.solidSurfaceColor
  }

  const legacySurfaceMixPercentage = resolveLegacySurfaceMixPercentage(
    backgroundVisibility,
    mode,
  )

  return `color-mix(in srgb, ${anchor.solidSurfaceColor}, ${anchor.legacySurfaceColor} ${legacySurfaceMixPercentage}%)`
}

function resolveLegacySurfaceMixPercentage(
  backgroundVisibility: number,
  mode: MessageGlassThemeMode,
): number {
  const value = clampMessageGlassBackgroundVisibility(backgroundVisibility)

  if (mode === 'light' || value >= MESSAGE_GLASS_BACKGROUND_VISIBILITY_DEFAULT) {
    return 100
  }

  const progress = value / MESSAGE_GLASS_BACKGROUND_VISIBILITY_DEFAULT

  return Math.round((progress ** 2) * 100)
}

export function resolveMessageGlassTransparency({
  backgroundVisibility,
  surface,
  mode,
  strategy = MESSAGE_GLASS_VISIBILITY_STRATEGY,
}: ResolveMessageGlassTransparencyOptions): number {
  const legacy = MESSAGE_GLASS_TRANSPARENCY_ANCHORS[surface][mode]

  if (strategy === MESSAGE_GLASS_VISIBILITY_STRATEGY) {
    return resolveLegacyAnchorLinear(backgroundVisibility, legacy)
  }

  return legacy
}

export function resolveMessageGlassSurface(
  options: ResolveMessageGlassTransparencyOptions,
): MessageGlassResolvedSurface {
  const anchor = MESSAGE_GLASS_SURFACE_ANCHORS[options.surface][options.mode]

  return {
    surfaceColor: resolveSurfaceColor(
      options.backgroundVisibility,
      options.mode,
      anchor,
    ),
    legacySurfaceMixPercentage: resolveLegacySurfaceMixPercentage(
      options.backgroundVisibility,
      options.mode,
    ),
    transparency: resolveMessageGlassTransparency(options),
  }
}

export function resolveMessageGlassTransparencies(
  backgroundVisibility: number,
): MessageGlassResolvedTransparencies {
  return {
    userLight: resolveMessageGlassTransparency({
      backgroundVisibility,
      surface: 'user',
      mode: 'light',
    }),
    userDark: resolveMessageGlassTransparency({
      backgroundVisibility,
      surface: 'user',
      mode: 'dark',
    }),
    modelLight: resolveMessageGlassTransparency({
      backgroundVisibility,
      surface: 'model',
      mode: 'light',
    }),
    modelDark: resolveMessageGlassTransparency({
      backgroundVisibility,
      surface: 'model',
      mode: 'dark',
    }),
    dualLight: resolveMessageGlassTransparency({
      backgroundVisibility,
      surface: 'dual',
      mode: 'light',
    }),
    dualDark: resolveMessageGlassTransparency({
      backgroundVisibility,
      surface: 'dual',
      mode: 'dark',
    }),
  }
}

export function resolveMessageGlassSurfaces(
  backgroundVisibility: number,
): MessageGlassResolvedSurfaces {
  return {
    userLight: resolveMessageGlassSurface({
      backgroundVisibility,
      surface: 'user',
      mode: 'light',
    }),
    userDark: resolveMessageGlassSurface({
      backgroundVisibility,
      surface: 'user',
      mode: 'dark',
    }),
    modelLight: resolveMessageGlassSurface({
      backgroundVisibility,
      surface: 'model',
      mode: 'light',
    }),
    modelDark: resolveMessageGlassSurface({
      backgroundVisibility,
      surface: 'model',
      mode: 'dark',
    }),
    dualLight: resolveMessageGlassSurface({
      backgroundVisibility,
      surface: 'dual',
      mode: 'light',
    }),
    dualDark: resolveMessageGlassSurface({
      backgroundVisibility,
      surface: 'dual',
      mode: 'dark',
    }),
  }
}
