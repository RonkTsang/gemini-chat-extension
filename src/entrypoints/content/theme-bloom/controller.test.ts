import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ThemeBloomVisualState } from '@/common/event'
import {
  classifyThemeBloomDrop,
  createThemeBloomController,
  isNativeThemeBloomUploadTarget,
} from './controller'
import { installThemeBloomDropArbiter } from './dropArbiter'

vi.mock('@/utils/i18n', () => ({
  tt: (_key: string, fallback: string) => fallback,
}))

function createFile(name = 'theme.png', type = 'image/png'): File {
  return new File(['theme'], name, { type })
}

function createDataTransfer(files: File[]) {
  return {
    types: ['Files'],
    files,
    items: files.map((file) => ({ kind: 'file', type: file.type })),
    dropEffect: 'none',
  } as unknown as DataTransfer
}

function createDragEvent(
  type: string,
  dataTransfer: DataTransfer,
  origin = { clientX: 120, clientY: 80 },
): DragEvent {
  const event = new Event(type, { bubbles: true, cancelable: true }) as DragEvent
  Object.defineProperties(event, {
    dataTransfer: { value: dataTransfer },
    clientX: { value: origin.clientX },
    clientY: { value: origin.clientY },
  })
  return event
}

function appendNativeInputArea() {
  const inputArea = document.createElement('input-area-v2')
  vi.spyOn(inputArea, 'getBoundingClientRect').mockReturnValue({
    x: 300,
    y: 500,
    left: 300,
    top: 500,
    right: 900,
    bottom: 620,
    width: 600,
    height: 120,
    toJSON: () => ({}),
  })
  document.body.append(inputArea)
  return inputArea
}

describe('Theme Bloom controller', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  it('accepts one supported image but rejects unsupported files and multiple files', () => {
    expect(classifyThemeBloomDrop(createDataTransfer([createFile()]))).toMatchObject({
      kind: 'valid',
      file: expect.any(File),
    })
    expect(classifyThemeBloomDrop(createDataTransfer([createFile('theme.avif', 'image/avif')]))).toMatchObject({
      kind: 'valid',
      file: expect.any(File),
    })
    expect(classifyThemeBloomDrop(createDataTransfer([createFile('note.txt', 'text/plain')]))).toEqual({
      kind: 'invalid',
    })
    expect(classifyThemeBloomDrop(createDataTransfer([createFile('animation.gif', 'image/gif')]))).toEqual({
      kind: 'invalid',
    })
    expect(classifyThemeBloomDrop(createDataTransfer([createFile(), createFile('other.png')]))).toEqual({
      kind: 'invalid',
    })
  })

  it('recognizes the live Gemini input-area-v2 upload boundary by drop coordinates', () => {
    appendNativeInputArea()
    const pageDropzone = document.createElement('div')
    pageDropzone.className = 'xap-uploader-dropzone'
    document.body.append(pageDropzone)
    const event = createDragEvent(
      'drop',
      createDataTransfer([createFile()]),
      { clientX: 520, clientY: 560 },
    )

    pageDropzone.dispatchEvent(event)

    expect(isNativeThemeBloomUploadTarget(event)).toBe(true)
  })

  it('keeps nested drag events active until the final dragleave', async () => {
    appendNativeInputArea()
    const states: ThemeBloomVisualState[] = []
    const controller = createThemeBloomController({
      service: { apply: vi.fn().mockResolvedValue({}) } as never,
      emit: (state) => states.push(state),
    })
    controller.start()
    const dataTransfer = createDataTransfer([createFile()])

    document.body.dispatchEvent(createDragEvent('dragenter', dataTransfer))
    document.body.dispatchEvent(createDragEvent('dragenter', dataTransfer))
    document.body.dispatchEvent(createDragEvent('dragleave', dataTransfer))

    expect(states.at(-1)?.state).toBe('over-theme')
    document.body.dispatchEvent(createDragEvent('dragleave', dataTransfer))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(states.at(-1)?.state).toBe('idle')
    controller.stop()
  })

  it('preserves Gemini drag preview events and its final input drop', () => {
    const apply = vi.fn()
    const geminiDragEnter = vi.fn()
    const geminiDragOver = vi.fn()
    const geminiDragLeave = vi.fn()
    const geminiDrop = vi.fn()
    const inputArea = appendNativeInputArea()
    inputArea.addEventListener('dragenter', geminiDragEnter)
    inputArea.addEventListener('dragover', geminiDragOver)
    inputArea.addEventListener('dragleave', geminiDragLeave)
    inputArea.addEventListener('drop', geminiDrop)
    const arbiter = installThemeBloomDropArbiter({ isEnabled: () => true })
    const controller = createThemeBloomController({
      service: { apply } as never,
    })
    arbiter.start()
    controller.start()
    const dataTransfer = createDataTransfer([createFile()])
    const origin = { clientX: 520, clientY: 560 }

    const dragEnter = createDragEvent('dragenter', dataTransfer, origin)
    const dragOver = createDragEvent('dragover', dataTransfer, origin)
    const dragLeave = createDragEvent('dragleave', dataTransfer, origin)
    const drop = createDragEvent('drop', dataTransfer, origin)
    inputArea.dispatchEvent(dragEnter)
    inputArea.dispatchEvent(dragOver)
    inputArea.dispatchEvent(dragLeave)
    inputArea.dispatchEvent(drop)

    expect(dragEnter.defaultPrevented).toBe(false)
    expect(dragOver.defaultPrevented).toBe(false)
    expect(geminiDragEnter).toHaveBeenCalledOnce()
    expect(geminiDragOver).toHaveBeenCalledOnce()
    expect(geminiDragLeave).toHaveBeenCalledOnce()
    expect(drop.defaultPrevented).toBe(false)
    expect(geminiDrop).toHaveBeenCalledOnce()
    expect(apply).not.toHaveBeenCalled()
    controller.stop()
    arbiter.stop()
  })

  it('preserves native drag events while the pointer is outside the input', () => {
    appendNativeInputArea()
    const pageDropzone = document.createElement('div')
    pageDropzone.className = 'xap-uploader-dropzone'
    const geminiDragEnter = vi.fn()
    const geminiDragOver = vi.fn()
    const geminiDragLeave = vi.fn()
    pageDropzone.addEventListener('dragenter', geminiDragEnter)
    pageDropzone.addEventListener('dragover', geminiDragOver)
    pageDropzone.addEventListener('dragleave', geminiDragLeave)
    document.body.append(pageDropzone)
    const arbiter = installThemeBloomDropArbiter({ isEnabled: () => true })
    const controller = createThemeBloomController({
      service: { apply: vi.fn() } as never,
    })
    arbiter.start()
    controller.start()
    const dataTransfer = createDataTransfer([createFile()])

    pageDropzone.dispatchEvent(createDragEvent('dragenter', dataTransfer))
    const dragOver = createDragEvent('dragover', dataTransfer)
    pageDropzone.dispatchEvent(dragOver)
    pageDropzone.dispatchEvent(createDragEvent('dragleave', dataTransfer))

    expect(geminiDragEnter).toHaveBeenCalledOnce()
    expect(geminiDragOver).toHaveBeenCalledOnce()
    expect(geminiDragLeave).toHaveBeenCalledOnce()
    expect(dragOver.defaultPrevented).toBe(false)
    controller.stop()
    arbiter.stop()
  })

  it('accepts Theme drops outside the Gemini chat without stopping dragover', () => {
    appendNativeInputArea()
    const sideNav = document.createElement('bard-sidenav')
    const sideNavDragOver = vi.fn()
    sideNav.addEventListener('dragover', sideNavDragOver)
    document.body.append(sideNav)
    const arbiter = installThemeBloomDropArbiter({ isEnabled: () => true })
    arbiter.start()
    const event = createDragEvent('dragover', createDataTransfer([createFile()]))

    sideNav.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expect(sideNavDragOver).toHaveBeenCalledOnce()
    arbiter.stop()
  })

  it.each([
    ['PDF', createFile('brief.pdf', 'application/pdf')],
    ['unsupported image', createFile('animation.gif', 'image/gif')],
    ['multiple files', [createFile(), createFile('second.png')]],
  ])('passes an unsupported %s drag and drop through to Gemini', (_, files) => {
    appendNativeInputArea()
    const apply = vi.fn()
    const emit = vi.fn()
    const geminiDragEnter = vi.fn()
    const geminiDragOver = vi.fn()
    const geminiDrop = vi.fn()
    const arbiter = installThemeBloomDropArbiter({ isEnabled: () => true })
    const controller = createThemeBloomController({
      service: { apply } as never,
      emit,
    })
    arbiter.start()
    controller.start()
    document.addEventListener('dragenter', geminiDragEnter)
    document.addEventListener('dragover', geminiDragOver)
    document.addEventListener('drop', geminiDrop)
    const dataTransfer = createDataTransfer(Array.isArray(files) ? files : [files])
    const dragEnter = createDragEvent('dragenter', dataTransfer)
    const dragOver = createDragEvent('dragover', dataTransfer)
    const drop = createDragEvent('drop', dataTransfer)

    document.body.dispatchEvent(dragEnter)
    document.body.dispatchEvent(dragOver)
    document.body.dispatchEvent(drop)

    expect(dragEnter.defaultPrevented).toBe(false)
    expect(dragOver.defaultPrevented).toBe(false)
    expect(drop.defaultPrevented).toBe(false)
    expect(geminiDragEnter).toHaveBeenCalledOnce()
    expect(geminiDragOver).toHaveBeenCalledOnce()
    expect(geminiDrop).toHaveBeenCalledOnce()
    expect(apply).not.toHaveBeenCalled()
    expect(emit).not.toHaveBeenCalled()
    document.removeEventListener('dragenter', geminiDragEnter)
    document.removeEventListener('dragover', geminiDragOver)
    document.removeEventListener('drop', geminiDrop)
    controller.stop()
    arbiter.stop()
  })

  it('intercepts an outside drop before Gemini and uses its exact coordinate', () => {
    appendNativeInputArea()
    const apply = vi.fn().mockResolvedValue({})
    const geminiDrop = vi.fn()
    const arbiter = installThemeBloomDropArbiter({ isEnabled: () => true })
    const controller = createThemeBloomController({
      service: { apply } as never,
    })
    arbiter.start()
    controller.start()
    document.addEventListener('drop', geminiDrop, { once: true })
    const origin = { clientX: 120, clientY: 80 }
    const event = createDragEvent(
      'drop',
      createDataTransfer([createFile()]),
      origin,
    )

    document.body.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expect(geminiDrop).not.toHaveBeenCalled()
    expect(apply).toHaveBeenCalledWith(expect.objectContaining({ origin }))
    document.removeEventListener('drop', geminiDrop)
    controller.stop()
    arbiter.stop()
  })

  it('shows a generic Theme Bloom failure instead of an internal error', async () => {
    appendNativeInputArea()
    const states: ThemeBloomVisualState[] = []
    const arbiter = installThemeBloomDropArbiter({ isEnabled: () => true })
    const controller = createThemeBloomController({
      service: { apply: vi.fn().mockRejectedValue(new Error('storage failed')) } as never,
      emit: (state) => states.push(state),
    })
    arbiter.start()
    controller.start()

    document.body.dispatchEvent(createDragEvent('drop', createDataTransfer([createFile()])))
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(states).toContainEqual({
      state: 'error',
      message: 'Theme Bloom couldn’t apply this image.',
    })
    controller.stop()
    arbiter.stop()
  })

  it('intercepts an outside drop through a broad Gemini dropzone', () => {
    appendNativeInputArea()
    const apply = vi.fn().mockResolvedValue({})
    const pageDropzone = document.createElement('div')
    pageDropzone.className = 'xap-uploader-dropzone'
    document.body.append(pageDropzone)
    const arbiter = installThemeBloomDropArbiter({ isEnabled: () => true })
    const controller = createThemeBloomController({
      service: { apply } as never,
    })
    arbiter.start()
    controller.start()
    const origin = { clientX: 120, clientY: 80 }
    const event = createDragEvent('drop', createDataTransfer([createFile()]), origin)

    pageDropzone.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expect(apply).toHaveBeenCalledWith(expect.objectContaining({ origin }))
    controller.stop()
    arbiter.stop()
  })

  it('uses the last stable dragover coordinate when the drop coordinate differs', () => {
    appendNativeInputArea()
    const apply = vi.fn().mockResolvedValue({})
    const arbiter = installThemeBloomDropArbiter({ isEnabled: () => true })
    const controller = createThemeBloomController({
      service: { apply } as never,
    })
    arbiter.start()
    controller.start()
    const dataTransfer = createDataTransfer([createFile()])
    const stableOrigin = { clientX: 140, clientY: 90 }

    document.body.dispatchEvent(createDragEvent('dragover', dataTransfer, stableOrigin))
    document.body.dispatchEvent(createDragEvent(
      'drop',
      dataTransfer,
      { clientX: 0, clientY: 0 },
    ))

    expect(apply).toHaveBeenCalledWith(expect.objectContaining({
      origin: stableOrigin,
    }))
    controller.stop()
    arbiter.stop()
  })

  it('asks Gemini to clear its native drag state after an outside drop', () => {
    appendNativeInputArea()
    const nativeDropzone = document.createElement('div')
    nativeDropzone.className = 'xap-uploader-dropzone xap-drag-in-progress'
    const nativeDragLeave = vi.fn(() => {
      nativeDropzone.classList.remove('xap-drag-in-progress')
    })
    const nativeDrop = vi.fn()
    nativeDropzone.addEventListener('dragleave', nativeDragLeave)
    nativeDropzone.addEventListener('drop', nativeDrop)
    document.body.append(nativeDropzone)
    const arbiter = installThemeBloomDropArbiter({ isEnabled: () => true })
    const controller = createThemeBloomController({
      service: { apply: vi.fn().mockResolvedValue({}) } as never,
    })
    arbiter.start()
    controller.start()

    document.body.dispatchEvent(createDragEvent('drop', createDataTransfer([createFile()])))

    expect(nativeDragLeave).toHaveBeenCalledOnce()
    expect(nativeDrop).not.toHaveBeenCalled()
    expect(nativeDropzone.classList.contains('xap-drag-in-progress')).toBe(false)
    controller.stop()
    arbiter.stop()
  })

  it('falls back to an empty native drop when dragleave does not clear Gemini state', async () => {
    appendNativeInputArea()
    const nativeDropzone = document.createElement('div')
    nativeDropzone.className = 'xap-uploader-dropzone xap-drag-in-progress'
    const receivedFileCounts: number[] = []
    nativeDropzone.addEventListener('drop', (event) => {
      receivedFileCounts.push((event as DragEvent).dataTransfer?.files.length ?? 0)
      nativeDropzone.classList.remove('xap-drag-in-progress')
    })
    document.body.append(nativeDropzone)
    const arbiter = installThemeBloomDropArbiter({ isEnabled: () => true })
    const controller = createThemeBloomController({
      service: { apply: vi.fn().mockResolvedValue({}) } as never,
    })
    arbiter.start()
    controller.start()

    document.body.dispatchEvent(createDragEvent('drop', createDataTransfer([createFile()])))
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(receivedFileCounts).toEqual([0])
    expect(nativeDropzone.classList.contains('xap-drag-in-progress')).toBe(false)
    controller.stop()
    arbiter.stop()
  })

  it('uses Theme Bloom on a non-chat page with no native upload capability', () => {
    const apply = vi.fn().mockResolvedValue({})
    const geminiDrop = vi.fn()
    const arbiter = installThemeBloomDropArbiter({ isEnabled: () => true })
    const controller = createThemeBloomController({
      service: { apply } as never,
    })
    arbiter.start()
    controller.start()
    document.addEventListener('drop', geminiDrop, { once: true })
    const event = createDragEvent('drop', createDataTransfer([createFile()]))

    document.body.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expect(geminiDrop).not.toHaveBeenCalled()
    expect(apply).toHaveBeenCalledOnce()
    controller.stop()
    arbiter.stop()
  })

  it('fails open to Gemini when a chat window has no native input boundary', () => {
    const apply = vi.fn()
    const geminiDrop = vi.fn()
    document.body.append(document.createElement('chat-window'))
    const arbiter = installThemeBloomDropArbiter({ isEnabled: () => true })
    const controller = createThemeBloomController({
      service: { apply } as never,
    })
    arbiter.start()
    controller.start()
    document.addEventListener('drop', geminiDrop, { once: true })
    const event = createDragEvent('drop', createDataTransfer([createFile()]))

    document.body.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(false)
    expect(geminiDrop).toHaveBeenCalledOnce()
    expect(apply).not.toHaveBeenCalled()
    controller.stop()
    arbiter.stop()
  })

  it.each([
    ['file input', () => document.createElement('input')],
    ['upload dropzone', () => {
      const dropzone = document.createElement('div')
      dropzone.className = 'xap-uploader-dropzone'
      return dropzone
    }],
  ])('fails open on a non-chat page with a native %s', (_, createCapability) => {
    const apply = vi.fn()
    const geminiDrop = vi.fn()
    const capability = createCapability()
    if (capability instanceof HTMLInputElement) capability.type = 'file'
    document.body.append(capability)
    const arbiter = installThemeBloomDropArbiter({ isEnabled: () => true })
    const controller = createThemeBloomController({
      service: { apply } as never,
    })
    arbiter.start()
    controller.start()
    document.addEventListener('drop', geminiDrop, { once: true })
    const event = createDragEvent('drop', createDataTransfer([createFile()]))

    document.body.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(false)
    expect(geminiDrop).toHaveBeenCalledOnce()
    expect(apply).not.toHaveBeenCalled()
    controller.stop()
    arbiter.stop()
  })

  it('retains one early drop until the document-idle controller subscribes', () => {
    appendNativeInputArea()
    const apply = vi.fn().mockResolvedValue({})
    const arbiter = installThemeBloomDropArbiter({ isEnabled: () => true })
    arbiter.start()
    const event = createDragEvent('drop', createDataTransfer([createFile()]))

    document.body.dispatchEvent(event)
    const controller = createThemeBloomController({
      service: { apply } as never,
    })
    controller.start()

    expect(event.defaultPrevented).toBe(true)
    expect(apply).toHaveBeenCalledOnce()
    controller.stop()
    arbiter.stop()
  })

  it('removes listeners and resets visual state on stop', () => {
    appendNativeInputArea()
    const emit = vi.fn()
    const controller = createThemeBloomController({
      service: { apply: vi.fn() } as never,
      emit,
    })
    controller.start()
    controller.stop()

    document.body.dispatchEvent(createDragEvent('dragenter', createDataTransfer([createFile()])))
    expect(emit).toHaveBeenLastCalledWith({ state: 'idle' })
  })

  it('clears a pending early drop when the arbiter is disabled', () => {
    appendNativeInputArea()
    const apply = vi.fn().mockResolvedValue({})
    const arbiter = installThemeBloomDropArbiter({ isEnabled: () => true })
    arbiter.start()

    document.body.dispatchEvent(createDragEvent('drop', createDataTransfer([createFile()])))
    arbiter.stop()
    const controller = createThemeBloomController({
      service: { apply } as never,
    })
    controller.start()

    expect(apply).not.toHaveBeenCalled()
    controller.stop()
  })

  it('stops intercepting page drops after the arbiter is disabled', () => {
    appendNativeInputArea()
    const arbiter = installThemeBloomDropArbiter({ isEnabled: () => true })
    arbiter.start()
    arbiter.stop()
    const event = createDragEvent('drop', createDataTransfer([createFile()]))

    document.body.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(false)
  })

  it('fails open when the live setting turns off before listeners are removed', () => {
    appendNativeInputArea()
    let enabled = true
    const arbiter = installThemeBloomDropArbiter({
      isEnabled: () => enabled,
    })
    arbiter.start()
    enabled = false
    const dragOver = createDragEvent('dragover', createDataTransfer([createFile()]))
    const drop = createDragEvent('drop', createDataTransfer([createFile()]))

    document.body.dispatchEvent(dragOver)
    document.body.dispatchEvent(drop)

    expect(dragOver.defaultPrevented).toBe(false)
    expect(drop.defaultPrevented).toBe(false)
    arbiter.stop()
  })

  it('stops a previous arbiter instance before installing a replacement', () => {
    appendNativeInputArea()
    const firstArbiter = installThemeBloomDropArbiter({ isEnabled: () => true })
    const secondArbiter = installThemeBloomDropArbiter({ isEnabled: () => false })
    firstArbiter.start()
    secondArbiter.start()
    const drop = createDragEvent('drop', createDataTransfer([createFile()]))

    document.body.dispatchEvent(drop)

    expect(drop.defaultPrevented).toBe(false)
    secondArbiter.stop()
  })

  it('cancels Gemini drag-state fallback work when disabled', async () => {
    appendNativeInputArea()
    const nativeDropzone = document.createElement('div')
    nativeDropzone.className = 'xap-uploader-dropzone xap-drag-in-progress'
    const nativeDrop = vi.fn()
    nativeDropzone.addEventListener('drop', nativeDrop)
    document.body.append(nativeDropzone)
    const arbiter = installThemeBloomDropArbiter({ isEnabled: () => true })
    arbiter.start()

    document.body.dispatchEvent(createDragEvent('drop', createDataTransfer([createFile()])))
    arbiter.stop()
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(nativeDrop).not.toHaveBeenCalled()
  })
})
