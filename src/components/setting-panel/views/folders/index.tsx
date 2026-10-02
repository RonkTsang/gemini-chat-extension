import {
  Badge,
  Box,
  Button,
  Container,
  Dialog,
  Field,
  HStack,
  Input,
  Separator,
  Stack,
  Switch,
  Text,
} from '@chakra-ui/react'
import { HiOutlineCheckCircle, HiOutlineChevronDown, HiOutlineDownload, HiOutlineRefresh, HiOutlineUpload } from 'react-icons/hi'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'

import { folderRuntime } from '@/entrypoints/content/folders/runtime'
import { tt } from '@/utils/i18n'
import type { FolderSnapshotRow } from '@/domain/folder/types'
import type { SettingViewComponent } from '../../types'
import { formatStorageSize, StorageDetails } from './StorageDetails'
import { SettingsSection } from './SettingsSection'

type DetailsKey = 'storage' | 'history'
type DetailsRequest = { accountScopeId: string; loading: boolean; error?: string }

type PreferenceKey = 'enabled' | 'hideOrganizedChats'
type PendingPreference = { accountScopeId: string; value: boolean }

function downloadJson(fileName: string, content: string): void {
  const blob = new Blob([content], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(url)
}

export const FoldersSettingsView: SettingViewComponent = ({ isPanelOpen }) => {
  const state = useSyncExternalStore(folderRuntime.subscribe, folderRuntime.getSnapshot, folderRuntime.getSnapshot)
  const [manualEmail, setManualEmail] = useState('')
  const [working, setWorking] = useState<string>()
  const [pendingPreferences, setPendingPreferences] = useState<Partial<Record<PreferenceKey, PendingPreference>>>({})
  const pendingPreferencesRef = useRef<Partial<Record<PreferenceKey, PendingPreference>>>({})
  const [preferenceError, setPreferenceError] = useState<{ accountScopeId: string; message: string }>()
  const [message, setMessage] = useState<string>()
  const [error, setError] = useState<string>()
  const [detailsRequests, setDetailsRequests] = useState<Partial<Record<DetailsKey, DetailsRequest>>>({})
  const detailsRequestsRef = useRef<Partial<Record<DetailsKey, DetailsRequest>>>({})
  const [showHistory, setShowHistory] = useState(false)
  const [snapshots, setSnapshots] = useState<FolderSnapshotRow[]>()
  const [restoreTarget, setRestoreTarget] = useState<FolderSnapshotRow>()
  const [pendingImport, setPendingImport] = useState<string>()
  const [showStorageDetails, setShowStorageDetails] = useState(false)
  const importInputRef = useRef<HTMLInputElement | null>(null)
  const projection = state.projection
  const identity = state.identity
  const accountScopeId = identity.status === 'available' ? identity.identity.accountScopeId : undefined

  const storageRequest = detailsRequests.storage?.accountScopeId === accountScopeId ? detailsRequests.storage : undefined
  const historyRequest = detailsRequests.history?.accountScopeId === accountScopeId ? detailsRequests.history : undefined

  const readDetails = async <Result,>(key: DetailsKey, read: () => Promise<Result>, onSuccess?: (result: Result) => void) => {
    const pending = detailsRequestsRef.current[key]
    if (!accountScopeId || (pending?.accountScopeId === accountScopeId && pending.loading)) return
    const request: DetailsRequest = { accountScopeId, loading: true }
    detailsRequestsRef.current[key] = request
    setDetailsRequests({ ...detailsRequestsRef.current })
    const isCurrent = () => {
      const currentIdentity = folderRuntime.getSnapshot().identity
      return detailsRequestsRef.current[key] === request
        && currentIdentity.status === 'available'
        && currentIdentity.identity.accountScopeId === accountScopeId
    }
    let requestError: string | undefined
    try {
      const result = await read()
      if (isCurrent()) onSuccess?.(result)
    } catch (nextError) {
      if (isCurrent()) requestError = nextError instanceof Error ? nextError.message : tt('folders_save_failed', 'Could not complete this action.')
    } finally {
      if (detailsRequestsRef.current[key] === request) {
        detailsRequestsRef.current[key] = { ...request, loading: false, error: requestError }
        setDetailsRequests({ ...detailsRequestsRef.current })
      }
    }
  }

  useEffect(() => {
    setShowHistory(false)
    setSnapshots(undefined)
  }, [accountScopeId])

  useEffect(() => {
    if (!accountScopeId || isPanelOpen === false) return
    setShowStorageDetails(false)
    void readDetails('storage', () => folderRuntime.measureBrowserSyncUsage())
  }, [accountScopeId, isPanelOpen])

  const run = async (name: string, action: () => Promise<void>) => {
    setWorking(name)
    setError(undefined)
    setMessage(undefined)
    try {
      await action()
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : tt('folders_save_failed', 'Could not complete this action.'))
    } finally {
      setWorking(undefined)
    }
  }

  const savePreference = async (key: PreferenceKey, value: boolean) => {
    if (!accountScopeId || pendingPreferencesRef.current[key]?.accountScopeId === accountScopeId) return
    const pending = { accountScopeId, value }
    pendingPreferencesRef.current[key] = pending
    setPendingPreferences({ ...pendingPreferencesRef.current })
    setPreferenceError(undefined)
    try {
      await folderRuntime.updateSettings({ [key]: value })
    } catch (nextError) {
      setPreferenceError({
        accountScopeId,
        message: nextError instanceof Error ? nextError.message : tt('folders_save_failed', 'Could not complete this action.'),
      })
    } finally {
      if (pendingPreferencesRef.current[key] === pending) {
        delete pendingPreferencesRef.current[key]
        setPendingPreferences({ ...pendingPreferencesRef.current })
      }
    }
  }

  const pendingEnabled = pendingPreferences.enabled?.accountScopeId === accountScopeId ? pendingPreferences.enabled : undefined
  const pendingHide = pendingPreferences.hideOrganizedChats?.accountScopeId === accountScopeId ? pendingPreferences.hideOrganizedChats : undefined

  const handleImport = async (file: File | null) => {
    if (!file) return
    setError(undefined)
    await run('read-import', async () => setPendingImport(await file.text()))
  }

  const unavailable = identity.status !== 'available'
  const isManual = identity.status === 'available' && identity.identity.source === 'manual-confirmed'
  const capacityNoticeUsagePercent = state.syncState?.usagePercent
  const canShowCapacityDetails = !unavailable
  const busy = working !== undefined
  const syncNeedsAttention = !isManual && !unavailable && state.syncState?.state === 'needs-attention'
  const syncPending = !isManual && !unavailable && state.syncState?.state === 'local-changes-pending'
  const syncLabel = unavailable
    ? tt('folders_unavailable_label', 'Unavailable')
    : isManual
      ? tt('folders_manual_email', 'Manual email')
      : !state.syncState
        ? tt('folders_sync_status_checking', 'Checking sync status…')
        : syncNeedsAttention
          ? tt('folders_sync_status_attention', 'Sync needs attention')
          : syncPending
            ? tt('folders_sync_status_pending', 'Waiting to sync')
            : tt('folders_sync_status_saved', 'Saved to browser sync storage')

  const exportBackup = async () => {
    const content = await folderRuntime.exportJson()
    const suffix = identity.status === 'available' ? identity.identity.accountScopeId.slice(0, 8) : 'backup'
    downloadJson(`gemini-folders-${suffix}.json`, content)
    setMessage(tt('folders_exported', 'Folder backup exported.'))
  }

  return (
    <Box
      position="relative"
      height="100%"
      display="flex"
      flexDirection="column"
      data-view="folders-settings"
      color="gemOnSurface"
    >
      <Box flex="1" minHeight={0} overflow="auto">
        <Container maxWidth="740px" px={0}>
          <Stack align="stretch" gap={8} pb={2}>
            {message || error || state.error ? (
              <Box position="sticky" top={0} zIndex={1} bg="gemSurface" py={2}>
                {error || state.error ? (
                  <Text role="alert" color="fg.error" fontSize="sm">{error ?? state.error}</Text>
                ) : <Text role="status" aria-live="polite" color="fg.success" fontSize="sm">{message}</Text>}
              </Box>
            ) : null}

            <Stack gap={3} px={1}>
              <HStack justify="space-between" align="start" gap={3}>
                <Stack gap={1} minWidth={0}>
                  <Text fontSize="xs" color="gemOnSurfaceVariant">{tt('folders_account_title', 'Current Gemini account')}</Text>
                  {identity.status === 'available' ? (
                    <HStack gap={2} wrap="wrap">
                      <Text fontSize="sm" fontWeight="medium" overflowWrap="anywhere">{identity.identity.email}</Text>
                      {isManual ? (
                        <Badge colorPalette="orange" variant="subtle">{tt('folders_manual_email', 'Manual email')}</Badge>
                      ) : (
                        <HStack gap={1} color="gemOnSurfaceVariant" fontSize="xs">
                          <HiOutlineCheckCircle aria-hidden="true" />
                          <Text>{tt('folders_account_detected', 'Account identified')}</Text>
                        </HStack>
                      )}
                    </HStack>
                  ) : <Text fontSize="sm" color="gemOnSurfaceVariant">{tt('folders_unavailable', 'Folders is unavailable until Gemini account identity is resolved.')}</Text>}
                </Stack>
                <Button size="xs" variant="ghost" flexShrink={0} disabled={busy} loading={working === 'reload'} onClick={() => void run('reload', () => folderRuntime.reload())}>
                  <HiOutlineRefresh />{tt('folders_refresh', 'Refresh')}
                </Button>
              </HStack>
              {isManual ? (
                <Text fontSize="xs" color="fg.warning">{tt('folders_manual_scope_notice', 'Manual email only unlocks this page session. Recents hiding remains off.')}</Text>
              ) : null}
              {unavailable ? (
                <Field.Root>
                  <Field.Label fontSize="sm">{tt('folders_manual_email', 'Manual email')}</Field.Label>
                  <HStack width="100%" align="start" gap={2}>
                    <Input size="sm" value={manualEmail} disabled={busy} onChange={(event) => setManualEmail(event.target.value)} placeholder="you@example.com" type="email" />
                    <Button size="sm" disabled={busy} loading={working === 'identity'} onClick={() => void run('identity', async () => {
                      await folderRuntime.confirmManualEmail(manualEmail)
                      setMessage(tt('folders_manual_email_confirmed', 'Manual email confirmed for this page session.'))
                    })}>{tt('folders_confirm', 'Confirm')}</Button>
                  </HStack>
                  <Field.HelperText>{tt('folders_manual_email_help', 'This does not verify the Gemini account and does not enable Recents hiding or Drive sync.')}</Field.HelperText>
                </Field.Root>
              ) : null}
            </Stack>

            <SettingsSection id="folders-preferences-title" title={tt('folders_settings', 'Folder settings')}>
              <Switch.Root
                checked={pendingEnabled?.value ?? projection?.settings.enabled ?? false}
                disabled={unavailable || busy}
                readOnly={!!pendingEnabled}
                aria-busy={!!pendingEnabled}
                onCheckedChange={(event) => void savePreference('enabled', event.checked)}
                display="flex" width="100%" justifyContent="space-between" alignItems="center" gap={4} py={4}
              >
                <Switch.HiddenInput />
                <Switch.Label fontSize="sm" fontWeight="medium">{tt('folders_enabled', 'Enable Folders')}</Switch.Label>
                <Switch.Control flexShrink={0}><Switch.Thumb /></Switch.Control>
              </Switch.Root>
              <Separator borderColor="gemOnSurface/6" />
              <Switch.Root
                checked={pendingHide?.value ?? projection?.settings.hideOrganizedChats ?? false}
                disabled={unavailable || isManual || busy}
                readOnly={!!pendingHide}
                aria-busy={!!pendingHide}
                onCheckedChange={(event) => void savePreference('hideOrganizedChats', event.checked)}
                display="flex" width="100%" justifyContent="space-between" alignItems="center" gap={4} py={4}
              >
                <Switch.HiddenInput aria-describedby="folders-hide-help" />
                <Stack as="span" gap={1} flex={1} minWidth={0}>
                  <Switch.Label fontSize="sm" fontWeight="medium">{tt('folders_hide_organized', 'Hide chats already added to a Folder')}</Switch.Label>
                  <Text as="span" id="folders-hide-help" fontSize="xs" color="gemOnSurfaceVariant" lineHeight="tall">
                    {isManual ? tt('folders_manual_scope_notice', 'Manual email only unlocks this page session. Recents hiding remains off.') : tt('folders_hide_organized_help', 'Only hides matching rows in Gemini Recents. It never deletes Gemini chats.')}
                  </Text>
                </Stack>
                <Switch.Control flexShrink={0}><Switch.Thumb /></Switch.Control>
              </Switch.Root>
              {preferenceError && preferenceError.accountScopeId === accountScopeId ? (
                <Text role="alert" fontSize="xs" color="fg.error" pb={4}>{preferenceError.message}</Text>
              ) : null}
            </SettingsSection>

            <SettingsSection id="folders-sync-title" title={tt('folders_browser_sync', 'Browser Sync')}>
              <HStack justify="space-between" align="center" gap={4} py={4}>
                <Stack gap={1} flex={1} minWidth={0}>
                  <Text role="status" aria-live="polite" fontSize="sm" fontWeight="medium" color={syncNeedsAttention ? 'fg.error' : 'gemOnSurface'}>{syncLabel}</Text>
                  {isManual ? (
                    <Text fontSize="xs" color="fg.warning" lineHeight="tall">{tt('folders_sync_manual_notice', 'Browser Sync is unavailable until the Gemini account is identified.')}</Text>
                  ) : syncNeedsAttention ? (
                    <Text fontSize="xs" color="fg.error" lineHeight="tall">
                      {state.syncState?.warning === 'quota-exceeded'
                        ? tt('folders_sync_quota_exceeded', 'New changes are safely saved on this device, but are not yet synced to your other devices.')
                        : tt('folders_sync_needs_attention', 'Sync needs attention. Your new changes are safely saved on this device.')}
                    </Text>
                  ) : syncPending ? (
                    <Text fontSize="xs" color="gemOnSurfaceVariant" lineHeight="tall">{tt('folders_sync_pending', 'Saved on this device. Browser Sync will write it when available.')}</Text>
                  ) : null}
                </Stack>
                <Button size="sm" variant={syncNeedsAttention ? 'outline' : 'ghost'} flexShrink={0} disabled={unavailable || isManual || busy} loading={working === 'sync'} onClick={() => void run('sync', async () => {
                  await folderRuntime.syncNow()
                  setMessage(tt('folders_sync_requested', 'Browser Sync checked.'))
                })}>{tt('folders_sync_now', 'Sync now')}</Button>
              </HStack>
              {canShowCapacityDetails ? (
                <>
                  <Separator borderColor="gemOnSurface/6" />
                  <HStack justify="space-between" gap={4} py={4} wrap="wrap">
                    <Stack gap={1} flex={1} minWidth="180px">
                      <Text fontSize="sm" fontWeight="medium">{tt('folders_sync_usage', 'Current Folder sync storage')}</Text>
                      {state.syncState?.currentUsageBytes !== undefined && state.syncState.usageBudgetBytes !== undefined ? (
                        <Text fontSize="xs" color="gemOnSurfaceVariant" fontVariantNumeric="tabular-nums">
                          {formatStorageSize(state.syncState.currentUsageBytes)} / {formatStorageSize(state.syncState.usageBudgetBytes)}
                          {capacityNoticeUsagePercent !== undefined ? ` · ${Math.round(capacityNoticeUsagePercent)}%` : ''}
                        </Text>
                      ) : null}
                    </Stack>
                    <Button size="xs" variant="plain" color="gemOnSurfaceVariant" flexShrink={0} aria-expanded={showStorageDetails} aria-controls="folders-storage-details" onClick={() => {
                      setShowStorageDetails(!showStorageDetails)
                      if (!showStorageDetails) void readDetails('storage', () => folderRuntime.measureBrowserSyncUsage())
                    }}>
                      {tt('folders_sync_capacity_details', 'View storage details')}
                      <HiOutlineChevronDown aria-hidden="true" style={{ transform: showStorageDetails ? 'rotate(180deg)' : undefined }} />
                    </Button>
                  </HStack>
                </>
              ) : null}
              {state.syncState?.showCapacityNotice ? (
                <HStack align="start" gap={3} pb={4}>
                  <Text fontSize="xs" color="fg.warning" flex={1}>{tt('folders_sync_quota_warning', 'Browser Sync storage is filling up. Export a Folder backup.')}</Text>
                  {capacityNoticeUsagePercent !== undefined ? <Button size="xs" variant="ghost" disabled={busy} loading={working === 'dismiss-capacity'} onClick={() => void run('dismiss-capacity', () => folderRuntime.dismissCapacityNotice(capacityNoticeUsagePercent))}>
                    {tt('folders_sync_capacity_dismiss', 'Later')}
                  </Button> : null}
                </HStack>
              ) : null}
              {showStorageDetails ? <StorageDetails syncState={state.syncState} working={working} measuring={storageRequest?.loading ?? false} error={storageRequest?.error} onRefresh={() => void readDetails('storage', () => folderRuntime.measureBrowserSyncUsage())} onExport={() => void run('export', exportBackup)} /> : null}
            </SettingsSection>

            <SettingsSection id="folders-recovery-title" title={tt('folders_data_and_recovery', 'Data and recovery')}>
              <Stack direction={{ base: 'column', md: 'row' }} justify="space-between" align={{ base: 'stretch', md: 'center' }} gap={3} py={4}>
                <Stack gap={1} flex={1} minWidth={0}>
                  <Text fontSize="sm" fontWeight="medium">{tt('folders_restore_points', 'Restore points')}</Text>
                  <Text fontSize="xs" color="gemOnSurfaceVariant" lineHeight="tall">{tt('folders_restore_points_help', 'Save and restore your Folder organization on this device.')}</Text>
                </Stack>
                <HStack gap={2} flexShrink={0} wrap="wrap">
                  <Button size="sm" variant="outline" disabled={unavailable || busy} loading={working === 'snapshot'} onClick={() => void run('snapshot', async () => {
                    await folderRuntime.createSnapshot()
                    setMessage(tt('folders_restore_point_created', 'Restore point created.'))
                    if (showHistory) await readDetails('history', () => folderRuntime.listSnapshots(), setSnapshots)
                  })}>{tt('folders_create', 'Create')}</Button>
                  <Button size="sm" variant="ghost" disabled={unavailable} aria-expanded={showHistory} aria-controls="folders-restore-history" onClick={() => {
                    setShowHistory(!showHistory)
                    if (!showHistory) void readDetails('history', () => folderRuntime.listSnapshots(), setSnapshots)
                  }}>
                    {tt('folders_restore_history', 'Restore history')}
                    <HiOutlineChevronDown aria-hidden="true" style={{ transform: showHistory ? 'rotate(180deg)' : undefined }} />
                  </Button>
                </HStack>
              </Stack>
              {showHistory ? (
                <Stack id="folders-restore-history" aria-busy={historyRequest?.loading ?? false} gap={3} py={4} maxHeight="240px" overflow="auto" borderTopWidth="1px" borderColor="gemOnSurface/6">
                  {historyRequest?.error ? <Text role="alert" fontSize="xs" color="fg.error">{historyRequest.error}</Text> : null}
                  {snapshots?.length ? snapshots.map((snapshot) => (
                    <HStack key={snapshot.id} justify="space-between" align="start" gap={3} fontSize="xs">
                      <Text color="gemOnSurfaceVariant">{new Date(snapshot.createdAt).toLocaleString()} · {snapshot.reason.replace('-', ' ')}</Text>
                      <Button size="xs" variant="ghost" flexShrink={0} disabled={busy} onClick={() => setRestoreTarget(snapshot)}>{tt('folders_restore', 'Restore')}</Button>
                    </HStack>
                  )) : historyRequest?.error ? null : <Text fontSize="sm" color="gemOnSurfaceVariant">{historyRequest?.loading ? tt('bulkDelete.loading', 'Loading...') : tt('folders_no_restore_points', 'No restore points yet.')}</Text>}
                </Stack>
              ) : null}
              <Separator borderColor="gemOnSurface/6" />
              <Stack direction={{ base: 'column', md: 'row' }} justify="space-between" align={{ base: 'stretch', md: 'center' }} gap={3} py={4}>
                <Stack gap={1} flex={1} minWidth={0}>
                  <Text fontSize="sm" fontWeight="medium">{tt('folders_backup_file', 'Backup file')}</Text>
                  <Text fontSize="xs" color="gemOnSurfaceVariant" lineHeight="tall">{tt('folders_backup_file_help', 'Export or import Folder organization for the same Gemini account.')}</Text>
                </Stack>
                <HStack gap={2} flexShrink={0} wrap="wrap">
                  <Button size="sm" variant="ghost" disabled={unavailable || busy} loading={working === 'export'} onClick={() => void run('export', exportBackup)}><HiOutlineDownload />{tt('folders_export', 'Export')}</Button>
                  <Button size="sm" variant="ghost" disabled={unavailable || busy} loading={working === 'import' || working === 'read-import'} onClick={() => importInputRef.current?.click()}><HiOutlineUpload />{tt('folders_import', 'Import')}</Button>
                </HStack>
              </Stack>
              <input ref={importInputRef} hidden type="file" accept="application/json" onChange={(event) => {
                const file = event.currentTarget.files?.[0] ?? null
                event.currentTarget.value = ''
                void handleImport(file)
              }} />
            </SettingsSection>
          </Stack>
        </Container>
      </Box>

      <Dialog.Root open={Boolean(restoreTarget)} onOpenChange={(event) => { if (!event.open) setRestoreTarget(undefined) }} placement="center" size="sm" role="alertdialog">
        <Dialog.Backdrop />
        <Dialog.Positioner><Dialog.Content>
          <Dialog.Header><Dialog.Title>{tt('folders_restore', 'Restore')}</Dialog.Title></Dialog.Header>
          <Dialog.Body><Text>{tt('folders_restore_help', 'Restore this Folder organization? A new restore point will be created first. Your Folder enable, Recents visibility, and expanded/collapsed settings stay unchanged. Gemini chats are never changed.')}</Text></Dialog.Body>
          <Dialog.Footer><HStack justify="flex-end" width="100%"><Button variant="outline" onClick={() => setRestoreTarget(undefined)}>{tt('folders_cancel', 'Cancel')}</Button><Button loading={working === 'restore'} onClick={() => void run('restore', async () => { if (!restoreTarget) return; await folderRuntime.restore(restoreTarget); setRestoreTarget(undefined); setSnapshots(await folderRuntime.listSnapshots()); setMessage(tt('folders_restored', 'Folder organization restored.')) })}>{tt('folders_restore', 'Restore')}</Button></HStack></Dialog.Footer>
        </Dialog.Content></Dialog.Positioner>
      </Dialog.Root>

      <Dialog.Root open={pendingImport !== undefined} onOpenChange={(event) => { if (!event.open) setPendingImport(undefined) }} placement="center" size="sm" role="alertdialog">
        <Dialog.Backdrop />
        <Dialog.Positioner><Dialog.Content>
          <Dialog.Header><Dialog.Title>{tt('folders_import', 'Import')}</Dialog.Title></Dialog.Header>
          <Dialog.Body><Text>{tt('folders_import_help', 'Import replaces this account’s Folder organization after validation. A restore point will be created first. Your current Folder enable and Recents visibility settings stay unchanged. Gemini chats are never changed.')}</Text></Dialog.Body>
          <Dialog.Footer><HStack justify="flex-end" width="100%"><Button variant="outline" onClick={() => setPendingImport(undefined)}>{tt('folders_cancel', 'Cancel')}</Button><Button loading={working === 'import'} onClick={() => void run('import', async () => { if (!pendingImport) return; await folderRuntime.importJson(pendingImport); setPendingImport(undefined); setMessage(tt('folders_imported', 'Folder backup imported.')) })}>{tt('folders_import', 'Import')}</Button></HStack></Dialog.Footer>
        </Dialog.Content></Dialog.Positioner>
      </Dialog.Root>
    </Box>
  )
}

FoldersSettingsView.displayName = 'FoldersSettingsView'
