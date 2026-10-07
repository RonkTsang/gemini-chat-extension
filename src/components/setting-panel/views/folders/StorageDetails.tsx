import { Button, HStack, Stack, Text } from '@chakra-ui/react'
import { HiOutlineDownload, HiOutlineRefresh } from 'react-icons/hi'

import type { BrowserSyncStatusProjection } from '@/entrypoints/content/folders/client'
import { tt } from '@/utils/i18n'
import { formatOrganizationCounts, formatStoragePercent } from './organization-label'

interface StorageDetailsProps {
  syncState?: BrowserSyncStatusProjection
  working?: string
  measuring: boolean
  error?: string
  onRefresh: () => void
  onExport: () => void
}

export function formatStorageSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KiB', 'MiB', 'GiB', 'TiB']
  let value = bytes / 1024
  let index = 0
  while (value >= 1024 && index < units.length - 1) { value /= 1024; index += 1 }
  return `${Number(value.toFixed(1))} ${units[index]}`
}

export function StorageDetails({ syncState, working, measuring, error, onRefresh, onExport }: StorageDetailsProps) {
  const rows = [
    {
      label: tt('folders_sync_usage', 'Current Folder sync storage'),
      value: syncState?.currentUsageBytes,
      counts: syncState ? formatOrganizationCounts(syncState) : undefined,
      suffix: syncState?.usagePercent !== undefined ? ` (${formatStoragePercent(syncState.usagePercent)})` : '',
    },
    { label: tt('folders_sync_capacity_budget', 'Folder sync budget'), value: syncState?.usageBudgetBytes },
    {
      label: tt('folders_sync_total_usage', 'Total extension sync storage'),
      value: syncState?.currentTotalBytes,
      suffix: syncState?.quotaBytes !== undefined ? ` / ${syncState.quotaBytes} B` : '',
    },
    ...(syncState?.warning === 'quota-exceeded' ? [
      { label: tt('folders_sync_projected_usage', 'Estimated Folder storage after writing'), value: syncState.projectedUsageBytes },
      { label: tt('folders_sync_projected_total_usage', 'Estimated total sync storage after writing'), value: syncState.projectedTotalBytes },
    ] : []),
  ]

  return (
    <Stack id="folders-storage-details" aria-busy={measuring} gap={3} py={4} borderTopWidth="1px" borderColor="gemOnSurface/6">
      {rows.some((row) => row.value !== undefined) ? rows.map((row) => row.value !== undefined ? (
        <HStack key={row.label} justify="space-between" align="start" gap={4} fontSize="xs" wrap="wrap">
          <Stack gap={1}>
            <Text color="gemOnSurfaceVariant">{row.label}: </Text>
            {row.counts ? <Text color="gemOnSurfaceVariant">{row.counts}</Text> : null}
          </Stack>
          <Text fontVariantNumeric="tabular-nums">{row.value} B{row.suffix}</Text>
        </HStack>
      ) : null) : <Text fontSize="sm" color="gemOnSurfaceVariant">{tt('folders_sync_status_checking', 'Checking sync status…')}</Text>}
      {error ? <Text role="alert" fontSize="xs" color="fg.error">{error}</Text> : null}
      <HStack gap={2} wrap="wrap">
        <Button size="xs" variant="ghost" disabled={working !== undefined || measuring} loading={measuring} onClick={onRefresh}>
          <HiOutlineRefresh />{tt('folders_refresh', 'Refresh')}
        </Button>
        <Button size="xs" variant="ghost" disabled={working !== undefined} loading={working === 'export'} onClick={onExport}>
          <HiOutlineDownload />{tt('folders_export', 'Export')}
        </Button>
      </HStack>
    </Stack>
  )
}
