import { beforeEach, describe, expect, it, vi } from 'vitest'

import { toggleSpeechDictation } from './dictationActions'

describe('toggleSpeechDictation', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('clicks the open dictation button', () => {
    document.body.innerHTML = `
      <speech-dictation-mic-button>
        <gem-icon-button>
          <button aria-label="Start listening"></button>
        </gem-icon-button>
      </speech-dictation-mic-button>
    `
    const button = document.querySelector<HTMLButtonElement>('speech-dictation-mic-button button')!
    const clickSpy = vi.fn()
    button.addEventListener('click', clickSpy)

    expect(toggleSpeechDictation()).toBe(true)
    expect(clickSpy).toHaveBeenCalledTimes(1)
  })

  it('clicks the stop dictation button while dictation is active', () => {
    document.body.innerHTML = `
      <div class="mic-button-container persistent-mic">
        <gem-icon-button
          data-test-id="stop-dictation-button"
          aria-label="Stop listening"
        >
          <button aria-label="Stop listening"></button>
        </gem-icon-button>
      </div>
    `
    const button = document.querySelector<HTMLButtonElement>(
      'gem-icon-button[data-test-id="stop-dictation-button"] button',
    )!
    const clickSpy = vi.fn()
    button.addEventListener('click', clickSpy)

    expect(toggleSpeechDictation()).toBe(true)
    expect(clickSpy).toHaveBeenCalledTimes(1)
  })

  it('prefers the visible stop button when an opening button is still in the DOM', () => {
    document.body.innerHTML = `
      <speech-dictation-mic-button style="display: none">
        <gem-icon-button>
          <button aria-label="Start listening"></button>
        </gem-icon-button>
      </speech-dictation-mic-button>
      <gem-icon-button data-test-id="stop-dictation-button">
        <button aria-label="Stop listening"></button>
      </gem-icon-button>
    `
    const openButton = document.querySelector<HTMLButtonElement>('speech-dictation-mic-button button')!
    const stopButton = document.querySelector<HTMLButtonElement>(
      'gem-icon-button[data-test-id="stop-dictation-button"] button',
    )!
    const openClickSpy = vi.fn()
    const stopClickSpy = vi.fn()
    openButton.addEventListener('click', openClickSpy)
    stopButton.addEventListener('click', stopClickSpy)

    expect(toggleSpeechDictation()).toBe(true)
    expect(openClickSpy).not.toHaveBeenCalled()
    expect(stopClickSpy).toHaveBeenCalledTimes(1)
  })

  it('returns false when neither dictation control is available', () => {
    expect(toggleSpeechDictation()).toBe(false)
  })
})
