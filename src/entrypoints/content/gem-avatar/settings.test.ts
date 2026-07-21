import { describe, expect, it, vi } from 'vitest'
import {
  createGemAvatarSettingsController,
  type GemAvatarBooleanSetting,
} from './settings'

function createSetting(initialValue: boolean): {
  setting: GemAvatarBooleanSetting
  setValue: (value: boolean) => void
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
  }
}

describe('GemAvatarSettingsController', () => {
  it('starts Gem Avatar when the persisted setting is enabled', async () => {
    const { setting } = createSetting(true)
    const start = vi.fn()
    const stop = vi.fn()
    const controller = createGemAvatarSettingsController({ setting, start, stop })

    await controller.start()

    expect(start).toHaveBeenCalledOnce()
    expect(stop).not.toHaveBeenCalled()
  })

  it('stops Gem Avatar when the persisted setting is disabled', async () => {
    const { setting } = createSetting(false)
    const start = vi.fn()
    const stop = vi.fn()
    const controller = createGemAvatarSettingsController({ setting, start, stop })

    await controller.start()

    expect(start).not.toHaveBeenCalled()
    expect(stop).toHaveBeenCalledOnce()
  })

  it('applies setting changes immediately and unsubscribes during cleanup', async () => {
    const { setting, setValue } = createSetting(true)
    const start = vi.fn()
    const stop = vi.fn()
    const controller = createGemAvatarSettingsController({ setting, start, stop })

    await controller.start()
    setValue(false)
    setValue(true)
    controller.stop()
    setValue(false)

    expect(start).toHaveBeenCalledTimes(2)
    expect(stop).toHaveBeenCalledTimes(2)
  })
})
