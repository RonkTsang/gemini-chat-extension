import { useEffect, useRef, useState } from 'react'
import { Button, Stack, Text } from '@chakra-ui/react'
import { browser } from 'wxt/browser'
import { t } from '@/utils/i18n'
import {
  SETTINGS_ENTRY_STATUS_KEY, isSettingsEntryStatus, readSettingsEntryStatus,
  isGeminiSettingsUrl,
} from '@/services/settingsEntryStatus'
import {
  SETTINGS_OPEN_FROM_POPUP_MESSAGE, type SettingsEntryStatus,
  type SettingsEntryAction, type SettingsEntryStartResult,
} from '@/types/runtime-messages'

export function OpenSettingsButton() {
  const [status, setStatus] = useState<SettingsEntryStatus | null>(null)
  const [tabId, setTabId] = useState<number>()
  const [targetAvailable, setTargetAvailable] = useState(false)
  const [pending, setPending] = useState(false)
  const [startFailed, setStartFailed] = useState(false)
  const watchSuccess = useRef(false)
  const mounted = useRef(false)
  const statusRef = useRef<SettingsEntryStatus | null>(null)

  useEffect(() => {
    mounted.current = true
    let revision = 0
    const apply = async (candidate: SettingsEntryStatus | null, newResult: boolean) => {
      const currentRevision = ++revision
      const [active] = await browser.tabs.query({ active: true, currentWindow: true })
      const visible = candidate && candidate.expiresAt > Date.now()
        && (candidate.phase === 'opening' || active?.id === candidate.sourceTabId || active?.id === candidate.targetTabId) ? candidate : null
      let available = false
      if (visible?.phase === 'failed' && visible.targetTabId !== undefined) {
        try {
          const target = await browser.tabs.get(visible.targetTabId)
          available = target.windowId === active?.windowId && isGeminiSettingsUrl(target.pendingUrl || target.url)
        } catch { available = false }
      }
      if (!mounted.current || revision !== currentRevision) return
      setStartFailed(false)
      setTabId(active?.id)
      const feedbackStatus = visible?.phase === 'opened' ? null : visible
      statusRef.current = feedbackStatus
      setStatus(feedbackStatus)
      setTargetAvailable(available)
      if (newResult && watchSuccess.current && visible?.phase === 'opened') window.close()
    }
    const onChanged: Parameters<typeof browser.storage.onChanged.addListener>[0] = (changes, area) => {
      if (area !== 'session' || !changes[SETTINGS_ENTRY_STATUS_KEY]) return
      const value: unknown = changes[SETTINGS_ENTRY_STATUS_KEY].newValue
      void apply(isSettingsEntryStatus(value) ? value : null, true).catch(() => setStartFailed(true))
    }
    const refresh = () => {
      void readSettingsEntryStatus().then(value => apply(value, false)).catch(() => setStartFailed(true))
    }
    browser.storage.onChanged.addListener(onChanged)
    browser.tabs.onActivated.addListener(refresh)
    refresh()
    return () => {
      mounted.current = false
      browser.storage.onChanged.removeListener(onChanged)
      browser.tabs.onActivated.removeListener(refresh)
    }
  }, [])

  useEffect(() => {
    if (!status) return
    const timer = setTimeout(() => {
      statusRef.current = null
      setStatus(null)
      setPending(false)
    }, Math.max(0, status.expiresAt - Date.now()))
    return () => clearTimeout(timer)
  }, [status])

  const start = async (action: SettingsEntryAction = 'open') => {
    if (pending || statusRef.current?.phase === 'opening') return
    setPending(true)
    setStartFailed(false)
    watchSuccess.current = true
    try {
      const [active] = await browser.tabs.query({ active: true, currentWindow: true })
      const target = action === 'reload' ? statusRef.current?.targetTabId : active?.id
      if (target === undefined) throw new Error('Missing target tab')
      setTabId(active?.id)
      const result = await browser.runtime.sendMessage({
        type: SETTINGS_OPEN_FROM_POPUP_MESSAGE, tabId: target, action,
      }) as SettingsEntryStartResult | undefined
      if (!result?.accepted) {
        watchSuccess.current = false
        const current = result?.error === 'busy' ? await readSettingsEntryStatus() : null
        if (current?.phase === 'opening') {
          statusRef.current = current
          setStatus(current)
        } else setStartFailed(true)
      }
    } catch {
      watchSuccess.current = false
      setStartFailed(true)
    } finally { if (mounted.current) setPending(false) }
  }
  const visible = status && (status.phase === 'opening' || tabId === status.sourceTabId || tabId === status.targetTabId) ? status : null
  const opening = pending || visible?.phase === 'opening'
  const failed = !opening && (startFailed || visible?.phase === 'failed')
  const action: SettingsEntryAction = visible?.phase === 'failed'
    ? targetAvailable ? 'reload' : 'retry' : 'open'
  const buttonLabel = opening ? 'popupOpeningSettings'
    : failed ? action === 'reload' ? 'popupSettingsReload' : 'popupSettingsRetry'
    : 'popupOpenSettings'
  return (
    <Stack gap={2}>
      <Button width="100%" colorPalette="blue" aria-busy={opening} disabled={opening}
        onClick={() => void start(action)}>
        {t(buttonLabel)}
      </Button>
      {failed ? (
        <Text fontSize="xs" color="fg.muted" role="status" aria-live="polite">
          {t('popupSettingsStartFailed')}
        </Text>
      ) : null}
    </Stack>
  )
}
