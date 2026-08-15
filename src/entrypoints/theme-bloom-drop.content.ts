import {
  installThemeBloomDropArbiter,
} from './content/theme-bloom/dropArbiter'
import {
  THEME_BLOOM_RUNTIME_DISABLED_EVENT,
  THEME_BLOOM_RUNTIME_READY_EVENT,
} from './content/theme-bloom/runtime'
import { createThemeBloomSettingsController } from './content/theme-bloom/settings'
import { enableThemeBloom } from './popup/storage'

export default defineContentScript({
  matches: ['*://gemini.google.com/*'],
  runAt: 'document_start',
  main(ctx) {
    let settingEnabled = false
    let runtimeReady = false
    const isDropInterceptionEnabled = () => settingEnabled && runtimeReady
    const arbiter = installThemeBloomDropArbiter({
      isEnabled: isDropInterceptionEnabled,
    })
    const reconcileArbiter = () => {
      if (settingEnabled && runtimeReady) {
        arbiter.start()
        return
      }
      arbiter.stop()
    }
    const handleRuntimeReady = () => {
      runtimeReady = true
      reconcileArbiter()
    }
    const handleRuntimeDisabled = () => {
      runtimeReady = false
      reconcileArbiter()
    }
    const settings = createThemeBloomSettingsController({
      setting: enableThemeBloom,
      enable: () => {
        settingEnabled = true
        reconcileArbiter()
      },
      disable: () => {
        settingEnabled = false
        reconcileArbiter()
      },
    })
    window.addEventListener(THEME_BLOOM_RUNTIME_READY_EVENT, handleRuntimeReady)
    window.addEventListener(THEME_BLOOM_RUNTIME_DISABLED_EVENT, handleRuntimeDisabled)
    void settings.start()
    ctx.onInvalidated(() => {
      window.removeEventListener(THEME_BLOOM_RUNTIME_READY_EVENT, handleRuntimeReady)
      window.removeEventListener(THEME_BLOOM_RUNTIME_DISABLED_EVENT, handleRuntimeDisabled)
      settings.stop()
    })
  },
})
