import { describe, expect, it } from 'vitest'

import { getGemAvatarRouteKey, parseGemAvatarPage } from './route'

describe('parseGemAvatarPage', () => {
  it('detects Gem create and edit pages', () => {
    expect(parseGemAvatarPage('https://gemini.google.com/gems/create')).toEqual({
      kind: 'create',
    })
    expect(parseGemAvatarPage('https://gemini.google.com/gems/view')).toEqual({
      kind: 'list',
    })
    expect(parseGemAvatarPage('https://gemini.google.com/gems/edit/gem-1')).toEqual({
      kind: 'edit',
      gemId: 'gem-1',
    })
  })

  it('detects Gem chat pages', () => {
    expect(parseGemAvatarPage('https://gemini.google.com/gem/gem-1')).toEqual({
      kind: 'chat',
      gemId: 'gem-1',
      chatId: undefined,
    })
    expect(parseGemAvatarPage('https://gemini.google.com/gem/gem-1/chat-1')).toEqual({
      kind: 'chat',
      gemId: 'gem-1',
      chatId: 'chat-1',
    })
  })

  it('returns other for non-Gem pages', () => {
    expect(parseGemAvatarPage('https://gemini.google.com/app')).toEqual({
      kind: 'other',
    })
  })

  it('includes chatId in Gem chat route keys', () => {
    expect(getGemAvatarRouteKey({
      kind: 'chat',
      gemId: 'gem-1',
    })).toBe('chat:gem-1:')
    expect(getGemAvatarRouteKey({
      kind: 'chat',
      gemId: 'gem-1',
      chatId: 'chat-1',
    })).toBe('chat:gem-1:chat-1')
  })
})
