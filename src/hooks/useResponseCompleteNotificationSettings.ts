import { useCallback, useEffect, useMemo, useState } from 'react'
import { browser } from 'wxt/browser'
import { EXTERNAL_LINKS } from '@/common/config'
import {
  enableResponseCompleteNotification,
  enableResponseCompleteNotificationAudio,
  getResponseCompleteNotificationAudioEnabled,
  getResponseCompleteNotificationAudioPermissionRequest,
  getResponseCompleteNotificationForegroundOnly,
  getResponseCompleteNotificationPermissionRequest,
  getResponseCompleteNotificationEnabled,
  responseCompleteNotificationForegroundOnly,
  setResponseCompleteNotificationAudioEnabled,
  setResponseCompleteNotificationEnabled,
  setResponseCompleteNotificationForegroundOnly,
  type NotificationReadiness,
} from '@/services/responseCompleteNotificationSettings'
import {
  RESPONSE_COMPLETE_NOTIFICATION_GET_READINESS_MESSAGE,
  RESPONSE_COMPLETE_NOTIFICATION_OPEN_PERMISSION_POPUP_MESSAGE,
  RESPONSE_COMPLETE_NOTIFICATION_TEST_MESSAGE,
  type ResponseCompleteNotificationResponse,
} from '@/types/runtime-messages'
import { getCurrentLocale, t } from '@/utils/i18n'

type BrowserWithOptionalPermissions = typeof browser & {
  permissions?: typeof browser.permissions
}

type PermissionRequestResult = 'granted' | 'popup-opened' | 'denied'
type PermissionKind = 'visual' | 'audio'

const PERMISSION_POPUP_GRANT_POLL_INTERVAL_MS = 500
const PERMISSION_POPUP_GRANT_POLL_MAX_ATTEMPTS = 120

async function getReadiness(): Promise<NotificationReadiness> {
  try {
    const response = await browser.runtime.sendMessage({
      type: RESPONSE_COMPLETE_NOTIFICATION_GET_READINESS_MESSAGE,
    }) as ResponseCompleteNotificationResponse | undefined

    return response?.readiness ?? 'allowed-but-system-unknown'
  } catch (error) {
    console.error('Failed to read notification readiness:', error)
    return 'allowed-but-system-unknown'
  }
}

async function getReadinessResponse(): Promise<ResponseCompleteNotificationResponse | undefined> {
  try {
    return await browser.runtime.sendMessage({
      type: RESPONSE_COMPLETE_NOTIFICATION_GET_READINESS_MESSAGE,
    }) as ResponseCompleteNotificationResponse | undefined
  } catch (error) {
    console.error('Failed to read notification readiness:', error)
    return undefined
  }
}

function isExtensionPage(): boolean {
  return window.location.protocol === 'chrome-extension:'
    || window.location.protocol === 'moz-extension:'
}

async function requestPermission(): Promise<PermissionRequestResult> {
  const permissionsApi = (browser as BrowserWithOptionalPermissions).permissions

  if (isExtensionPage() && permissionsApi?.request) {
    const permissionRequest = getResponseCompleteNotificationPermissionRequest()
    if (await permissionsApi.contains(permissionRequest)) {
      return 'granted'
    }
    return await permissionsApi.request(permissionRequest) ? 'granted' : 'denied'
  }

  const response = await browser.runtime.sendMessage({
    type: RESPONSE_COMPLETE_NOTIFICATION_OPEN_PERMISSION_POPUP_MESSAGE,
    payload: {
      permissionKind: 'visual',
    },
  }) as ResponseCompleteNotificationResponse | undefined

  if (response?.status === 'already-granted') {
    return 'granted'
  }
  if (response?.ok === true) {
    return 'popup-opened'
  }
  return 'denied'
}

async function requestAudioPermission(): Promise<PermissionRequestResult> {
  const permissionsApi = (browser as BrowserWithOptionalPermissions).permissions

  if (isExtensionPage() && permissionsApi?.request) {
    const permissionRequest = getResponseCompleteNotificationAudioPermissionRequest()
    if (await permissionsApi.contains(permissionRequest)) {
      return 'granted'
    }
    return await permissionsApi.request(permissionRequest) ? 'granted' : 'denied'
  }

  const response = await browser.runtime.sendMessage({
    type: RESPONSE_COMPLETE_NOTIFICATION_OPEN_PERMISSION_POPUP_MESSAGE,
    payload: {
      permissionKind: 'audio',
    },
  }) as ResponseCompleteNotificationResponse | undefined

  if (response?.status === 'already-granted') {
    return 'granted'
  }
  if (response?.ok === true) {
    return 'popup-opened'
  }
  return 'denied'
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

async function waitForPermissionPopupGrant(permissionKind: PermissionKind): Promise<boolean> {
  for (let attempt = 0; attempt < PERMISSION_POPUP_GRANT_POLL_MAX_ATTEMPTS; attempt += 1) {
    await getReadinessResponse()
    const enabled = permissionKind === 'audio'
      ? await getResponseCompleteNotificationAudioEnabled()
      : await getResponseCompleteNotificationEnabled()
    if (enabled) {
      return true
    }

    await delay(PERMISSION_POPUP_GRANT_POLL_INTERVAL_MS)
  }

  return false
}

export function useResponseCompleteNotificationSettings() {
  const [enabled, setEnabled] = useState(false)
  const [audioEnabled, setAudioEnabled] = useState(false)
  const [foregroundOnly, setForegroundOnly] = useState(true)
  const [audioPermissionAvailable, setAudioPermissionAvailable] = useState(false)
  const [readiness, setReadiness] = useState<NotificationReadiness>('off')
  const [notice, setNotice] = useState<string | null>(null)
  const [audioNotice, setAudioNotice] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isPending, setIsPending] = useState(false)
  const [isAudioPending, setIsAudioPending] = useState(false)
  const audioSupported = !import.meta.env.FIREFOX

  const refreshReadiness = useCallback(async () => {
    const response = await getReadinessResponse()
    const nextReadiness = response?.readiness ?? await getReadiness()
    setReadiness(nextReadiness)
    setAudioPermissionAvailable(response?.audioPermissionAvailable === true)
    return nextReadiness
  }, [])

  useEffect(() => {
    let active = true

    const load = async () => {
      try {
        const [storedEnabled, storedAudioEnabled, storedForegroundOnly] = await Promise.all([
          getResponseCompleteNotificationEnabled(),
          getResponseCompleteNotificationAudioEnabled(),
          getResponseCompleteNotificationForegroundOnly(),
        ])
        if (!active) {
          return
        }

        setEnabled(storedEnabled)
        setAudioEnabled(storedAudioEnabled)
        setForegroundOnly(storedForegroundOnly)
        if (storedEnabled) {
          await refreshReadiness()
        }
      } catch (error) {
        console.error('Failed to load response complete notification setting:', error)
      } finally {
        if (active) {
          setIsLoading(false)
        }
      }
    }

    void load()
    const unwatch = enableResponseCompleteNotification.watch((storedEnabled) => {
      setEnabled(storedEnabled)
      if (!storedEnabled) {
        setReadiness('off')
        setNotice(null)
        return
      }
      void refreshReadiness()
    })
    const unwatchAudio = enableResponseCompleteNotificationAudio.watch((storedEnabled) => {
      setAudioEnabled(storedEnabled)
      if (!storedEnabled) {
        setAudioNotice(null)
      }
      if (storedEnabled) {
        void refreshReadiness()
      }
    })
    const unwatchForegroundOnly = responseCompleteNotificationForegroundOnly.watch((storedEnabled) => {
      setForegroundOnly(storedEnabled)
    })

    return () => {
      active = false
      unwatch()
      unwatchAudio()
      unwatchForegroundOnly()
    }
  }, [refreshReadiness])

  const toggleEnabled = useCallback(async (nextEnabled: boolean) => {
    setIsPending(true)
    try {
      if (!nextEnabled) {
        await setResponseCompleteNotificationEnabled(false)
        setEnabled(false)
        setReadiness('off')
        setNotice(null)
        return
      }

      setNotice(null)
      const permissionResult = await requestPermission()
      if (permissionResult === 'popup-opened') {
        setEnabled(false)
        setReadiness('missing-extension-permission')
        setNotice(t('responseNotificationPermissionPopupOpened') || 'Complete permission setup in the popup.')
        if (await waitForPermissionPopupGrant('visual')) {
          setEnabled(true)
          setNotice(null)
          await refreshReadiness()
        }
        return
      }
      if (permissionResult !== 'granted') {
        await setResponseCompleteNotificationEnabled(false)
        setEnabled(false)
        setReadiness('missing-extension-permission')
        setNotice(t('responseNotificationPermissionDenied') || 'Required permissions were not granted.')
        return
      }

      await setResponseCompleteNotificationEnabled(true)
      setEnabled(true)
      await refreshReadiness()
    } catch (error) {
      console.error('Failed to update response complete notification setting:', error)
      await setResponseCompleteNotificationEnabled(false)
      setEnabled(false)
      setReadiness('missing-extension-permission')
      setNotice(t('responseNotificationPermissionDenied') || 'Required permissions were not granted.')
    } finally {
      setIsPending(false)
    }
  }, [refreshReadiness])

  const toggleAudioEnabled = useCallback(async (nextEnabled: boolean) => {
    setIsAudioPending(true)
    try {
      if (!nextEnabled) {
        await setResponseCompleteNotificationAudioEnabled(false)
        setAudioEnabled(false)
        setAudioNotice(null)
        return
      }

      setAudioNotice(null)
      const permissionResult = await requestAudioPermission()
      if (permissionResult === 'popup-opened') {
        setAudioEnabled(false)
        setAudioPermissionAvailable(false)
        setAudioNotice(t('responseNotificationPermissionPopupOpened') || 'Complete permission setup in the popup.')
        if (await waitForPermissionPopupGrant('audio')) {
          setAudioEnabled(true)
          setAudioPermissionAvailable(true)
          setAudioNotice(null)
          await refreshReadiness()
        }
        return
      }
      if (permissionResult !== 'granted') {
        await setResponseCompleteNotificationAudioEnabled(false)
        setAudioEnabled(false)
        setAudioPermissionAvailable(false)
        setAudioNotice(t('responseNotificationAudioPermissionDenied') || 'Audio permission was not granted.')
        return
      }

      await setResponseCompleteNotificationAudioEnabled(true)
      setAudioEnabled(true)
      setAudioPermissionAvailable(true)
    } catch (error) {
      console.error('Failed to update response complete notification audio setting:', error)
      await setResponseCompleteNotificationAudioEnabled(false)
      setAudioEnabled(false)
      setAudioPermissionAvailable(false)
      setAudioNotice(t('responseNotificationAudioPermissionDenied') || 'Audio permission was not granted.')
    } finally {
      setIsAudioPending(false)
    }
  }, [])

  const toggleForegroundOnly = useCallback(async (nextEnabled: boolean) => {
    await setResponseCompleteNotificationForegroundOnly(nextEnabled)
    setForegroundOnly(nextEnabled)
  }, [])

  const sendTestNotification = useCallback(async () => {
    try {
      const response = await browser.runtime.sendMessage({
        type: RESPONSE_COMPLETE_NOTIFICATION_TEST_MESSAGE,
        payload: {
          timestamp: Date.now(),
        },
      }) as ResponseCompleteNotificationResponse | undefined

      if (response?.readiness) {
        const nextReadiness = response.readiness
        setReadiness(currentReadiness => (
          currentReadiness === nextReadiness ? currentReadiness : nextReadiness
        ))
      }
    } catch (error) {
      console.error('Failed to send test notification:', error)
      await refreshReadiness()
    }
  }, [refreshReadiness])

  const statusText = useMemo(() => {
    if (!enabled) {
      return null
    }
    if (readiness === 'missing-extension-permission') {
      return t('responseNotificationMissingPermission') || 'Turn this on again to grant the required permissions.'
    }
    if (readiness === 'blocked-by-browser') {
      return t('responseNotificationBlocked') || 'Notifications are blocked by your browser settings.'
    }
    if (readiness === 'allowed-but-system-unknown') {
      return t('responseNotificationSystemUnknown') || 'Notifications may still depend on your system settings.'
    }
    return null
  }, [enabled, readiness])

  const canSendTest = enabled
    && (readiness === 'allowed' || readiness === 'allowed-but-system-unknown')
  const audioStatusText = enabled && audioEnabled && !audioPermissionAvailable
    ? t('responseNotificationAudioMissingPermission') || 'Turn audio on again to grant the required permission.'
    : null

  const openTroubleshooting = useCallback(() => {
    const locale = getCurrentLocale().toLowerCase()
    const troubleshootingUrl = locale.startsWith('zh')
      ? EXTERNAL_LINKS.NOTIFICATION_TROUBLESHOOTING_ZH_CN
      : EXTERNAL_LINKS.NOTIFICATION_TROUBLESHOOTING
    window.open(troubleshootingUrl, '_blank', 'noopener,noreferrer')
  }, [])

  return {
    enabled,
    audioSupported,
    audioEnabled,
    foregroundOnly,
    audioPermissionAvailable,
    readiness,
    notice,
    audioNotice,
    audioStatusText,
    isLoading,
    isPending,
    isAudioPending,
    canSendTest,
    statusText,
    toggleEnabled,
    toggleAudioEnabled,
    toggleForegroundOnly,
    sendTestNotification,
    openTroubleshooting,
  }
}
