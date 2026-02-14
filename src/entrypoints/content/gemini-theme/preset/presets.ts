/**
 * Theme preset registry.
 * Each preset maps to a Chakra colorPalette name and provides
 * the raw CSS for overriding Gemini's --gem-sys-color--* variables.
 */

import grayCss from './gray.css?raw'
import redCss from './red.css?raw'
import pinkCss from './pink.css?raw'
import purpleCss from './purple.css?raw'
import cyanCss from './cyan.css?raw'
import tealCss from './teal.css?raw'
import greenCss from './green.css?raw'
import yellowCss from './yellow.css?raw'
import orangeCss from './orange.css?raw'

export interface ThemePreset {
  /** Unique key — matches Chakra colorPalette name */
  key: string
  /** Display color for the swatch (hex) */
  primary: string
  /** Raw CSS to inject, or null for default (no override) */
  css: string | null
}

export const themePresets: ThemePreset[] = [
  { key: 'blue', primary: '#4285f4', css: null },
  { key: 'gray', primary: '#374151', css: grayCss },
  { key: 'red', primary: '#dc2626', css: redCss },
  { key: 'pink', primary: '#db2777', css: pinkCss },
  { key: 'purple', primary: '#9333ea', css: purpleCss },
  { key: 'cyan', primary: '#0891b2', css: cyanCss },
  { key: 'teal', primary: '#0d9488', css: tealCss },
  { key: 'green', primary: '#16a34a', css: greenCss },
  { key: 'yellow', primary: '#ca8a04', css: yellowCss },
  { key: 'orange', primary: '#ea580c', css: orangeCss },
]

export function getPresetByKey(key: string): ThemePreset | undefined {
  return themePresets.find((p) => p.key === key)
}
