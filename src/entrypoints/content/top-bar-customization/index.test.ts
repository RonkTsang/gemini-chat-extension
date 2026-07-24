import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createTopBarCustomizationController } from './index'

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

describe('top bar customization controller', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-gpk-hide-upgrade-reminder')
    document.head.querySelector('#gpk-top-bar-customization-style')?.remove()
    vi.restoreAllMocks()
  })

  it('starts and stops the theme shortcut and upgrade reminder style', async () => {
    const watchCallbacks: Array<(value: unknown) => void> = []
    const unwatch = vi.fn()
    const setting = {
      getValue: vi.fn().mockResolvedValue({
        showThemeShortcut: true,
        hideUpgradeReminder: true,
      }),
      watch: vi.fn((callback: (value: unknown) => void) => {
        watchCallbacks.push(callback)
        return unwatch
      }),
    }
    const startThemeShortcut = vi.fn()
    const stopThemeShortcut = vi.fn()

    const controller = createTopBarCustomizationController({
      setting,
      startThemeShortcut,
      stopThemeShortcut,
    })

    await controller.start()

    expect(startThemeShortcut).toHaveBeenCalledTimes(1)
    expect(stopThemeShortcut).not.toHaveBeenCalled()
    expect(document.documentElement.hasAttribute('data-gpk-hide-upgrade-reminder')).toBe(true)
    expect(document.getElementById('gpk-top-bar-customization-style')).toBeTruthy()
    expect(setting.watch).toHaveBeenCalledTimes(1)

    watchCallbacks[0]?.({
      showThemeShortcut: false,
      hideUpgradeReminder: false,
    })

    expect(stopThemeShortcut).toHaveBeenCalledTimes(1)
    expect(document.documentElement.hasAttribute('data-gpk-hide-upgrade-reminder')).toBe(false)
    expect(document.getElementById('gpk-top-bar-customization-style')).toBeNull()

    watchCallbacks[0]?.({
      showThemeShortcut: true,
      hideUpgradeReminder: true,
    })

    expect(startThemeShortcut).toHaveBeenCalledTimes(2)
    expect(document.documentElement.hasAttribute('data-gpk-hide-upgrade-reminder')).toBe(true)
    expect(document.getElementById('gpk-top-bar-customization-style')).toBeTruthy()

    controller.stop()

    expect(stopThemeShortcut).toHaveBeenCalledTimes(2)
    expect(document.documentElement.hasAttribute('data-gpk-hide-upgrade-reminder')).toBe(false)
    expect(document.getElementById('gpk-top-bar-customization-style')).toBeNull()
    expect(unwatch).toHaveBeenCalledOnce()
  })

  it.each([
    { showThemeShortcut: true, hideUpgradeReminder: true },
    { showThemeShortcut: true, hideUpgradeReminder: false },
    { showThemeShortcut: false, hideUpgradeReminder: true },
    { showThemeShortcut: false, hideUpgradeReminder: false },
  ])('applies the initial setting combination: %o', async (settings) => {
    const setting = {
      getValue: vi.fn().mockResolvedValue(settings),
      watch: vi.fn(() => vi.fn()),
    }
    const startThemeShortcut = vi.fn()
    const stopThemeShortcut = vi.fn()
    const controller = createTopBarCustomizationController({
      setting,
      startThemeShortcut,
      stopThemeShortcut,
    })

    await controller.start()

    expect(startThemeShortcut).toHaveBeenCalledTimes(
      settings.showThemeShortcut ? 1 : 0,
    )
    expect(stopThemeShortcut).toHaveBeenCalledTimes(
      settings.showThemeShortcut ? 0 : 1,
    )
    expect(
      document.documentElement.hasAttribute('data-gpk-hide-upgrade-reminder'),
    ).toBe(settings.hideUpgradeReminder)

    controller.stop()
  })

  it('applies enabled defaults when loading fails', async () => {
    const setting = {
      getValue: vi.fn().mockRejectedValue(new Error('storage unavailable')),
      watch: vi.fn(() => vi.fn()),
    }
    const startThemeShortcut = vi.fn()
    const stopThemeShortcut = vi.fn()
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const controller = createTopBarCustomizationController({
      setting,
      startThemeShortcut,
      stopThemeShortcut,
    })

    await controller.start()

    expect(startThemeShortcut).toHaveBeenCalledOnce()
    expect(stopThemeShortcut).not.toHaveBeenCalled()
    expect(
      document.documentElement.hasAttribute('data-gpk-hide-upgrade-reminder'),
    ).toBe(true)
    expect(warnSpy).toHaveBeenCalledOnce()

    controller.stop()
  })

  it('does not duplicate startup or storage listeners', async () => {
    const setting = {
      getValue: vi.fn().mockResolvedValue({
        showThemeShortcut: true,
        hideUpgradeReminder: true,
      }),
      watch: vi.fn(() => vi.fn()),
    }
    const startThemeShortcut = vi.fn()
    const controller = createTopBarCustomizationController({
      setting,
      startThemeShortcut,
      stopThemeShortcut: vi.fn(),
    })

    await controller.start()
    await controller.start()

    expect(setting.getValue).toHaveBeenCalledOnce()
    expect(setting.watch).toHaveBeenCalledOnce()
    expect(startThemeShortcut).toHaveBeenCalledOnce()

    controller.stop()
  })

  it('ignores late resolution after stop', async () => {
    const deferred = createDeferred<unknown>()
    const setting = {
      getValue: vi.fn().mockReturnValue(deferred.promise),
      watch: vi.fn(),
    }
    const startThemeShortcut = vi.fn()
    const stopThemeShortcut = vi.fn()
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    const controller = createTopBarCustomizationController({
      setting,
      startThemeShortcut,
      stopThemeShortcut,
    })

    const startPromise = controller.start()
    controller.stop()
    deferred.resolve({
      showThemeShortcut: true,
      hideUpgradeReminder: true,
    })
    await startPromise

    expect(startThemeShortcut).not.toHaveBeenCalled()
    expect(stopThemeShortcut).toHaveBeenCalledTimes(1)
    expect(document.documentElement.hasAttribute('data-gpk-hide-upgrade-reminder')).toBe(false)
    expect(document.getElementById('gpk-top-bar-customization-style')).toBeNull()
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('ignores a stale read when stopped and restarted quickly', async () => {
    const firstRead = createDeferred<unknown>()
    const secondRead = createDeferred<unknown>()
    const setting = {
      getValue: vi.fn()
        .mockReturnValueOnce(firstRead.promise)
        .mockReturnValueOnce(secondRead.promise),
      watch: vi.fn(() => vi.fn()),
    }
    const startThemeShortcut = vi.fn()
    const stopThemeShortcut = vi.fn()
    const controller = createTopBarCustomizationController({
      setting,
      startThemeShortcut,
      stopThemeShortcut,
    })

    const firstStart = controller.start()
    controller.stop()
    const secondStart = controller.start()

    firstRead.resolve({
      showThemeShortcut: true,
      hideUpgradeReminder: true,
    })
    await firstStart

    expect(startThemeShortcut).not.toHaveBeenCalled()
    expect(setting.watch).not.toHaveBeenCalled()

    secondRead.resolve({
      showThemeShortcut: false,
      hideUpgradeReminder: true,
    })
    await secondStart

    expect(startThemeShortcut).not.toHaveBeenCalled()
    expect(stopThemeShortcut).toHaveBeenCalledTimes(2)
    expect(setting.watch).toHaveBeenCalledOnce()
    expect(
      document.documentElement.hasAttribute('data-gpk-hide-upgrade-reminder'),
    ).toBe(true)

    controller.stop()
  })

  it('keeps the upgrade reminder selector in the customization stylesheet', () => {
    const css = readFileSync(
      join(
        process.cwd(),
        'src/entrypoints/content/top-bar-customization/style.css',
      ),
      'utf8',
    )

    expect(css).toContain(
      ':root[data-gpk-hide-upgrade-reminder] top-bar-actions div.right-section div.adv-upsell',
    )
  })
})
