import { afterEach, describe, expect, it, vi } from 'vitest'

import { xhrInterceptor } from './xhrInterceptor'

class MockXMLHttpRequest extends EventTarget {
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
})
