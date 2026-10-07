import { Button, HStack, Stack, Text } from '@chakra-ui/react'
import type { FolderLocalStorageStatus } from '@/domain/folder/types'
import { tt } from '@/utils/i18n'

interface LocalStorageDetailsProps {
  status?: FolderLocalStorageStatus
  warning?: FolderLocalStorageStatus['warning']
  automaticSnapshotFailed?: boolean
  busy: boolean
  onRetry: () => void
  onExport: () => void
}

export function LocalStorageDetails({ status, warning, automaticSnapshotFailed, busy, onRetry, onExport }: LocalStorageDetailsProps) {
  const recoveryWarning = status ? status.warning : warning
  const snapshotFailed = status ? status.automaticSnapshotFailed : automaticSnapshotFailed
  if (!snapshotFailed) return null
  const tooLarge = recoveryWarning === 'snapshot-too-large'
  const message = tooLarge
    ? tt('folders_snapshot_too_large_error', 'This restore point exceeds the recovery limit. Export a backup of your current Folder organization.')
    : recoveryWarning === 'budget-exceeded'
      ? tt('folders_snapshot_protected_budget_error', 'Protected restore points are temporarily using the recovery limit. Try again later.')
      : tt('folders_recovery_saved_but_snapshot_failed', 'Your Folder changes were saved, but the latest restore point could not be saved.')

  return (
    <Stack gap={2} pb={4} data-control="recovery-storage-warning">
      <Text role="status" fontSize="xs" color="fg.warning" lineHeight="tall">{message}</Text>
      <HStack gap={1} wrap="wrap">
        {!tooLarge ? <Button size="xs" height="28px" minHeight="28px" fontSize="xs" variant="ghost" disabled={busy} onClick={onRetry}>{tt('folders_recovery_retry', 'Retry')}</Button> : null}
        {tooLarge ? <Button size="xs" height="28px" minHeight="28px" fontSize="xs" variant="ghost" disabled={busy} onClick={onExport}>{tt('folders_export_backup', 'Export backup')}</Button> : null}
      </HStack>
    </Stack>
  )
}
