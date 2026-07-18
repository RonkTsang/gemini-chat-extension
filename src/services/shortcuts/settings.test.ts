import { describe, expect, it } from 'vitest'

import { defaultShortcutSettings, normalizeShortcutSettings } from './settings'

describe('shortcut settings', () => {
  it('leaves new Prompt tools unassigned for existing users', () => {
    const settings = normalizeShortcutSettings({
      enabled: true,
      bindings: {
        ...defaultShortcutSettings.bindings,
        createImage: undefined,
        createMusic: undefined,
        openCanvas: undefined,
        openDeepResearch: undefined,
      },
    })

    expect(settings.bindings).toMatchObject({
      createImage: null,
      createMusic: null,
      openCanvas: null,
      openDeepResearch: null,
    })
  })

  it('adds the Upload Files default binding to existing settings', () => {
    const { uploadFiles: _uploadFiles, ...bindingsWithoutUploadFiles } = defaultShortcutSettings.bindings
    const settings = normalizeShortcutSettings({
      enabled: true,
      bindings: bindingsWithoutUploadFiles,
    })

    expect(settings.bindings.uploadFiles).toBe('mod+u')
  })

  it('leaves the Bulk Delete toggle unassigned for existing users', () => {
    const { toggleBulkDelete: _toggleBulkDelete, ...bindingsWithoutBulkDelete } = defaultShortcutSettings.bindings
    const settings = normalizeShortcutSettings({
      enabled: true,
      bindings: bindingsWithoutBulkDelete,
    })

    expect(settings.bindings.toggleBulkDelete).toBeNull()
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
