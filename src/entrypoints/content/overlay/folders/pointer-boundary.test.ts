import { describe, expect, it } from 'vitest'

import { isEventInsideElement } from './pointer-boundary'

function eventWithPath(target: EventTarget, path: EventTarget[]): Event {
  const event = new Event('pointerdown', { bubbles: true, composed: true })
  Object.defineProperty(event, 'target', { value: target })
  Object.defineProperty(event, 'composedPath', { value: () => path })
  return event
}

describe('isEventInsideElement', () => {
  it('keeps a Shadow DOM picker open when document sees the retargeted host', () => {
    const host = document.createElement('div')
    const shadowRoot = host.attachShadow({ mode: 'open' })
    const picker = document.createElement('div')
    const folderButton = document.createElement('button')
    picker.append(folderButton)
    shadowRoot.append(picker)
    document.body.append(host)

    const event = eventWithPath(host, [folderButton, picker, shadowRoot, host, document, window])

    expect(picker.contains(event.target as Node)).toBe(false)
    expect(isEventInsideElement(event, picker)).toBe(true)
  })

  it('closes for an event whose composed path stays outside the picker', () => {
    const picker = document.createElement('div')
    const outside = document.createElement('button')
    document.body.append(picker, outside)

    const event = eventWithPath(outside, [outside, document.body, document.documentElement, document, window])

    expect(isEventInsideElement(event, picker)).toBe(false)
  })
})
