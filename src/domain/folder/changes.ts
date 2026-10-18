import { z } from 'zod'

export const folderAffectedSchema = z.object({
  all: z.literal(true).optional(),
  // Reload Folder structure/order, preserving surviving loaded chat ranges.
  folders: z.literal(true).optional(),
  // Summary-only changes versus membership ranges that must rebuild their cursors.
  folderMetadataIds: z.array(z.string().min(1)).max(1000).optional(),
  folderIds: z.array(z.string().min(1)).max(1000).optional(),
  chatIds: z.array(z.string().min(1)).max(1000).optional(),
  settings: z.boolean().optional(),
  syncStatus: z.boolean().optional(),
  recoveryStatus: z.boolean().optional(),
}).strict()
export type FolderAffected = z.infer<typeof folderAffectedSchema>

/** A complete change from one organization revision to the next; never persisted. */
export const folderChangeSchema = z.object({
  accountScopeId: z.string().min(1),
  requestId: z.string().min(1),
  baseRevision: z.string().min(1),
  dataRevision: z.string().min(1),
  affected: folderAffectedSchema,
})
export type FolderChange = z.infer<typeof folderChangeSchema>
