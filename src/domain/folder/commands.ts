import type { FolderColorValue, FolderIconKey } from './appearance'

export interface FolderUpdateInput {
  name?: string
  iconKey?: FolderIconKey
  colorValue?: FolderColorValue
}
