/**
 * Capture response body data as the page reads it, providing a fallback when clone reads fail.
 * This observer never initiates body reads; consumers must validate interrupted stream content.
 */
export type ResponseBodySource = 'text' | 'json' | 'arrayBuffer' | 'blob' | 'stream' | 'stream-interrupted'

export interface ResponseBodyObservation {
  maxBytes: number
  isActive: () => boolean
  onRead: (source: ResponseBodySource) => void
  onBody: (text: string, source: ResponseBodySource) => void
  onError: (error: unknown) => void
}

/** Observe successful native reads on this response without consuming its body ourselves. */
export function observeResponseBody(response: Response, observation: ResponseBodyObservation): void {
  let finished = false
  const restore: Array<() => void> = []
  const stop = (): void => {
    finished = true
    restore.splice(0).forEach((cleanup) => cleanup())
  }
  const isActive = (): boolean => {
    if (finished) return false
    if (observation.isActive()) return true
    stop()
    return false
  }
  const complete = (text: string, source: ResponseBodySource): void => {
    if (!isActive()) return
    stop()
    if (text.length > observation.maxBytes) {
      observation.onError(new RangeError('Observed response body exceeds the size limit'))
      return
    }
    observation.onBody(text, source)
  }
  const fail = (error: unknown): void => {
    if (!isActive()) return
    stop()
    observation.onError(error)
  }
  const install = (target: object, key: string, wrapper: unknown): void => {
    const descriptor = Object.getOwnPropertyDescriptor(target, key)
    Object.defineProperty(target, key, { configurable: true, writable: true, value: wrapper })
    restore.push(() => {
      if (Reflect.get(target, key) !== wrapper) return
      if (descriptor) Object.defineProperty(target, key, descriptor)
      else Reflect.deleteProperty(target, key)
    })
  }
  const watchMethod = <T>(source: Exclude<ResponseBodySource, 'stream' | 'stream-interrupted'>,
    original: (this: Response) => Promise<T>, decode: (value: T) => string | Promise<string>): void => {
    install(response, source, function (this: Response): Promise<T> {
      const promise = original.call(this)
      if (this !== response || !isActive()) return promise
      observation.onRead(source)
      void promise.then(async (value) => {
        if (isActive()) complete(await decode(value), source)
      }, fail).catch(fail)
      return promise
    })
  }

  try {
    watchMethod('text', response.text, (value) => value)
    watchMethod<unknown>('json', response.json, (value) => JSON.stringify(value))
    watchMethod('arrayBuffer', response.arrayBuffer, (value) => {
      if (value.byteLength > observation.maxBytes) throw new RangeError('Observed response body exceeds the size limit')
      return new TextDecoder().decode(value)
    })
    watchMethod('blob', response.blob, (value) => {
      if (value.size > observation.maxBytes) throw new RangeError('Observed response body exceeds the size limit')
      return value.text()
    })
    const stream = response.body
    if (!stream) return
    const originalGetReader = stream.getReader
    install(stream, 'getReader', new Proxy(originalGetReader, {
      apply(target, receiver, args) {
        const reader: unknown = Reflect.apply(target, receiver, args)
        if (receiver !== stream || !isActive() || !(reader instanceof ReadableStreamDefaultReader)) return reader
        observation.onRead('stream')
        const nativeReader: ReadableStreamDefaultReader<unknown> = reader
        const originalRead = nativeReader.read
        const decoder = new TextDecoder()
        const chunks: string[] = []
        let bytes = 0
        const finishStream = (source: 'stream' | 'stream-interrupted'): void => {
          if (!isActive()) { chunks.length = 0; return }
          chunks.push(decoder.decode())
          const text = chunks.join('')
          chunks.length = 0
          complete(text, source)
        }
        // Streaming parsers may stop after a complete JSON document without reading EOF.
        // Consumers must validate interrupted content; no body is manufactured or retried.
        const originalCancel = nativeReader.cancel
        install(nativeReader, 'cancel', function (this: ReadableStreamDefaultReader<unknown>, reason?: unknown) {
          const promise = originalCancel.call(this, reason)
          if (this === nativeReader && bytes) finishStream('stream-interrupted')
          return promise
        })
        const originalReleaseLock = nativeReader.releaseLock
        install(nativeReader, 'releaseLock', function (this: ReadableStreamDefaultReader<unknown>) {
          originalReleaseLock.call(this)
          if (this === nativeReader && bytes) finishStream('stream-interrupted')
        })
        install(nativeReader, 'read', function (this: ReadableStreamDefaultReader<unknown>) {
          const promise = originalRead.call(this)
          if (this !== nativeReader || !isActive()) return promise
          void promise.then((result) => {
            if (!isActive()) { chunks.length = 0; return }
            if (result.done) {
              finishStream('stream')
              return
            }
            if (!(result.value instanceof Uint8Array)) {
              chunks.length = 0
              fail(new TypeError('Observed response stream did not return bytes'))
              return
            }
            bytes += result.value.byteLength
            if (bytes > observation.maxBytes) {
              chunks.length = 0
              fail(new RangeError('Observed response body exceeds the size limit'))
              return
            }
            chunks.push(decoder.decode(result.value, { stream: true }))
          }, (error: unknown) => {
            if (bytes) finishStream('stream-interrupted')
            else fail(error)
          }).catch(fail)
          return promise
        })
        return reader
      },
    }))
  } catch (error) {
    fail(error)
  }
}
