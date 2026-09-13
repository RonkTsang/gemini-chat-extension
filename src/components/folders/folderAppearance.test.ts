import { describe, expect, it } from 'vitest'

import {
  FOLDER_ICON_CATALOG,
  FOLDER_PRESET_COLORS,
  getFolderColor,
  getFolderIcon,
} from './folderAppearance'

describe('Folder appearance catalog', () => {
  it('matches the reference grid and palette order', () => {
    expect(FOLDER_ICON_CATALOG.map((definition) => definition.key)).toHaveLength(30)
    expect(FOLDER_PRESET_COLORS.map(({ key, hex }) => [key, hex])).toEqual([
      ['neutral', '#000'],
      ['red', '#FA433F'],
      ['orange', '#EE7C38'],
      ['yellow', '#F6C643'],
      ['green', '#53B559'],
      ['blue', '#3A83F7'],
      ['purple', '#8952EE'],
      ['pink', '#F177AF'],
    ])
  })

  it('renders validated custom colors and safe fallbacks', () => {
    expect(getFolderColor('#a1b2c3')).toBe('#a1b2c3')
    expect(getFolderColor('url(https://example.com)')).toContain('--lumi-sys-color--on-surface')
    expect(getFolderIcon('unknown')).toBe(getFolderIcon('folder'))
  })
})
