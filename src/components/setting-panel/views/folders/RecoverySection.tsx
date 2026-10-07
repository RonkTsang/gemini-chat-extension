import { Button, Dialog, HStack, IconButton, Portal, Separator, Stack, Text } from '@chakra-ui/react'
import { useEffect, useRef, useState } from 'react'
import { HiOutlineChevronDown, HiOutlineDownload, HiOutlineUpload } from 'react-icons/hi'
import { LuInfo } from 'react-icons/lu'

import { ToggleTip } from '@/components/ui/toggle-tip'
import { countFolderOrganization, type FolderOrganizationCounts } from '@/domain/folder/organization-summary'
import { folderExportPayloadSchema } from '@/domain/folder/schemas'
import type { FolderLocalStorageStatus, FolderSnapshotRow } from '@/domain/folder/types'
import { folderRuntime } from '@/entrypoints/content/folders/runtime'
import { getCurrentLocale, t, tt } from '@/utils/i18n'
import { LocalStorageDetails } from './LocalStorageDetails'
import { formatOrganizationCounts } from './organization-label'
import { SettingsSection } from './SettingsSection'
import { settingsToaster } from '../../toaster'

interface RecoverySectionProps {
  accountScopeId?: string
  isPanelOpen?: boolean
  warning?: FolderLocalStorageStatus['warning']
  automaticSnapshotFailed?: boolean
}

type RecoveryAction = 'snapshot' | 'restore' | 'export' | 'read-import' | 'import'
interface PendingImport { content: string; name: string; counts: FolderOrganizationCounts }

const compactAction = { size: 'xs', variant: 'ghost', height: '28px', minHeight: '28px', fontSize: 'xs', px: 2, gap: 1.5 } as const

function localized(key: string, fallback: string, values: string[]): string {
  const value = t(key, values)
  return value === key ? values.reduce((text, substitution, index) => text.replace(`$${index + 1}`, substitution), fallback) : value
}

export function RecoverySection({ accountScopeId, isPanelOpen, warning, automaticSnapshotFailed }: RecoverySectionProps) {
  const [status, setStatus] = useState<FolderLocalStorageStatus>()
  const [statusError, setStatusError] = useState<string>()
  const [snapshots, setSnapshots] = useState<FolderSnapshotRow[]>()
  const [historyError, setHistoryError] = useState<string>()
  const [historyLoading, setHistoryLoading] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [working, setWorking] = useState<RecoveryAction>()
  const [restoreTarget, setRestoreTarget] = useState<FolderSnapshotRow>()
  const [pendingImport, setPendingImport] = useState<PendingImport>()
  const inputRef = useRef<HTMLInputElement>(null)
  const active = useRef(true)
  const panelOpen = useRef(isPanelOpen !== false)
  const actionRequest = useRef<symbol | undefined>(undefined)
  const statusRequest = useRef<symbol | undefined>(undefined)
  const historyRequest = useRef<symbol | undefined>(undefined)
  const unavailable = !accountScopeId
  const busy = working !== undefined
  const locale = getCurrentLocale().replaceAll('_', '-')

  const current = () => {
    const identity = folderRuntime.getSnapshot().identity
    return active.current && identity.status === 'available' && identity.identity.accountScopeId === accountScopeId
  }

  const refreshStatus = async () => {
    if (!accountScopeId) return
    const request = Symbol('recovery-status')
    statusRequest.current = request
    try {
      const next = await folderRuntime.getLocalStorageStatus()
      if (current() && statusRequest.current === request) {
        setStatus(next)
        setStatusError(undefined)
      }
    } catch {
      if (current() && statusRequest.current === request) setStatusError(tt('folders_recovery_summary_failed', 'Restore-point status could not be checked.'))
    }
  }

  const refreshHistory = async (force = false) => {
    if (!accountScopeId || (historyRequest.current && !force)) return
    const request = Symbol('recovery-history')
    historyRequest.current = request
    setHistoryLoading(true)
    setHistoryError(undefined)
    try {
      const next = await folderRuntime.listSnapshots()
      if (current() && historyRequest.current === request) setSnapshots(next)
    } catch (error) {
      if (current() && historyRequest.current === request) setHistoryError(error instanceof Error ? error.message : tt('folders_save_failed', 'Could not complete this action.'))
    } finally {
      if (current() && historyRequest.current === request) {
        historyRequest.current = undefined
        setHistoryLoading(false)
      }
    }
  }

  useEffect(() => {
    active.current = true
    return () => { active.current = false }
  }, [])

  useEffect(() => { panelOpen.current = isPanelOpen !== false }, [isPanelOpen])

  useEffect(() => {
    if (!accountScopeId || isPanelOpen === false) return
    const refresh = () => void refreshStatus()
    refresh()
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [accountScopeId, isPanelOpen, warning, automaticSnapshotFailed])

  const run = async (action: RecoveryAction, operation: () => Promise<void>) => {
    if (!current() || actionRequest.current) return
    const request = Symbol(action)
    actionRequest.current = request
    setWorking(action)
    try {
      await operation()
    } catch (error) {
      if (current() && panelOpen.current) settingsToaster.create({ type: 'error', closable: true, title: error instanceof Error ? error.message : action === 'snapshot' ? tt('folders_recovery_manual_failed', 'Restore point could not be created.') : tt('folders_save_failed', 'Could not complete this action.') })
    } finally {
      if (current() && actionRequest.current === request) {
        actionRequest.current = undefined
        setWorking(undefined)
        if (action !== 'export' && action !== 'read-import') void refreshStatus()
      }
    }
  }

  const success = (message: string) => {
    if (current() && panelOpen.current) settingsToaster.create({ type: 'success', closable: true, title: message })
  }

  const createRestorePoint = () => run('snapshot', async () => {
    await folderRuntime.createSnapshot()
    if (!current()) return
    success(tt('folders_restore_point_created', 'Restore point created.'))
    if (showHistory) await refreshHistory(true)
  })

  const exportBackup = async () => {
    const content = await folderRuntime.exportJson()
    if (!current()) return
    const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `gemini-folders-${accountScopeId?.slice(0, 8)}.json`
    anchor.click()
    URL.revokeObjectURL(url)
    success(tt('folders_exported', 'Folder backup exported.'))
  }

  const readImport = (file?: File) => {
    if (!file) return
    void run('read-import', async () => {
      const content = await file.text()
      if (!current()) return
      let payload: unknown
      try { payload = JSON.parse(content) } catch { throw new Error(tt('folders_backup_invalid', 'This file is not a valid Folder backup.')) }
      const result = folderExportPayloadSchema.safeParse(payload)
      if (!result.success) throw new Error(tt('folders_backup_invalid', 'This file is not a valid Folder backup.'))
      if (result.data.accountScopeId !== accountScopeId) throw new Error(tt('folders_backup_account_mismatch', 'This backup belongs to a different Gemini account.'))
      setPendingImport({ content, name: file.name, counts: countFolderOrganization(result.data.folders, result.data.memberships) })
    })
  }

  const snapshotCount = status?.snapshotCount
  const countLabel = snapshotCount === undefined ? undefined : localized(
    `folders_recovery_count_${new Intl.PluralRules(locale).select(snapshotCount) === 'one' ? 'one' : 'other'}`,
    snapshotCount === 1 ? '$1 restore point' : '$1 restore points',
    [new Intl.NumberFormat(locale).format(snapshotCount)],
  )
  const lastSaved = status?.lastSnapshotAt ? localized('folders_recovery_last_saved', 'Last saved $1', [new Date(status.lastSnapshotAt).toLocaleString(locale, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })]) : undefined

  return (
    <SettingsSection id="folders-recovery-title" title={tt('folders_data_and_recovery', 'Data and recovery')}>
      <Stack gap={2} py={4} data-control="restore-points">
        <HStack justify="space-between" align="start" gap={2} wrap="wrap">
          <HStack gap={1}>
            <Text fontSize="sm" fontWeight="medium">{tt('folders_restore_points', 'Restore points')}</Text>
            <ToggleTip positioning={{ placement: 'bottom-start', fitViewport: true }} contentProps={{ maxWidth: '320px', maxHeight: 'var(--available-height)', overflow: 'hidden' }} bodyProps={{ overflowY: 'auto', maxHeight: 'var(--available-height)' }} content={(
              <Stack gap={3}>
                <Text fontSize="xs" lineHeight="tall">{tt('folders_recovery_info_help', 'Restore points are saved only on this device for the current Gemini account. Keep up to 10, with no time expiry. Continuous changes are grouped. Accounts share restore-point storage, so older points may be removed to make room. Restoring changes Folder organization, never Gemini chats.')}</Text>
              </Stack>
            )}>
              <IconButton aria-label={tt('folders_recovery_info_label', 'About restore points')} size="2xs" variant="ghost" color="gemOnSurfaceVariant"><LuInfo aria-hidden="true" /></IconButton>
            </ToggleTip>
          </HStack>
          <HStack gap={1} flexShrink={0} wrap="wrap">
            <Button {...compactAction} disabled={unavailable} aria-expanded={showHistory} aria-controls="folders-restore-history" onClick={() => { setShowHistory(!showHistory); if (!showHistory) void refreshHistory() }}>
              {tt('folders_recovery_history', 'View history')}<HiOutlineChevronDown aria-hidden="true" size={14} style={{ transform: showHistory ? 'rotate(180deg)' : undefined }} />
            </Button>
            <Button {...compactAction} disabled={unavailable || busy} loading={working === 'snapshot'} onClick={() => void createRestorePoint()}>{tt('folders_create_restore_point', 'Create restore point')}</Button>
          </HStack>
        </HStack>
        <Text fontSize="xs" color="gemOnSurfaceVariant" lineHeight="tall">{tt('folders_recovery_intro', 'Automatically saves your Folder organization so you can restore an earlier version.')}</Text>
        {!unavailable ? <Text fontSize="xs" color={statusError ? 'fg.error' : 'gemOnSurfaceVariant'} role="status" aria-live="polite">{statusError ?? (countLabel ? [countLabel, lastSaved].filter(Boolean).join(' · ') : tt('folders_recovery_loading', 'Checking restore points…'))}</Text> : null}
      </Stack>
      {showHistory ? (
        <Stack id="folders-restore-history" aria-busy={historyLoading} gap={3} p={4} mb={4} bg="gemOnSurface/4" borderRadius="xl" maxHeight="240px" overflow="auto">
          {historyError ? <Text role="alert" fontSize="xs" color="fg.error">{historyError}</Text> : null}
          {snapshots?.length ? snapshots.map((snapshot) => (
            <HStack key={snapshot.id} justify="space-between" align="start" gap={3}>
              <Stack gap={1} flex={1} minWidth={0}>
                <Text fontSize="xs" color="gemOnSurfaceVariant">{new Date(snapshot.updatedAt ?? snapshot.createdAt).toLocaleString(locale)} · {(snapshot.reasons ?? [snapshot.reason]).map((reason) => tt(`folders_snapshot_reason_${reason.replaceAll('-', '_')}`, reason.replaceAll('-', ' '))).join(' · ')}</Text>
                <Text fontSize="xs" color="gemOnSurfaceVariant">{formatOrganizationCounts(snapshot)}</Text>
              </Stack>
              <Button {...compactAction} flexShrink={0} disabled={busy} onClick={() => {
                setRestoreTarget(snapshot)
              }}>{tt('folders_restore', 'Restore')}</Button>
            </HStack>
          )) : historyError ? null : <Text fontSize="xs" color="gemOnSurfaceVariant">{historyLoading ? tt('bulkDelete.loading', 'Loading...') : tt('folders_no_restore_points', 'No restore points yet.')}</Text>}
        </Stack>
      ) : null}
      <LocalStorageDetails status={status} warning={warning} automaticSnapshotFailed={automaticSnapshotFailed} busy={busy || unavailable} onRetry={() => void createRestorePoint()} onExport={() => void run('export', exportBackup)} />
      <Separator borderColor="gemOnSurface/6" />
      <Stack gap={2} py={4} data-control="backup-file">
        <HStack justify="space-between" align="start" gap={2} wrap="wrap">
          <Text fontSize="sm" fontWeight="medium">{tt('folders_backup_file', 'Backup file')}</Text>
          <HStack gap={1} flexShrink={0} wrap="wrap">
            <Button {...compactAction} disabled={unavailable || busy} loading={working === 'export'} onClick={() => void run('export', exportBackup)}><HiOutlineDownload aria-hidden="true" size={14} />{tt('folders_export_backup', 'Export backup')}</Button>
            <Button {...compactAction} disabled={unavailable || busy} loading={working === 'import' || working === 'read-import'} onClick={() => inputRef.current?.click()}><HiOutlineUpload aria-hidden="true" size={14} />{tt('folders_import_backup', 'Import backup')}</Button>
          </HStack>
        </HStack>
        <Text fontSize="xs" color="gemOnSurfaceVariant" lineHeight="tall">{tt('folders_backup_intro', 'Save your Folder organization to a file, or restore it from a backup for this Gemini account.')}</Text>
      </Stack>
      <input ref={inputRef} hidden type="file" accept="application/json" onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; readImport(file) }} />
      <Dialog.Root open={Boolean(restoreTarget)} closeOnInteractOutside={false} onOpenChange={(event) => { if (!event.open && !busy) setRestoreTarget(undefined) }} placement="center" size="sm" role="alertdialog">
        <Portal><Dialog.Backdrop /><Dialog.Positioner><Dialog.Content>
          <Dialog.Header><Dialog.Title>{tt('folders_restore', 'Restore')}</Dialog.Title></Dialog.Header>
          <Dialog.Body><Stack gap={3}>
            {restoreTarget ? <Text fontSize="sm">{formatOrganizationCounts(restoreTarget)}</Text> : null}
            <Text>{tt('folders_restore_help', 'Restore this Folder organization? A new restore point will be created first. Your Folder enable, Recents visibility, and expanded/collapsed settings stay unchanged. Gemini chats are never changed.')}</Text>
          </Stack></Dialog.Body>
          <Dialog.Footer><Button variant="outline" disabled={busy} onClick={() => setRestoreTarget(undefined)}>{tt('folders_cancel', 'Cancel')}</Button><Button disabled={busy} loading={working === 'restore'} onClick={() => void run('restore', async () => {
            if (!restoreTarget) return
            await folderRuntime.restore(restoreTarget)
            if (!current()) return
            setRestoreTarget(undefined)
            success(tt('folders_restored', 'Folder organization restored.'))
            if (showHistory) await refreshHistory(true)
          })}>{tt('folders_restore', 'Restore')}</Button></Dialog.Footer>
        </Dialog.Content></Dialog.Positioner></Portal>
      </Dialog.Root>
      <Dialog.Root open={Boolean(pendingImport)} closeOnInteractOutside={false} onOpenChange={(event) => { if (!event.open && !busy) setPendingImport(undefined) }} placement="center" size="sm" role="alertdialog">
        <Portal><Dialog.Backdrop /><Dialog.Positioner><Dialog.Content>
          <Dialog.Header><Dialog.Title>{tt('folders_import_backup', 'Import backup')}</Dialog.Title></Dialog.Header>
          <Dialog.Body><Stack gap={3}>
            {pendingImport ? <><Text fontSize="sm" overflowWrap="anywhere">{pendingImport.name}</Text><Text fontSize="sm">{formatOrganizationCounts(pendingImport.counts)}</Text></> : null}
            <Text>{tt('folders_import_help', 'Import replaces this account’s Folder organization after validation. A restore point will be created first. Your current Folder enable and Recents visibility settings stay unchanged. Gemini chats are never changed.')}</Text>
          </Stack></Dialog.Body>
          <Dialog.Footer><Button variant="outline" disabled={busy} onClick={() => setPendingImport(undefined)}>{tt('folders_cancel', 'Cancel')}</Button><Button disabled={busy} loading={working === 'import'} onClick={() => void run('import', async () => {
            if (!pendingImport) return
            await folderRuntime.importJson(pendingImport.content)
            if (!current()) return
            setPendingImport(undefined)
            success(tt('folders_imported', 'Folder backup imported.'))
            if (showHistory) await refreshHistory(true)
          })}>{tt('folders_import', 'Import')}</Button></Dialog.Footer>
        </Dialog.Content></Dialog.Positioner></Portal>
      </Dialog.Root>
    </SettingsSection>
  )
}
