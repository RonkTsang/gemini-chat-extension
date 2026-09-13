import { describe, expect, it } from 'vitest'

import {
  FOLDER_ICON_KEYS,
  FOLDER_PRESET_COLOR_KEYS,
  isFolderCustomColor,
  isFolderIconKey,
  normalizeFolderColorValue,
} from './appearance'

describe('Folder appearance contract', () => {
  it('keeps the reference catalogs fixed at 30 icons and 8 preset colors', () => {
    expect(FOLDER_ICON_KEYS).toHaveLength(30)
    expect(new Set(FOLDER_ICON_KEYS).size).toBe(30)
    expect(FOLDER_PRESET_COLOR_KEYS).toEqual([
      'neutral',
      'red',
      'orange',
      'yellow',
      'green',
      'blue',
      'purple',
      'pink',
    ])
  })

  it('normalizes opaque hex colors and rejects unsafe color values', () => {
    expect(normalizeFolderColorValue('#A1B2C3')).toBe('#a1b2c3')
    expect(normalizeFolderColorValue('blue')).toBe('blue')
    expect(normalizeFolderColorValue('#1234')).toBeUndefined()
    expect(normalizeFolderColorValue('url(https://example.com)')).toBeUndefined()
    expect(isFolderCustomColor('#123abc')).toBe(true)
  })

  it('accepts only selectable icon keys', () => {
    expect(isFolderIconKey('education')).toBe(true)
    expect(isFolderIconKey('star')).toBe(false)
  })
})
