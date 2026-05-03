export const FIREFOX_INSTANCE_ID_ATTR = 'data-gpk-firefox-instance-id'
export const FIREFOX_RELOAD_REQUIRED_ATTR = 'data-gpk-firefox-reload-required'

export function isFirefoxReloadRequired(): boolean {
  if (typeof document === 'undefined') {
    return false
  }

  return document.documentElement.getAttribute(FIREFOX_RELOAD_REQUIRED_ATTR) === 'true'
}

export function markFirefoxReloadRequired(): void {
  if (typeof document === 'undefined') {
    return
  }

  document.documentElement.setAttribute(FIREFOX_RELOAD_REQUIRED_ATTR, 'true')
}
