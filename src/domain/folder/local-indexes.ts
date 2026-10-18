import type { FolderMembershipRow, FolderRow } from './types'

export function folderNameKey(name: string): string {
  return name.normalize('NFKC').trim().toLocaleLowerCase('en-US')
}

export function membershipDisplayOrderKey(row: Pick<FolderMembershipRow, 'orderKey' | 'pinnedOrderKey'>): string {
  return row.pinnedOrderKey ? `0${row.pinnedOrderKey}` : `1${row.orderKey}`
}

export function indexFolder<T extends FolderRow>(row: T): T & { nameKey: string } {
  return { ...row, nameKey: folderNameKey(row.name) }
}

export function indexMembership<T extends FolderMembershipRow>(row: T): T & { displayOrderKey: string } {
  return { ...row, displayOrderKey: membershipDisplayOrderKey(row) }
}
