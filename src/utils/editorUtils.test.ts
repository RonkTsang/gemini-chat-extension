import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  getDetailedButtonStatus,
  getSendButton,
  isReadyToSend,
  isResponding,
  sendMessage,
  stopModelResponse
} from './editorUtils'

describe('editorUtils send button detection', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('detects Gemini send state when aria-label is on the nested native button', () => {
    document.body.innerHTML = `
      <input-area-v2>
        <div data-node-type="input-area">
          <div data-test-id="send-button-container">
            <gem-icon-button class="send-button submit has-input" aria-disabled="false">
              <button aria-label="Send message"></button>
            </gem-icon-button>
          </div>
        </div>
      </input-area-v2>
    `

    const sendButton = getSendButton()

    expect(sendButton?.tagName.toLowerCase()).toBe('gem-icon-button')
    expect(isReadyToSend(sendButton!)).toBe(true)
    expect(getDetailedButtonStatus()).toMatchObject({
      hasSubmitClass: true,
      hasSendLabel: true,
      isValidSendState: true,
      currentState: 'ready'
    })
  })

  it('clicks the nested native button when sending', () => {
    document.body.innerHTML = `
      <div data-node-type="input-area">
        <div data-test-id="send-button-container">
          <gem-icon-button class="send-button submit has-input" aria-disabled="false">
            <button aria-label="Send message"></button>
          </gem-icon-button>
        </div>
      </div>
    `
    const nativeButton = document.querySelector('button')!
    const clickSpy = vi.fn()
    nativeButton.addEventListener('click', clickSpy)

    const result = sendMessage()

    expect(result).toEqual({ success: true, reason: 'success' })
    expect(clickSpy).toHaveBeenCalledTimes(1)
  })

  it('detects Gemini stop state when stop class is on the host', () => {
    document.body.innerHTML = `
      <div data-test-id="send-button-container">
        <gem-icon-button class="send-button stop" aria-disabled="false">
          <button aria-label="Stop response"></button>
        </gem-icon-button>
      </div>
    `
    const sendButton = getSendButton()
    const nativeButton = document.querySelector('button')!
    const clickSpy = vi.fn()
    nativeButton.addEventListener('click', clickSpy)

    expect(isResponding(sendButton!)).toBe(true)
    expect(stopModelResponse()).toBe(true)
    expect(clickSpy).toHaveBeenCalledTimes(1)
  })
})
