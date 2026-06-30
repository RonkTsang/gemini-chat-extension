import { act } from 'react'
import type { ButtonHTMLAttributes } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NotificationTestButton } from './NotificationTestButton'

vi.mock('@chakra-ui/react', () => ({
  Button: ({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}))

let root: Root
let container: HTMLDivElement

function createDeferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve
  })

  return {
    promise,
    resolve,
  }
}

function getButton(): HTMLButtonElement {
  const button = container.querySelector('button')
  if (!button) {
    throw new Error('button did not render')
  }
  return button
}

describe('NotificationTestButton', () => {
  beforeEach(() => {
    ;(globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean
    }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  it('keeps pending state local to the button', async () => {
    const deferredSend = createDeferred<void>()
    const sendTestNotification = vi.fn(() => deferredSend.promise)

    await act(async () => {
      root.render(
        <NotificationTestButton
          canSendTest
          sendTestNotification={sendTestNotification}
        >
          Send test notification
        </NotificationTestButton>,
      )
    })

    expect(getButton().disabled).toBe(false)

    await act(async () => {
      getButton().click()
      await Promise.resolve()
    })

    expect(sendTestNotification).toHaveBeenCalledTimes(1)
    expect(getButton().disabled).toBe(true)

    await act(async () => {
      deferredSend.resolve()
      await deferredSend.promise
    })

    expect(getButton().disabled).toBe(false)
  })
})
