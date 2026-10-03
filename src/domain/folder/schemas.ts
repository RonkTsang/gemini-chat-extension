import { z } from 'zod'

import {
  FOLDER_ICON_KEYS,
  FOLDER_PRESET_COLOR_KEYS,
  type FolderCustomColor,
} from './appearance'
import {
  ROOT_FOLDER_ID,
  type BrowserSyncManifest,
  type FolderAccountData,
  type FolderSyncData,
  type FolderExportPayload,
} from './types'
import { validateAndProjectFolderTree } from './tree-projection'

const versionStampSchema = z.string().min(1).max(160)
const accountScopeSchema = z.string().min(16).max(128)
const timestampSchema = z.string().datetime()
const orderKeySchema = z.string().regex(/^[0-9A-Za-z]+$/).length(32)
const folderIconKeySchema = z.enum(FOLDER_ICON_KEYS)
const folderColorValueSchema = z.union([
  z.enum(FOLDER_PRESET_COLOR_KEYS),
  z.string()
    .regex(/^#[0-9a-f]{6}$/iu)
    .transform((value) => value.toLowerCase() as FolderCustomColor),
])

export const folderRowSchema = z.object({
  id: z.string().min(1),
  accountScopeId: accountScopeSchema,
  parentFolderId: z.string().min(1).default(ROOT_FOLDER_ID),
  name: z.string().transform((value) => value.normalize('NFKC').trim()).pipe(z.string().min(1).max(60)),
  iconKey: folderIconKeySchema,
  colorValue: folderColorValueSchema,
  orderKey: orderKeySchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  versionStamp: versionStampSchema,
  fieldVersions: z.object({
    name: versionStampSchema,
    iconKey: versionStampSchema,
    colorValue: versionStampSchema,
    position: versionStampSchema,
  }),
  deletedAt: timestampSchema.optional(),
  deleteVersionStamp: versionStampSchema.optional(),
})

export const folderMembershipRowSchema = z.object({
  id: z.string().min(1),
  accountScopeId: accountScopeSchema,
  folderId: z.string().min(1),
  chatId: z.string().min(1),
  orderKey: orderKeySchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  versionStamp: versionStampSchema,
  positionVersionStamp: versionStampSchema,
  pinnedOrderKey: orderKeySchema.optional(),
  pinVersionStamp: versionStampSchema.optional(),
  deletedAt: timestampSchema.optional(),
  deleteVersionStamp: versionStampSchema.optional(),
})

export const chatReferenceRowSchema = z.object({
  accountScopeId: accountScopeSchema,
  chatId: z.string().min(1),
  cachedTitle: z.string().max(500),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  titleVersionStamp: versionStampSchema,
})

export const folderSyncSettingsSchema = z.object({
  enabled: z.boolean(),
  hideOrganizedChats: z.boolean(),
}).strict()

export const folderSettingsPatchSchema = z.object({
  enabled: z.boolean().optional(),
  hideOrganizedChats: z.boolean().optional(),
  collapsedFolderIds: z.array(z.string().min(1)).max(500).optional(),
}).strict()

export const settingsVersionSchema = z.string().regex(/^\d{13}:\d{6}:[A-Za-z0-9_.-]+$/u).max(160)

const accountDataShape = {
  accountScopeId: accountScopeSchema,
  folders: z.array(folderRowSchema),
  memberships: z.array(folderMembershipRowSchema),
  chatReferences: z.array(chatReferenceRowSchema),
}

function validateAccountData(value: FolderAccountData, ctx: z.RefinementCtx): void {
  const scopedRows = [...value.folders, ...value.memberships, ...value.chatReferences]
  if (scopedRows.some((row) => row.accountScopeId !== value.accountScopeId)) {
    ctx.addIssue({ code: 'custom', message: 'Data contains a different account scope' })
  }

  const folderIds = new Set(value.folders.map((row) => row.id))
  if (folderIds.size !== value.folders.length) {
    ctx.addIssue({ code: 'custom', message: 'Duplicate folder id' })
  }
  const membershipIds = new Set(value.memberships.map((row) => row.id))
  if (membershipIds.size !== value.memberships.length) {
    ctx.addIssue({ code: 'custom', message: 'Duplicate membership id' })
  }
  const membershipPairs = new Set(value.memberships.map((row) => `${row.folderId}\u0000${row.chatId}`))
  if (membershipPairs.size !== value.memberships.length) {
    ctx.addIssue({ code: 'custom', message: 'Duplicate folder/chat membership' })
  }
  const chatIds = new Set(value.chatReferences.map((row) => row.chatId))
  if (chatIds.size !== value.chatReferences.length) {
    ctx.addIssue({ code: 'custom', message: 'Duplicate chat reference' })
  }
  for (const membership of value.memberships) {
    if (!folderIds.has(membership.folderId)) {
      ctx.addIssue({ code: 'custom', message: 'Membership references missing folder' })
    }
    if (!chatIds.has(membership.chatId)) {
      ctx.addIssue({ code: 'custom', message: 'Membership references missing chat reference' })
    }
  }
  const tree = validateAndProjectFolderTree(value.folders)
  if (!tree.ok) {
    ctx.addIssue({ code: 'custom', message: `Invalid folder tree: ${tree.reason}` })
  }
}

export const folderAccountDataSchema = z.object(accountDataShape).strict().superRefine(validateAccountData)

export const folderSyncDataSchema = z.object({
  folders: z.array(folderRowSchema.omit({ accountScopeId: true }).strict()),
  memberships: z.array(folderMembershipRowSchema.omit({ accountScopeId: true }).strict()),
  chatReferences: z.array(chatReferenceRowSchema.omit({ accountScopeId: true }).strict()),
}).strict()

export const folderExportPayloadSchema = z.object({
  schemaVersion: z.literal(1),
  ...accountDataShape,
  settings: folderSyncSettingsSchema,
  settingsVersion: settingsVersionSchema,
  exportedAt: timestampSchema,
}).strict().superRefine(validateAccountData)

export const browserSyncManifestSchema = z.object({
  schemaVersion: z.literal(3),
  accountScopeId: accountScopeSchema,
  generationId: z.string().min(1).max(128),
  dataRevision: z.string().min(1).max(256),
  authorityEpoch: z.string().min(1).max(128),
  chunkCount: z.number().int().min(1).max(512),
  payloadBytes: z.number().int().positive().max(70 * 1024),
  payloadHash: z.string().regex(/^[a-f0-9]{64}$/),
  settings: folderSyncSettingsSchema,
  settingsVersion: settingsVersionSchema,
}).strict()

export function parseFolderAccountData(value: unknown): FolderAccountData {
  return folderAccountDataSchema.parse(value)
}

export function parseFolderSyncData(value: unknown): FolderSyncData {
  return folderSyncDataSchema.parse(value)
}

export function parseFolderExportPayload(value: unknown): FolderExportPayload {
  return folderExportPayloadSchema.parse(value)
}

export function parseBrowserSyncManifest(value: unknown): BrowserSyncManifest {
  return browserSyncManifestSchema.parse(value)
}
