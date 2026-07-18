import { describe, expect, it } from 'vitest'

import { defaultShortcutSettings, normalizeShortcutSettings } from './settings'

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
        toggleSidebar: 'alt+q',
        cycleModel: 'ctrl+shift+m',
        uploadFiles: 'mod+u',
      },
    })

    expect(settings.bindings).toMatchObject({
      createImage: 'alt+shift+i',
      createMusic: 'alt+shift+m',
      openCanvas: 'alt+shift+c',
      openDeepResearch: 'alt+shift+r',
      toggleSpeechDictation: 'alt+d',
    })
  })

  it('adds the Upload Files default binding to existing settings', () => {
    const { uploadFiles: _uploadFiles, ...bindingsWithoutUploadFiles } = defaultShortcutSettings.bindings
    const settings = normalizeShortcutSettings({
      enabled: true,
      bindings: bindingsWithoutUploadFiles,
    })

    expect(settings.bindings.uploadFiles).toBe('alt+u')
  })

  it('adds the Bulk Delete toggle default binding to existing settings', () => {
    const { toggleBulkDelete: _toggleBulkDelete, ...bindingsWithoutBulkDelete } = defaultShortcutSettings.bindings
    const settings = normalizeShortcutSettings({
      enabled: true,
      bindings: bindingsWithoutBulkDelete,
    })

    expect(settings.bindings.toggleBulkDelete).toBe('alt+shift+d')
  })

  it('preserves an existing Cycle Model binding', () => {
    const settings = normalizeShortcutSettings({
      enabled: true,
      bindings: {
        ...defaultShortcutSettings.bindings,
        cycleModel: 'alt+m',
      },
    })

    expect(settings.bindings.cycleModel).toBe('alt+m')
  })

  it('preserves a user-selected cycle model shortcut', () => {
    const settings = normalizeShortcutSettings({
      enabled: true,
      bindings: {
        ...defaultShortcutSettings.bindings,
        cycleModel: 'meta+shift+m',
      },
    })

    expect(settings.bindings.cycleModel).toBe('meta+shift+m')
  })
})
