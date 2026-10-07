import type { FolderOrganizationCounts } from '@/domain/folder/organization-summary'
import { getCurrentLocale, t } from '@/utils/i18n'

export function formatOrganizationCounts(counts: Partial<FolderOrganizationCounts>): string | undefined {
  if (counts.folderCount === undefined || counts.chatCount === undefined) return undefined
  const locale = getCurrentLocale().replaceAll('_', '-')
  const plurals = new Intl.PluralRules(locale)
  const numbers = new Intl.NumberFormat(locale)
  const label = (count: number, key: string, noun: string) => {
    const id = `${key}_${plurals.select(count) === 'one' ? 'one' : 'other'}`
    const value = t(id, [numbers.format(count)])
    return value === id ? `${numbers.format(count)} ${noun}${count === 1 ? '' : 's'}` : value
  }
  const folders = label(counts.folderCount, 'folders_count', 'folder')
  const chats = label(counts.chatCount, 'folders_chat_count', 'chat')
  const value = t('folders_organization_counts', [folders, chats])
  return value === 'folders_organization_counts' ? `(${folders}, ${chats})` : value
}

export function formatStoragePercent(percent: number): string {
  return `${new Intl.NumberFormat(getCurrentLocale().replaceAll('_', '-'), { maximumFractionDigits: 1 }).format(percent)}%`
}

export function formatSyncOrganizationCounts(counts: Partial<FolderOrganizationCounts>): string | undefined {
  if (counts.folderCount === undefined || counts.chatCount === undefined) return undefined
  const locale = getCurrentLocale().replaceAll('_', '-')
  const plurals = new Intl.PluralRules(locale)
  const numbers = new Intl.NumberFormat(locale)
  const folderKey = `folders_count_${plurals.select(counts.folderCount) === 'one' ? 'one' : 'other'}`
  const chatKey = `folders_organized_chat_count_${plurals.select(counts.chatCount) === 'one' ? 'one' : 'other'}`
  const folderLabel = t(folderKey, [numbers.format(counts.folderCount)])
  const chatLabel = t(chatKey, [numbers.format(counts.chatCount)])
  const folders = folderLabel === folderKey ? `${numbers.format(counts.folderCount)} ${counts.folderCount === 1 ? 'folder' : 'folders'}` : folderLabel
  const chats = chatLabel === chatKey ? `${numbers.format(counts.chatCount)} organized ${counts.chatCount === 1 ? 'chat' : 'chats'}` : chatLabel
  const value = t('folders_sync_organization_counts', [folders, chats])
  return value === 'folders_sync_organization_counts' ? `${folders} · ${chats}` : value
}
