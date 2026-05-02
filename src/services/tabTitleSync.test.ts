import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { eventBus } from '@/utils/eventbus'
import { TabTitleSync } from './tabTitleSync'

function setupChatTitle(title: string): HTMLElement {
  document.body.innerHTML = `
    <div id="app-root">
      <top-bar-actions>
        <div class="conversation-title-container">${title}</div>
      </top-bar-actions>
    </div>
  `

  return document.querySelector('.conversation-title-container') as HTMLElement
}

async function flushMutationObserver(): Promise<void> {
  await Promise.resolve()
}

describe('TabTitleSync', () => {
  let service: TabTitleSync

  beforeEach(() => {
    eventBus.removeAllListeners('urlchange')
    window.history.pushState({}, '', '/app/abc123')
    document.title = 'Gemini'
    service = new TabTitleSync()
  })

  afterEach(() => {
    service?.stop()
    eventBus.removeAllListeners('urlchange')
    document.body.innerHTML = ''
    document.title = ''
  })

  it('restores fallback title when navigating back to a blank new chat page', async () => {
    setupChatTitle('Chat A')
    service.start()

    expect(document.title).toBe('Chat A')

    eventBus.emitSync('urlchange', {
      url: 'https://gemini.google.com/app',
      timestamp: Date.now(),
    })

    expect(document.title).toBe('Gemini')

    document.getElementById('app-root')?.append(document.createElement('div'))
    await flushMutationObserver()

    expect(document.title).toBe('Gemini')
  })

  it('reattaches chat title sync after leaving the blank new chat page', () => {
    setupChatTitle('Chat A')
    service.start()

    eventBus.emitSync('urlchange', {
      url: 'https://gemini.google.com/app',
      timestamp: Date.now(),
    })
    expect(document.title).toBe('Gemini')

    eventBus.emitSync('urlchange', {
      url: 'https://gemini.google.com/app/def456',
      timestamp: Date.now(),
    })

    expect(document.title).toBe('Chat A')
  })
})
