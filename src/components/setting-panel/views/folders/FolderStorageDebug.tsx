import { Button, HStack, Stack, Text } from '@chakra-ui/react'
import { useEffect, useRef, useState } from 'react'

import type { FolderLocalStorageStatus } from '@/domain/folder/types'
import type { BrowserSyncStatusProjection } from '@/entrypoints/content/folders/client'
import { folderRuntime } from '@/entrypoints/content/folders/runtime'
import { formatStorageSize } from './StorageDetails'

type DataRow = readonly [label: string, value: string | number | undefined]

function bytes(value?: number): string | undefined {
  return value === undefined ? undefined : `${value.toLocaleString('en')} B (${formatStorageSize(value)})`
}

function available(used?: number, limit?: number): string | undefined {
  if (used === undefined || limit === undefined || limit <= 0) return undefined
  const remaining = Math.max(0, limit - used)
  return `${bytes(remaining)} · ${(remaining / limit * 100).toFixed(1)}% available`
}

function DataRows({ title, rows, error }: { title: string; rows: DataRow[]; error?: string }) {
  return (
    <Stack gap={2}>
      <Text fontSize="xs" fontWeight="semibold">{title}</Text>
      {error ? <Text role="alert" fontSize="xs" color="fg.error">{error} Previous successful values are retained where available.</Text> : null}
      {rows.map(([label, value]) => (
        <HStack key={label} justify="space-between" gap={3} align="start" wrap="wrap" fontSize="xs">
          <Text color="gemOnSurfaceVariant">{label}</Text>
          <Text fontFamily="mono" fontVariantNumeric="tabular-nums" overflowWrap="anywhere">{value ?? 'Unavailable'}</Text>
        </HStack>
      ))}
    </Stack>
  )
}

// Measurements are requested from the extension background, never the Gemini origin.
export function FolderStorageDebug({ accountScopeId }: { accountScopeId: string }) {
  const [sync, setSync] = useState<BrowserSyncStatusProjection>()
  const [local, setLocal] = useState<FolderLocalStorageStatus>()
  const [errors, setErrors] = useState<{ sync?: string; local?: string }>({})
  const [loading, setLoading] = useState(false)
  const [checkedAt, setCheckedAt] = useState<string>()
  const active = useRef(false)
  const pending = useRef<symbol | undefined>(undefined)
  const current = () => {
    const identity = folderRuntime.getSnapshot().identity
    return active.current && identity.status === 'available' && identity.identity.accountScopeId === accountScopeId
  }
  const refresh = async () => {
    if (!current() || pending.current) return
    const request = Symbol('debug-storage')
    pending.current = request
    setLoading(true)
    const [syncResult, localResult] = await Promise.allSettled([
      folderRuntime.measureBrowserSyncUsage().then(() => folderRuntime.getSnapshot().syncState),
      folderRuntime.getLocalStorageStatus(),
    ])
    if (!current() || pending.current !== request) return
    if (syncResult.status === 'fulfilled') setSync(syncResult.value)
    if (localResult.status === 'fulfilled') setLocal(localResult.value)
    const message = (error: unknown) => error instanceof Error ? error.message : 'Measurement failed.'
    setErrors({
      sync: syncResult.status === 'rejected' ? message(syncResult.reason) : undefined,
      local: localResult.status === 'rejected' ? message(localResult.reason) : undefined,
    })
    setCheckedAt(new Date().toISOString())
    pending.current = undefined
    setLoading(false)
  }
  useEffect(() => {
    active.current = true
    void refresh()
    return () => { active.current = false; pending.current = undefined }
  }, [accountScopeId])

  const syncRemaining = sync?.currentUsageBytes !== undefined && sync.usageBudgetBytes && sync.usageBudgetBytes > 0
    ? Math.max(0, Math.min(sync.usageBudgetBytes - sync.currentUsageBytes,
      sync.currentTotalBytes !== undefined && sync.quotaBytes !== undefined ? sync.quotaBytes - sync.currentTotalBytes : Infinity))
    : undefined
  const effectiveRemaining = syncRemaining !== undefined && sync?.usageBudgetBytes
    ? `${bytes(syncRemaining)} · ${(syncRemaining / sync.usageBudgetBytes * 100).toFixed(1)}% available`
    : undefined
  return (
    <Stack gap={4} p={3} borderWidth="1px" borderColor="gemOnSurface/8" borderRadius="xl" data-control="folder-debug-storage" aria-busy={loading}>
      <HStack justify="space-between" gap={2} wrap="wrap">
        <Text fontSize="xs" fontWeight="semibold">Live storage data · Current account</Text>
        <Button size="xs" height="28px" variant="ghost" loading={loading} disabled={loading} onClick={() => void refresh()}>Refresh measurements</Button>
      </HStack>
      <Text fontSize="xs" color="gemOnSurfaceVariant">Actual measurements, independent of the simulated scenario. Missing values mean unavailable, not zero.</Text>
      <DataRows title="Browser Sync" error={errors.sync} rows={[
        ['Folder usage', bytes(sync?.currentUsageBytes)],
        ['Folder budget', bytes(sync?.usageBudgetBytes)],
        ['Folder budget remaining', available(sync?.currentUsageBytes, sync?.usageBudgetBytes)],
        ['Total extension sync usage', bytes(sync?.currentTotalBytes)],
        ['Extension sync quota', bytes(sync?.quotaBytes)],
        ['Extension sync remaining', available(sync?.currentTotalBytes, sync?.quotaBytes)],
        ['Effective Folder space remaining', effectiveRemaining],
        ['Projected Folder usage', bytes(sync?.projectedUsageBytes)],
        ['Projected extension sync usage', bytes(sync?.projectedTotalBytes)],
        ['Folders / organized chats', sync ? `${sync.folderCount ?? 'Unavailable'} / ${sync.chatCount ?? 'Unavailable'}` : undefined],
        ['State', sync?.state], ['Warning', sync ? sync.warning ?? 'None' : undefined],
        ['Capacity notice', sync ? String(sync.showCapacityNotice) : undefined],
        ['Usage measured at', sync?.usageMeasuredAt], ['Last local save', sync?.lastLocalSaveAt],
        ['Last browser storage write', sync?.lastBrowserStorageWriteAt], ['Retry at', sync?.retryAt],
      ]} />
      <DataRows title="Local storage and restore points" error={errors.local} rows={[
        ['Current account restore points', local?.snapshotCount], ['Latest restore point', local?.lastSnapshotAt],
        ['All accounts restore-point usage', bytes(local?.snapshotBytes)],
        ['Shared restore-point budget', bytes(local?.snapshotBudgetBytes)],
        ['Restore-point space remaining', available(local?.snapshotBytes, local?.snapshotBudgetBytes)],
        ['Estimated extension-origin usage', bytes(local?.usageBytes)],
        ['Estimated extension-origin quota', bytes(local?.quotaBytes)],
        ['Estimated local space remaining', available(local?.usageBytes, local?.quotaBytes)],
        ['unlimitedStorage granted', local ? String(local.unlimited) : undefined],
        ['Low storage', local ? String(local.low) : undefined],
        ['Recovery warning', local ? local.warning ?? 'None' : undefined],
        ['Automatic snapshot failed', local ? String(local.automaticSnapshotFailed ?? false) : undefined],
      ]} />
      <Text fontSize="xs" color="gemOnSurfaceVariant">Local estimates cover the extension origin and are diagnostic, not a write limit. Restore-point usage and its product budget are shared across accounts. unlimitedStorage does not increase that budget or Browser Sync capacity.</Text>
      {checkedAt ? <Text fontSize="xs" color="gemOnSurfaceVariant">Last refresh completed: {checkedAt}</Text> : null}
    </Stack>
  )
}
