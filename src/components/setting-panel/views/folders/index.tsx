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
import { HiOutlineDownload, HiOutlineRefresh, HiOutlineUpload } from 'react-icons/hi'
import { useRef, useState, useSyncExternalStore } from 'react'

import { folderRuntime } from '@/entrypoints/content/folders/runtime'
import { tt } from '@/utils/i18n'
import type { FolderSnapshotRow } from '@/domain/folder/types'
import type { SettingViewComponent } from '../../types'

function downloadJson(fileName: string, content: string): void {
  const blob = new Blob([content], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(url)
}

export const FoldersSettingsView: SettingViewComponent = () => {
  const state = useSyncExternalStore(folderRuntime.subscribe, folderRuntime.getSnapshot, folderRuntime.getSnapshot)
  const [manualEmail, setManualEmail] = useState('')
  const [working, setWorking] = useState<string>()
  const [message, setMessage] = useState<string>()
  const [error, setError] = useState<string>()
  const [snapshots, setSnapshots] = useState<FolderSnapshotRow[]>()
  const [restoreTarget, setRestoreTarget] = useState<FolderSnapshotRow>()
  const [pendingImport, setPendingImport] = useState<string>()
  const importInputRef = useRef<HTMLInputElement | null>(null)
  const projection = state.projection
  const identity = state.identity

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

  const handleImport = async (file: File | null) => {
    if (!file) return
    setError(undefined)
    setPendingImport(await file.text())
  }

  const unavailable = identity.status !== 'available'
  const isManual = identity.status === 'available' && identity.identity.source === 'manual-confirmed'

  return (
    <Box
      position="relative"
      height="100%"
      display="flex"
      flexDirection="column"
      data-view="folders-settings"
    >
      <Box flex="1" overflow="auto">
        <Container display="flex" justifyContent="center">
          <Stack direction="column" maxWidth="740px" width="100%" align="stretch" gap={4}>
            <Container backgroundColor="gemSurfaceContainer" p={4} borderRadius="2xl">
          <Stack gap={3}>
            <HStack justify="space-between" align="start">
              <Box>
                <Text fontWeight="semibold">{tt('folders_title', 'Folders')}</Text>
                <Text fontSize="sm" color="fg.muted">{tt('folders_browser_sync_help', 'Folder changes are saved on this device and browser sync will carry them to your other browser devices.')}</Text>
              </Box>
              <Badge colorPalette={identity.status === 'available' ? (isManual ? 'orange' : 'green') : 'gray'}>
                {identity.status === 'available' ? (isManual ? tt('folders_manual_email', 'Manual email') : tt('folders_observed_account', 'Observed account')) : tt('folders_unavailable_label', 'Unavailable')}
              </Badge>
            </HStack>
            <Separator />
            {identity.status === 'available' ? (
              <Stack gap={1} fontSize="sm">
                <Text><strong>{tt('folders_email', 'Email')}:</strong> {identity.identity.email}</Text>
                <Text color="fg.muted">{isManual ? tt('folders_manual_scope_notice', 'Manual email only unlocks this page session. Recents hiding remains off.') : tt('folders_identity_verified', 'Gemini account identity verified.')}</Text>
              </Stack>
            ) : (
              <Stack gap={2}>
                <Text fontSize="sm" color="fg.muted">{tt('folders_unavailable', 'Folders is unavailable until Gemini account identity is resolved.')}</Text>
                <Field.Root>
                  <Field.Label>{tt('folders_manual_email', 'Manual email')}</Field.Label>
                  <HStack align="start">
                    <Input value={manualEmail} onChange={(event) => setManualEmail(event.target.value)} placeholder="you@example.com" type="email" />
                    <Button loading={working === 'identity'} onClick={() => void run('identity', async () => {
                      await folderRuntime.confirmManualEmail(manualEmail)
                      setMessage(tt('folders_manual_email_confirmed', 'Manual email confirmed for this page session.'))
                    })}>{tt('folders_confirm', 'Confirm')}</Button>
                  </HStack>
                  <Field.HelperText>{tt('folders_manual_email_help', 'This does not verify the Gemini account and does not enable Recents hiding or Drive sync.')}</Field.HelperText>
                </Field.Root>
              </Stack>
            )}
          </Stack>
            </Container>

            <Container backgroundColor="gemSurfaceContainer" p={4} borderRadius="2xl">
              <HStack justify="space-between" align="center" gap={4}>
            <Box>
              <Text fontWeight="semibold">{tt('folders_browser_sync', 'Browser Sync')}</Text>
              <Text fontSize="sm" color={state.syncState?.state === 'needs-attention' ? 'fg.error' : 'fg.muted'}>
                {state.syncState?.state === 'needs-attention'
                  ? tt('folders_sync_needs_attention', 'Sync needs attention. Your new changes are safely saved on this device.')
                  : state.syncState?.state === 'local-changes-pending'
                    ? tt('folders_sync_pending', 'Saved on this device. Browser Sync will write it when available.')
                    : tt('folders_sync_saved', 'Saved to browser sync storage. Your browser will sync Folder data to your other browser devices.')}
              </Text>
              {state.syncState?.warning === 'near-quota' ? <Text fontSize="xs" color="fg.warning">{tt('folders_sync_quota_warning', 'Browser Sync storage is nearing capacity. Export a backup or connect Drive when available.')}</Text> : null}
            </Box>
            <Button size="sm" variant="outline" disabled={unavailable || isManual} loading={working === 'sync'} onClick={() => void run('sync', async () => { await folderRuntime.syncNow(); setMessage(tt('folders_sync_requested', 'Browser Sync checked.')) })}>
              {tt('folders_sync_now', 'Sync now')}
            </Button>
          </HStack>
            </Container>

            <Container backgroundColor="gemSurfaceContainer" p={4} borderRadius="2xl">
          <Stack gap={4}>
            <HStack justify="space-between">
              <Box>
                <Text fontWeight="semibold">{tt('folders_settings', 'Folder settings')}</Text>
                <Text fontSize="sm" color="fg.muted">{tt('folders_recents_description', 'Folder membership never changes or deletes Gemini chats.')}</Text>
              </Box>
              <Button size="sm" variant="outline" loading={working === 'reload'} onClick={() => void run('reload', () => folderRuntime.reload())}><HiOutlineRefresh />{tt('folders_refresh', 'Refresh')}</Button>
            </HStack>
            <Stack gap={3}>
              <Switch.Root checked={projection?.settings.enabled ?? false} disabled={unavailable || working !== undefined} onCheckedChange={(event) => void run('enabled', () => folderRuntime.updateSettings({ enabled: event.checked }))}>
                <Switch.HiddenInput />
                <Switch.Control><Switch.Thumb /></Switch.Control>
                <Switch.Label>{tt('folders_enabled', 'Enable Folders')}</Switch.Label>
              </Switch.Root>
              <Switch.Root checked={projection?.settings.hideOrganizedChats ?? false} disabled={unavailable || isManual || working !== undefined} onCheckedChange={(event) => void run('hide', () => folderRuntime.updateSettings({ hideOrganizedChats: event.checked }))}>
                <Switch.HiddenInput />
                <Switch.Control><Switch.Thumb /></Switch.Control>
                <Switch.Label>{tt('folders_hide_organized', 'Hide chats already added to a Folder')}</Switch.Label>
              </Switch.Root>
              <Text fontSize="xs" color="fg.muted">{isManual ? tt('folders_manual_scope_notice', 'Manual email only unlocks this page session. Recents hiding remains off.') : tt('folders_hide_organized_help', 'Only hides matching rows in Gemini Recents. It never deletes Gemini chats.')}</Text>
            </Stack>
          </Stack>
            </Container>

            <Container backgroundColor="gemSurfaceContainer" p={4} borderRadius="2xl">
          <Stack gap={3}>
            <Box>
              <Text fontWeight="semibold">{tt('folders_data_and_recovery', 'Data and recovery')}</Text>
              <Text fontSize="sm" color="fg.muted">{tt('folders_data_and_recovery_help', 'Create a restore point or move your Folder organization between matching Gemini accounts.')}</Text>
            </Box>
            <HStack gap={2} wrap="wrap">
              <Button variant="outline" disabled={unavailable} loading={working === 'snapshot'} onClick={() => void run('snapshot', async () => { await folderRuntime.createSnapshot(); setMessage(tt('folders_restore_point_created', 'Restore point created.')) })}>{tt('folders_create_restore_point', 'Create restore point')}</Button>
              <Button variant="outline" disabled={unavailable} loading={working === 'history'} onClick={() => void run('history', async () => { setSnapshots(await folderRuntime.listSnapshots()) })}>{tt('folders_history', 'History')}</Button>
              <Button variant="outline" disabled={unavailable} loading={working === 'export'} onClick={() => void run('export', async () => {
                const content = await folderRuntime.exportJson()
                const suffix = identity.status === 'available' ? identity.identity.accountScopeId.slice(0, 8) : 'backup'
                downloadJson(`gemini-folders-${suffix}.json`, content)
                setMessage(tt('folders_exported', 'Folder backup exported.'))
              })}><HiOutlineDownload />{tt('folders_export', 'Export')}</Button>
              <Button variant="outline" disabled={unavailable} loading={working === 'import'} onClick={() => importInputRef.current?.click()}><HiOutlineUpload />{tt('folders_import', 'Import')}</Button>
              <input ref={importInputRef} hidden type="file" accept="application/json" onChange={(event) => { const file = event.currentTarget.files?.[0] ?? null; event.currentTarget.value = ''; void handleImport(file) }} />
            </HStack>
            {snapshots ? (
              <Stack gap={2} pt={2}>
                {snapshots.length ? snapshots.map((snapshot) => (
                  <HStack key={snapshot.id} justify="space-between" fontSize="sm">
                    <Text>{new Date(snapshot.createdAt).toLocaleString()} · {snapshot.reason.replace('-', ' ')}</Text>
                    <Button size="xs" variant="outline" onClick={() => setRestoreTarget(snapshot)}>{tt('folders_restore', 'Restore')}</Button>
                  </HStack>
                )) : <Text fontSize="sm" color="fg.muted">{tt('folders_no_restore_points', 'No restore points yet.')}</Text>}
              </Stack>
            ) : null}
          </Stack>
            </Container>

            {message ? <Text color="fg.success" fontSize="sm">{message}</Text> : null}
            {error || state.error ? <Text color="fg.error" fontSize="sm">{error ?? state.error}</Text> : null}
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
