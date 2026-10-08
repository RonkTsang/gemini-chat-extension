import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { isBlankComposerReady, resolveFolderLabelAnchor } from './new-chat.dom'

const editor = '<rich-textarea><div contenteditable="true" role="textbox"></div></rich-textarea>'
const currentInput = `<input-container><div class="input-area-container"><file-drop-indicator></file-drop-indicator><input-area-v2><fieldset>${editor}</fieldset></input-area-v2></div></input-container>`

beforeEach(() => window.history.replaceState({}, '', '/app'))
afterEach(() => document.body.replaceChildren())

describe('Folder new chat composer DOM', () => {
  it('resolves the current input with fieldset inside input-area-v2', () => {
    document.body.innerHTML = `<chat-window>${currentInput}</chat-window>`
    expect(resolveFolderLabelAnchor()).toBe(document.querySelector('input-area-v2'))
    expect(isBlankComposerReady()).toBe(true)
  })

  it('supports the previously observed outer fieldset contract', () => {
    document.body.innerHTML = `<chat-window><input-container><fieldset><input-area-v2>${editor}</input-area-v2></fieldset></input-container></chat-window>`
    expect(resolveFolderLabelAnchor()).toBe(document.querySelector('input-area-v2'))
    expect(isBlankComposerReady()).toBe(true)
  })

  it('rejects ambiguous inputs and inputs outside chat-window', () => {
    document.body.innerHTML = `<chat-window>${currentInput}${currentInput}</chat-window>`
    expect(resolveFolderLabelAnchor()).toBeNull()
    expect(isBlankComposerReady()).toBe(false)
    document.body.innerHTML = currentInput
    expect(resolveFolderLabelAnchor()).toBeNull()
  })

  it('only accepts an ordinary blank new-chat composer', () => {
    document.body.innerHTML = `<chat-window>${currentInput}</chat-window>`
    window.history.replaceState({}, '', '/app/abc')
    expect(isBlankComposerReady()).toBe(false)
    window.history.replaceState({}, '', '/app')
    document.querySelector('chat-window')!.classList.add('is-temporary-chat')
    expect(isBlankComposerReady()).toBe(false)
    document.querySelector('chat-window')!.classList.remove('is-temporary-chat')
    document.querySelector('chat-window')!.append(document.createElement('user-query'))
    expect(isBlankComposerReady()).toBe(false)
  })
})
