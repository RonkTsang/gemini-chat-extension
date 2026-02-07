/**
 * Gemini page theme override module.
 * Applies teal theme by injecting CSS into document.head.
 */

import { injectGeminiThemeOverride } from "./inject"
import tealOverrideCss from "./preset/pink.css?raw"

export { injectGeminiThemeOverride }

/** Applies the teal theme override on the Gemini page. */
export function applyTealTheme(): void {
  injectGeminiThemeOverride(tealOverrideCss)
}