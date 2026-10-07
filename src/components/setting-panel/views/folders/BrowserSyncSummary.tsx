import { Button, HStack, IconButton, Stack, Text } from '@chakra-ui/react'
import { useEffect, useRef, useState } from 'react'
import { LuInfo } from 'react-icons/lu'

import { settingsToaster } from '../../toaster'
import { EXTERNAL_LINKS } from '@/common/config'
import { ToggleTip } from '@/components/ui/toggle-tip'
import { Tooltip } from '@/components/ui/tooltip'
import type { BrowserSyncStatusProjection } from '@/entrypoints/content/folders/client'
import { t, tt } from '@/utils/i18n'
import { formatStoragePercent, formatSyncOrganizationCounts } from './organization-label'

interface BrowserSyncSummaryProps {
  accountScopeId?: string
  isPanelOpen?: boolean
  unavailable: boolean
  syncState?: BrowserSyncStatusProjection
  measuring: boolean
  measurementError?: string
  onRetry: () => Promise<void>
  onDismissCapacity: () => void
}

function availableSyncPercent(syncState?: BrowserSyncStatusProjection): number | undefined {
  if (syncState?.currentUsageBytes === undefined || !syncState.usageBudgetBytes || syncState.usageBudgetBytes < 0) return undefined
  const folderRemaining = syncState.usageBudgetBytes - syncState.currentUsageBytes
  const extensionRemaining = syncState.currentTotalBytes !== undefined && syncState.quotaBytes !== undefined
    ? syncState.quotaBytes - syncState.currentTotalBytes
    : folderRemaining
  return Math.max(0, Math.min(100, Math.min(folderRemaining, extensionRemaining) / syncState.usageBudgetBytes * 100))
}

export function BrowserSyncSummary({
  accountScopeId, isPanelOpen, unavailable, syncState, measuring, measurementError, onRetry, onDismissCapacity,
}: BrowserSyncSummaryProps) {
  const [retryFeedback, setRetryFeedback] = useState<{ accountScopeId: string; pending: boolean }>()
  const retryRequest = useRef<symbol | undefined>(undefined)
  const panelOpen = useRef(isPanelOpen !== false)
  useEffect(() => { panelOpen.current = isPanelOpen !== false }, [isPanelOpen])
  useEffect(() => () => { retryRequest.current = undefined }, [accountScopeId])
  const feedback = retryFeedback?.accountScopeId === accountScopeId ? retryFeedback : undefined
  const needsAttention = !unavailable && syncState?.state === 'needs-attention'
  const pending = !unavailable && syncState?.state === 'local-changes-pending'
  const remaining = availableSyncPercent(syncState)
  const remainingPercent = remaining === undefined ? undefined : formatStoragePercent(remaining)
  const remainingTranslation = remainingPercent === undefined ? undefined : t('folders_sync_remaining', remainingPercent)
  const remainingLabel = remaining === undefined
    ? tt('folders_sync_remaining_loading', 'Checking available space…')
    : remainingTranslation === 'folders_sync_remaining'
      ? `${remainingPercent} available`
      : remainingTranslation
  const remainingColor = measurementError || remaining === undefined ? 'gemOnSurfaceVariant'
    : remaining <= 10 ? 'fg.error' : remaining <= 40 ? 'fg.warning' : 'fg.success'
  const remainingHelpTranslation = remainingPercent === undefined ? undefined : t('folders_sync_remaining_help', remainingPercent)
  const remainingHelp = remainingHelpTranslation === 'folders_sync_remaining_help'
    ? `${remainingPercent} of your Folder sync space is still available.`
    : remainingHelpTranslation ?? ''
  const canExplainCapacity = remaining !== undefined && !measurementError && isPanelOpen !== false
  const organizationCounts = syncState ? formatSyncOrganizationCounts(syncState) : undefined
  const guideUrl: string = EXTERNAL_LINKS.FOLDER_SYNC_GUIDE

  const retry = async () => {
    if (!accountScopeId || retryRequest.current) return
    const request = Symbol('sync-retry')
    retryRequest.current = request
    setRetryFeedback({ accountScopeId, pending: true })
    try {
      // The background accepts a request here; it does not confirm delivery.
      await onRetry()
      if (retryRequest.current === request && panelOpen.current) settingsToaster.create({ type: 'info', closable: true, title: tt('folders_sync_retry_requested', 'Retry requested.') })
    } catch {
      if (retryRequest.current === request && panelOpen.current) settingsToaster.create({ type: 'error', closable: true, title: tt('folders_sync_retry_failed', 'Could not request a retry. Try again.') })
    } finally {
      if (retryRequest.current === request) {
        retryRequest.current = undefined
        setRetryFeedback(undefined)
      }
    }
  }

  return (
    <Stack gap={2} py={4} data-control="browser-sync-summary">
      <HStack justify="space-between" align="center" gap={3} wrap="wrap">
        <HStack gap={1} minWidth={0}>
          <Text fontSize="sm" fontWeight="medium">{tt('folders_sync_cloud_title', 'Cloud sync via your browser')}</Text>
          <ToggleTip
            positioning={{ placement: 'bottom-start', fitViewport: true }}
            contentProps={{ maxWidth: '320px', maxHeight: 'var(--available-height)', overflow: 'hidden' }}
            bodyProps={{ overflowY: 'auto', maxHeight: 'var(--available-height)' }}
            content={(
              <Stack gap={3}>
                <Text fontSize="xs" lineHeight="tall">{tt('folders_sync_info_help', 'When browser sync is enabled, your Folder organization syncs across devices using the same browser account and Gemini account. In Chrome, sign in and enable sync for extensions. Delivery to other devices is managed by your browser.')}</Text>
                <Button
                  size="xs" variant="plain" alignSelf="start" disabled={!guideUrl}
                  onClick={() => { if (guideUrl) window.open(guideUrl, '_blank', 'noopener,noreferrer') }}
                >{tt('folders_sync_guide', 'Read the sync guide')}</Button>
                {!guideUrl ? <Text fontSize="xs" color="gemOnSurfaceVariant">{tt('folders_sync_guide_pending', 'Guide coming soon')}</Text> : null}
              </Stack>
            )}
          >
            <IconButton aria-label={tt('folders_sync_info_label', 'About browser sync')} size="2xs" variant="ghost" color="gemOnSurfaceVariant" flexShrink={0}>
              <LuInfo aria-hidden="true" />
            </IconButton>
          </ToggleTip>
        </HStack>
        {!unavailable ? (
          <Tooltip
            content={remainingHelp}
            disabled={!canExplainCapacity}
            openDelay={250}
            closeDelay={80}
            showArrow
            contentProps={{ maxWidth: '280px', fontSize: 'xs', lineHeight: 'tall' }}
          >
            <Text
              fontSize="xs" color={remainingColor} fontVariantNumeric="tabular-nums"
              role="status" aria-live="polite" aria-busy={measuring}
              tabIndex={canExplainCapacity ? 0 : undefined}
              cursor="default"
              _focusVisible={{ outline: '2px solid', outlineColor: 'gemPrimary', outlineOffset: '2px' }}
            >
              {measurementError ? tt('folders_sync_remaining_failed', 'Available space could not be checked.') : remainingLabel}
            </Text>
          </Tooltip>
        ) : null}
      </HStack>
      {!unavailable && organizationCounts ? <Text fontSize="xs" color="gemOnSurfaceVariant">{organizationCounts}</Text> : null}
      {unavailable || !syncState || needsAttention || pending ? (
        <HStack justify="space-between" align="start" gap={3}>
          <Text role="status" aria-live="polite" fontSize="xs" lineHeight="tall" color={needsAttention ? 'fg.error' : 'gemOnSurfaceVariant'}>
            {unavailable ? tt('folders_unavailable_label', 'Unavailable')
                : needsAttention ? syncState?.warning === 'quota-exceeded'
                  ? tt('folders_sync_quota_exceeded', 'New changes are safely saved on this device, but are not yet synced to your other devices.')
                  : tt('folders_sync_needs_attention', 'Sync needs attention. Your new changes are safely saved on this device.')
                  : pending ? tt('folders_sync_pending', 'Saved on this device. Browser Sync will write it when available.')
                    : tt('folders_sync_status_checking', 'Checking sync status…')}
          </Text>
          {needsAttention ? <Button size="xs" variant="ghost" flexShrink={0} loading={feedback?.pending} disabled={feedback?.pending} onClick={() => void retry()}>{tt('folders_sync_retry', 'Retry')}</Button> : null}
        </HStack>
      ) : null}
      {!unavailable && syncState?.showCapacityNotice ? (
        <HStack align="start" gap={3}>
          <Text fontSize="xs" color="fg.warning" flex={1}>{tt('folders_sync_quota_warning', 'Browser sync space is running low.')}</Text>
          <Button size="xs" variant="ghost" onClick={onDismissCapacity}>{tt('folders_sync_capacity_dismiss', 'Later')}</Button>
        </HStack>
      ) : null}
    </Stack>
  )
}
