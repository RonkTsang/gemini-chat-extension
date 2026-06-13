import { useCallback, useEffect, useMemo, useState } from 'react'
import { browser } from 'wxt/browser'
import {
  enableResponseCompleteNotification,
  getResponseCompleteNotificationPermissionRequest,
  getResponseCompleteNotificationEnabled,
  setResponseCompleteNotificationEnabled,
  type NotificationReadiness,
} from '@/services/responseCompleteNotificationSettings'
import {
  RESPONSE_COMPLETE_NOTIFICATION_GET_READINESS_MESSAGE,
  RESPONSE_COMPLETE_NOTIFICATION_REQUEST_PERMISSION_MESSAGE,
  RESPONSE_COMPLETE_NOTIFICATION_TEST_MESSAGE,
  type ResponseCompleteNotificationResponse,
} from '@/types/runtime-messages'
import { t } from '@/utils/i18n'

const TROUBLESHOOTING_URL = 'https://github.com/RonkTsang/gemini-chat-extension/blob/main/docs/feature/model_response_complete_notification/notification-permission-troubleshooting.md'

type BrowserWithOptionalPermissions = typeof browser & {
  permissions?: typeof browser.permissions
}

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

async function requestPermission(): Promise<boolean> {
  const permissionsApi = (browser as BrowserWithOptionalPermissions).permissions
  const isExtensionPage = window.location.protocol === 'chrome-extension:'
    || window.location.protocol === 'moz-extension:'

  if (isExtensionPage && permissionsApi?.request) {
    return permissionsApi.request({
      ...getResponseCompleteNotificationPermissionRequest(),
    })
  }

  const response = await browser.runtime.sendMessage({
    type: RESPONSE_COMPLETE_NOTIFICATION_REQUEST_PERMISSION_MESSAGE,
  }) as ResponseCompleteNotificationResponse | undefined

  return response?.ok === true
}

export function useResponseCompleteNotificationSettings() {
  const [enabled, setEnabled] = useState(false)
  const [readiness, setReadiness] = useState<NotificationReadiness>('off')
  const [notice, setNotice] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isPending, setIsPending] = useState(false)

  const refreshReadiness = useCallback(async () => {
    const nextReadiness = await getReadiness()
    setReadiness(nextReadiness)
    return nextReadiness
  }, [])

  useEffect(() => {
    let active = true

    const load = async () => {
      try {
        const storedEnabled = await getResponseCompleteNotificationEnabled()
        if (!active) {
          return
        }

        setEnabled(storedEnabled)
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

    return () => {
      active = false
      unwatch()
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
      const granted = await requestPermission()
      if (!granted) {
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

  const sendTestNotification = useCallback(async () => {
    setIsPending(true)
    try {
      const response = await browser.runtime.sendMessage({
        type: RESPONSE_COMPLETE_NOTIFICATION_TEST_MESSAGE,
        payload: {
          timestamp: Date.now(),
        },
      }) as ResponseCompleteNotificationResponse | undefined

      if (response?.readiness) {
        setReadiness(response.readiness)
      }
    } catch (error) {
      console.error('Failed to send test notification:', error)
      await refreshReadiness()
    } finally {
      setIsPending(false)
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

  const openTroubleshooting = useCallback(() => {
    window.open(TROUBLESHOOTING_URL, '_blank', 'noopener,noreferrer')
  }, [])

  return {
    enabled,
    readiness,
    notice,
    isLoading,
    isPending,
    canSendTest,
    statusText,
    toggleEnabled,
    sendTestNotification,
    openTroubleshooting,
  }
}
