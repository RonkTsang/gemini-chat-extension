import type { FolderRow, FolderSettingsRow } from './types'

export interface FolderChatSummary {
  chatId: string
  cachedTitle: string
  orderKey: string
  pinnedOrderKey?: string
}

export interface FolderChatSummaryPage {
  items: FolderChatSummary[]
  nextCursor?: string
}

export interface FolderSidebarState {
  settings: FolderSettingsRow
  folders: Array<FolderRow & {
    chatCount: number
    collapsed: boolean
  }>
  nextCursor?: string
  chatsByFolder: Record<string, FolderChatSummaryPage>
}
