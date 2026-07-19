import { beforeEach, describe, expect, it, vi } from 'vitest'

const { logDevEventMock } = vi.hoisted(() => ({
  logDevEventMock: vi.fn(),
}))

vi.mock('@/utils/devLogger', () => ({
  logDevEvent: logDevEventMock,
}))

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
    logDevEventMock.mockClear()
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

  it('clicks Video by its movie icon', async () => {
    const videoButton = renderToolbox('movie')
    const clickSpy = vi.fn()
    videoButton.addEventListener('click', clickSpy)

    await expect(launchGeminiTool('video')).resolves.toBe(true)

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
    vi.useFakeTimers()
    const musicButton = renderToolbox('music', { disabled: true })
    const clickSpy = vi.fn()
    musicButton.addEventListener('click', clickSpy)

    try {
      const launchPromise = launchGeminiTool('music')
      await vi.advanceTimersByTimeAsync(1_500)

      await expect(launchPromise).resolves.toBe(false)
    } finally {
      vi.useRealTimers()
    }

    expect(clickSpy).not.toHaveBeenCalled()
  })

  it('reports when the uploader appears before a tool drawer is ready', async () => {
    vi.useFakeTimers()
    document.body.innerHTML = `
      <simplified-input-menu>
        <gem-icon-button>
          <button aria-expanded="false"></button>
        </gem-icon-button>
      </simplified-input-menu>
    `
    const trigger = document.querySelector<HTMLButtonElement>('simplified-input-menu button')!

    trigger.addEventListener('click', () => {
      trigger.setAttribute('aria-expanded', 'true')
      document.body.insertAdjacentHTML('beforeend', `
        <uploader>
          <button data-test-id="local-images-files-uploader-button" aria-disabled="false"></button>
        </uploader>
      `)
    })

    try {
      const launchPromise = launchGeminiTool('canvas')
      await vi.advanceTimersByTimeAsync(1_500)

      await expect(launchPromise).resolves.toBe(false)

      expect(logDevEventMock).toHaveBeenCalledWith(
        'warn',
        '[Shortcut Tools]',
        'launch-aborted-tool-ready-timeout',
        expect.objectContaining({
          tool: 'canvas',
          timeoutMs: 1_500,
          uploadFilesButtonVisible: true,
          drawerCount: 0,
        }),
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it("waits for a tool item rendered in Gemini's overlay portal", async () => {
    vi.useFakeTimers()
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
      const menu = trigger.closest('simplified-input-menu')!
      menu.insertAdjacentHTML('beforeend', '<toolbox-drawer></toolbox-drawer>')
      document.body.insertAdjacentHTML('beforeend', `
        <uploader>
          <button data-test-id="local-images-files-uploader-button" aria-disabled="false"></button>
        </uploader>
        <div class="cdk-overlay-container"></div>
      `)
      window.setTimeout(() => {
        document.querySelector('.cdk-overlay-container')?.insertAdjacentHTML('beforeend', `
          <toolbox-drawer>
            <toolbox-drawer-item>
              <button role="menuitemcheckbox" aria-disabled="false">
                <mat-icon data-mat-icon-name="canvas"></mat-icon>
              </button>
            </toolbox-drawer-item>
          </toolbox-drawer>
        `)
        document.querySelector('toolbox-drawer-item button')?.addEventListener('click', toolClickSpy)
      }, 20)
    })

    try {
      const launchPromise = launchGeminiTool('canvas')
      await vi.advanceTimersByTimeAsync(20)

      await expect(launchPromise).resolves.toBe(true)
      expect(toolClickSpy).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('cancels the tool waiter when the menu trigger is unavailable', async () => {
    vi.useFakeTimers()

    try {
      await expect(launchGeminiTool('canvas')).resolves.toBe(false)
      await vi.advanceTimersByTimeAsync(1_500)

      expect(logDevEventMock).not.toHaveBeenCalledWith(
        'warn',
        '[Shortcut Tools]',
        'launch-aborted-tool-ready-timeout',
        expect.anything(),
      )
    } finally {
      vi.useRealTimers()
    }
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
