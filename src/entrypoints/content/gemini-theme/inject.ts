/**
 * Injects Gemini page theme override CSS (e.g. teal) into document.head.
 * Overrides --gem-sys-color--* on :where(.theme-host):where(.dark-theme).
 * Call from content script after DOM is ready to apply the override.
 *
 * To disable: remove or comment out the call in content/index.tsx,
 * or gate by storage/settings (e.g. only when user enables "teal theme").
 */

const STYLE_ID = "gemini-extension-theme-override"

export function injectGeminiThemeOverride(css: string): void {
  if (typeof document === "undefined" || !document.head) return
  let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null
  if (!el) {
    el = document.createElement("style")
    el.id = STYLE_ID
    document.head.appendChild(el)
  }
  el.textContent = css
}

export function removeGeminiThemeOverride(): void {
  if (typeof document === "undefined" || !document.head) return
  const el = document.getElementById(STYLE_ID)
  if (el) {
    el.remove()
  }
}
