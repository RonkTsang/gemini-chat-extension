import { describe, expect, it, vi } from 'vitest'
import {
  createThemeBloomSettingsController,
  type ThemeBloomBooleanSetting,
} from './settings'

function createSetting(initialValue: boolean): {
  setting: ThemeBloomBooleanSetting
  setValue: (value: boolean) => void
  hasListener: () => boolean
} {
  let listener: ((enabled: boolean) => void) | null = null

  return {
    setting: {
      getValue: vi.fn(async () => initialValue),
      watch: vi.fn((callback) => {
        listener = callback
        return () => {
          listener = null
        }
      }),
    },
    setValue(value) {
      listener?.(value)
    },
    hasListener() {
      return listener !== null
    },
  }
}

function createDeferred() {
  let resolve!: () => void
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

describe('ThemeBloomSettingsController', () => {
  it('honors a persisted disabled setting', async () => {
    const { setting } = createSetting(false)
    const prepare = vi.fn(async () => undefined)
    const enable = vi.fn()
    const disable = vi.fn()
    const controller = createThemeBloomSettingsController({
      setting,
      prepare,
      enable,
      disable,
    })

    await controller.start()

    expect(disable).toHaveBeenCalledOnce()
    expect(prepare).not.toHaveBeenCalled()
    expect(enable).not.toHaveBeenCalled()
  })

  it('prepares the transition path before enabling drop interception', async () => {
    const { setting } = createSetting(true)
    const deferred = createDeferred()
    const enable = vi.fn()
    const controller = createThemeBloomSettingsController({
      setting,
      prepare: vi.fn(() => deferred.promise),
      enable,
      disable: vi.fn(),
    })

    await controller.start()
    expect(enable).not.toHaveBeenCalled()

    deferred.resolve()
    await deferred.promise
    await Promise.resolve()

    expect(enable).toHaveBeenCalledOnce()
  })

  it('disables immediately and ignores a preparation that finishes later', async () => {
    const { setting, setValue } = createSetting(true)
    const deferred = createDeferred()
    const enable = vi.fn()
    const disable = vi.fn()
    const controller = createThemeBloomSettingsController({
      setting,
      prepare: vi.fn(() => deferred.promise),
      enable,
      disable,
    })

    await controller.start()
    setValue(false)

    expect(disable).toHaveBeenCalledOnce()
    deferred.resolve()
    await deferred.promise
    await Promise.resolve()
    expect(enable).not.toHaveBeenCalled()
  })

  it('unsubscribes and disables the runtime during cleanup', async () => {
    const { setting, setValue, hasListener } = createSetting(true)
    const enable = vi.fn()
    const disable = vi.fn()
    const controller = createThemeBloomSettingsController({
      setting,
      enable,
      disable,
    })

    await controller.start()
    await Promise.resolve()
    expect(enable).toHaveBeenCalledOnce()
    expect(hasListener()).toBe(true)

    controller.stop()
    setValue(true)

    expect(disable).toHaveBeenCalledOnce()
    expect(enable).toHaveBeenCalledOnce()
    expect(hasListener()).toBe(false)
  })
})
