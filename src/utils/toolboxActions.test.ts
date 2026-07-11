import { beforeEach, describe, expect, it, vi } from 'vitest'

import { launchGeminiTool, openUploadFilesDialog } from './toolboxActions'

function renderToolbox(iconName: string, options: { hidden?: boolean, disabled?: boolean } = {}): HTMLButtonElement {
  document.body.innerHTML = `
    <simplified-input-menu>
      <gem-icon-button>
        <button aria-expanded="true"></button>
      </gem-icon-button>
    </simplified-input-menu>
    <toolbox-drawer ${options.hidden ? 'style="display: none"' : ''}></toolbox-drawer>
    <toolbox-drawer>
      <toolbox-drawer-item>
        <button role="menuitemcheckbox" aria-disabled="${options.disabled ? 'true' : 'false'}">
          <mat-icon data-mat-icon-name="${iconName}"></mat-icon>
        </button>
      </toolbox-drawer-item>
    </toolbox-drawer>
  `

  return document.querySelector<HTMLButtonElement>(
    'toolbox-drawer:not([style]) toolbox-drawer-item button',
  )!
}

describe('launchGeminiTool', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('clicks Image by its locale-neutral icon name', async () => {
    const imageButton = renderToolbox('image_create')
    const clickSpy = vi.fn()
    imageButton.addEventListener('click', clickSpy)

    await expect(launchGeminiTool('image')).resolves.toBe(true)

    expect(clickSpy).toHaveBeenCalledTimes(1)
  })

  it('clicks Deep Research by its deep_research icon', async () => {
    const deepResearchButton = renderToolbox('deep_research')
    const clickSpy = vi.fn()
    deepResearchButton.addEventListener('click', clickSpy)

    await expect(launchGeminiTool('deepResearch')).resolves.toBe(true)

    expect(clickSpy).toHaveBeenCalledTimes(1)
  })

  it('opens the Tools menu before selecting a tool', async () => {
    document.body.innerHTML = `
      <simplified-input-menu>
        <gem-icon-button>
          <button aria-expanded="false"></button>
        </gem-icon-button>
      </simplified-input-menu>
    `
    const trigger = document.querySelector<HTMLButtonElement>('simplified-input-menu button')!
    const toolClickSpy = vi.fn()

    trigger.addEventListener('click', () => {
      trigger.setAttribute('aria-expanded', 'true')
      document.body.insertAdjacentHTML('beforeend', `
        <toolbox-drawer>
          <toolbox-drawer-item>
            <button role="menuitemcheckbox" aria-disabled="false">
              <mat-icon data-mat-icon-name="canvas"></mat-icon>
            </button>
          </toolbox-drawer-item>
        </toolbox-drawer>
      `)
      document.querySelector('toolbox-drawer-item button')?.addEventListener('click', toolClickSpy)
    })

    await expect(launchGeminiTool('canvas')).resolves.toBe(true)

    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(toolClickSpy).toHaveBeenCalledTimes(1)
  })

  it('does not click disabled tool items', async () => {
    const musicButton = renderToolbox('music', { disabled: true })
    const clickSpy = vi.fn()
    musicButton.addEventListener('click', clickSpy)

    await expect(launchGeminiTool('music')).resolves.toBe(false)

    expect(clickSpy).not.toHaveBeenCalled()
  })

  it('opens the native Upload Files dialog', async () => {
    document.body.innerHTML = `
      <simplified-input-menu>
        <gem-icon-button>
          <button aria-expanded="true"></button>
        </gem-icon-button>
      </simplified-input-menu>
      <uploader>
        <button data-test-id="local-images-files-uploader-button" aria-disabled="false"></button>
      </uploader>
    `
    const uploadButton = document.querySelector<HTMLButtonElement>(
      'button[data-test-id="local-images-files-uploader-button"]',
    )!
    const clickSpy = vi.fn()
    uploadButton.addEventListener('click', clickSpy)

    await expect(openUploadFilesDialog()).resolves.toBe(true)

    expect(clickSpy).toHaveBeenCalledTimes(1)
  })
})
