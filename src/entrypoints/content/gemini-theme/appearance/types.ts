export type AppearanceMode = 'system' | 'light' | 'dark'

export type GeminiTheme = 'light' | 'dark'

export interface AppearanceState {
  mode: AppearanceMode
  effectiveTheme: GeminiTheme
}

