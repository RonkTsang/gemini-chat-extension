import { afterEach, describe, expect, it, vi } from 'vitest'

import { xhrInterceptor } from './xhrInterceptor'

class MockXMLHttpRequest extends EventTarget {
  readyState = 0
  status = 200
  responseType = ''
  responseText = ''
  open(_method: string, _url: string | URL): void {}

  send(_data?: Document | XMLHttpRequestBodyInit | null): void {}
}

describe('xhrInterceptor', () => {
  afterEach(() => {
    xhrInterceptor.clear()
    xhrInterceptor.stop()
    vi.unstubAllGlobals()
  })

  it('notifies matching request listeners when XHR sends its request body', () => {
    vi.stubGlobal('XMLHttpRequest', MockXMLHttpRequest)
    const onRequest = vi.fn()
    const unregister = xhrInterceptor.intercept({
      urlPattern: '/_/BardChatUi/data/batchexecute',
      onRequest,
    })

    const xhr = new XMLHttpRequest()
    xhr.open('POST', '/_/BardChatUi/data/batchexecute')
    xhr.send('at=at-token')

    expect(onRequest).toHaveBeenCalledWith(
      '/_/BardChatUi/data/batchexecute',
      'POST',
      'at=at-token',
    )

    unregister()
  })

  it('preserves per-send identity and delivers only new response text before settlement', () => {
    vi.stubGlobal('XMLHttpRequest', MockXMLHttpRequest)
    const onRequestSnapshot = vi.fn()
    const onProgress = vi.fn()
    const onSettled = vi.fn()
    const unregister = xhrInterceptor.intercept({ urlPattern: '/StreamGenerate', onRequestSnapshot, onProgress, onSettled })
    const xhr = new XMLHttpRequest() as unknown as MockXMLHttpRequest
    xhr.open('POST', '/StreamGenerate')
    xhr.send('first')
    const first = onRequestSnapshot.mock.calls[0][0]
    xhr.readyState = 3
    xhr.responseText = 'part-one'
    xhr.dispatchEvent(new Event('progress'))
    xhr.responseText += 'part-two'
    xhr.dispatchEvent(new Event('progress'))
    xhr.dispatchEvent(new Event('progress'))
    expect(onProgress.mock.calls).toEqual([['part-one', first], ['part-two', first]])
    xhr.readyState = 4
    xhr.dispatchEvent(new Event('loadend'))
    expect(onSettled).toHaveBeenCalledExactlyOnceWith(first, 200)
    xhr.open('POST', '/StreamGenerate')
    xhr.responseText = ''
    xhr.send('second')
    expect(onRequestSnapshot.mock.calls[1][0].requestId).not.toBe(first.requestId)
    unregister()
  })
})
