export const THEME_BLOOM_RUNTIME_READY_EVENT = 'gpk-theme-bloom:runtime-ready'
export const THEME_BLOOM_RUNTIME_DISABLED_EVENT = 'gpk-theme-bloom:runtime-disabled'

export function announceThemeBloomRuntimeReady(windowRef: Window = window): void {
  windowRef.dispatchEvent(new CustomEvent(THEME_BLOOM_RUNTIME_READY_EVENT))
}

export function announceThemeBloomRuntimeDisabled(windowRef: Window = window): void {
  windowRef.dispatchEvent(new CustomEvent(THEME_BLOOM_RUNTIME_DISABLED_EVENT))
}
