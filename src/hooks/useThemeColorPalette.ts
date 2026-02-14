/**
 * Hook + utility for dynamically switching Chakra UI's colorPalette
 * on the shadow DOM host element.
 *
 * Chakra v3 sets `--color-palette` as a CSS custom property.
 * We update it on the shadow host's :host element at runtime.
 */

import { getThemeKey } from '@/entrypoints/content/gemini-theme/themeStorage'

let _shadowHost: HTMLElement | null = null
let _currentPalette: string = 'blue'

/**
 * Register the shadow DOM host element so we can update CSS variables on it.
 * Called once by the Provider component after the shadow root is created.
 */
export function registerShadowHost(host: HTMLElement | null): void {
  _shadowHost = host
  if (host && _currentPalette) {
    applyPaletteToHost(_currentPalette)
  }
}

/**
 * Initialize the Chakra theme from storage.
 * Should be called when the provider mounts.
 */
export async function initChakraTheme() {
  try {
    const key = await getThemeKey()
    if (key) {
      updateChakraColorPalette(key)
    }
  } catch (error) {
    console.warn('Failed to init Chakra theme:', error)
  }
}

/**
 * Update the Chakra colorPalette CSS variable on the shadow host.
 * This changes the accent color for all Chakra components inside the shadow DOM.
 */
export function updateChakraColorPalette(palette: string): void {
  _currentPalette = palette
  if (_shadowHost) {
    applyPaletteToHost(palette)
  }
}

function applyPaletteToHost(palette: string) {
  if (!_shadowHost?.shadowRoot) return

  const root = _shadowHost.shadowRoot
  const styleEl = root.querySelector('style[data-color-palette]') as HTMLStyleElement | null

  // Generate CSS variables for the full scale
  // We explicitly map color-palette-{shade} to {palette}-{shade}
  // This covers the standard 50-950 range used by Chakra/Panda
  const shades = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]
  const vars = shades
    .map(shade => `--chakra-colors-color-palette-${shade}: var(--chakra-colors-${palette}-${shade});`)
    .join('\n')

  // Also map semantic tokens if possible (approximate)
  const semanticVars = `
    --chakra-colors-color-palette-solid: var(--chakra-colors-${palette}-600);
    --chakra-colors-color-palette-contrast: var(--chakra-colors-white);
    --chakra-colors-color-palette-fg: var(--chakra-colors-${palette}-700);
    --chakra-colors-color-palette-muted: var(--chakra-colors-${palette}-100);
    --chakra-colors-color-palette-subtle: var(--chakra-colors-${palette}-50);
    --chakra-colors-color-palette-emphasized: var(--chakra-colors-${palette}-700);
    --chakra-colors-color-palette-focus-ring: var(--chakra-colors-${palette}-focus-ring);
  `

  const css = `
    :host {
      --color-palette: var(--chakra-colors-${palette}-solid);
      color-palette: ${palette};
      ${vars}
      ${semanticVars}
    }
  `

  if (styleEl) {
    styleEl.textContent = css
  } else {
    const style = document.createElement('style')
    style.setAttribute('data-color-palette', '')
    style.textContent = css
    root.appendChild(style)
  }

  // Fallback property set
  _shadowHost.style.setProperty('--color-palette', `var(--chakra-colors-${palette}-solid)`)
}
