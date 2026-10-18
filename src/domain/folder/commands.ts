import type { FolderColorValue, FolderIconKey } from './appearance'

export interface FolderUpdateInput {
  expectedRevision?: string
  name?: string
  iconKey?: FolderIconKey
  colorValue?: FolderColorValue
}
