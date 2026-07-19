import { describe, expect, it } from 'vitest'

import { createDefaultShortcutSettings, normalizeShortcutSettings } from './settings'

describe('shortcut settings', () => {
  it('adds default shortcuts for Prompt tools missing from existing settings', () => {
    const settings = normalizeShortcutSettings({
      enabled: true,
      bindings: {
        openSettings: 'alt+comma',
        toggleBulkDelete: null,
        openNewChat: 'alt+n',
        openTemporaryChat: 'alt+t',
        openLibrary: 'alt+l',
        openGems: 'alt+g',
        focusInput: 'slash',
        toggleSidebar: 'alt+b',
        cycleModel: 'alt+m',
        uploadFiles: 'alt+u',
      },
    }, false)

    expect(settings.bindings).toMatchObject({
      createImage: 'alt+shift+i',
      createVideo: 'alt+shift+v',
      createMusic: 'alt+shift+m',
      openCanvas: 'alt+shift+c',
      openDeepResearch: 'alt+shift+r',
      toggleSpeechDictation: 'alt+d',
    })
  })

  it('resolves platform defaults when bindings are missing', () => {
    const {
      uploadFiles: _uploadFiles,
      createImage: _createImage,
      createVideo: _createVideo,
      ...bindingsWithoutPlatformDefaults
    } = createDefaultShortcutSettings(false).bindings
    const settings = normalizeShortcutSettings({
      enabled: true,
      bindings: bindingsWithoutPlatformDefaults,
    }, true)

    expect(settings.bindings.uploadFiles).toBe('ctrl+u')
    expect(settings.bindings.createImage).toBe('ctrl+i')
    expect(settings.bindings.createVideo).toBe('ctrl+v')
  })

  it('adds the Bulk Delete toggle default binding to missing local settings', () => {
    const { toggleBulkDelete: _toggleBulkDelete, ...bindingsWithoutBulkDelete } = createDefaultShortcutSettings(false).bindings
    const settings = normalizeShortcutSettings({
      enabled: true,
      bindings: bindingsWithoutBulkDelete,
    }, true)

    expect(settings.bindings.toggleBulkDelete).toBe('ctrl+shift+d')
  })

  it('preserves a user-selected local binding', () => {
    const settings = normalizeShortcutSettings({
      enabled: true,
      bindings: {
        ...createDefaultShortcutSettings(true).bindings,
        cycleModel: 'ctrl+period',
      },
    }, true)

    expect(settings.bindings.cycleModel).toBe('ctrl+period')
  })

  it('preserves an explicitly cleared local binding', () => {
    const settings = normalizeShortcutSettings({
      enabled: true,
      bindings: {
        ...createDefaultShortcutSettings(false).bindings,
        createImage: null,
      },
    }, false)

    expect(settings.bindings.createImage).toBeNull()
  })
})
