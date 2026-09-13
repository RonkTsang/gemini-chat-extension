import { afterEach, describe, expect, it } from 'vitest'

import {
  chatIdFromConversationLink,
  chatTitleFromConversationLink,
} from './conversation-metadata'

afterEach(() => document.body.replaceChildren())

describe('Gemini conversation metadata', () => {
  it('extracts the chat id and normalized span.title-text from the SideNav link', () => {
    const link = document.createElement('a')
    link.href = '/app/a6bbed01cc1b63b4'
    link.setAttribute('aria-label', 'Fallback title')
    link.innerHTML = '<span class="title-text">  Translate\n Buffett Persona  </span>'

    expect(chatIdFromConversationLink(link)).toBe('a6bbed01cc1b63b4')
    expect(chatTitleFromConversationLink(link)).toBe('Translate Buffett Persona')
  })

  it('falls back to aria-label when Gemini has not rendered title-text yet', () => {
    const link = document.createElement('a')
    link.href = '/app/chat-1'
    link.setAttribute('aria-label', '  Existing Gemini title  ')

    expect(chatTitleFromConversationLink(link)).toBe('Existing Gemini title')
  })
})
