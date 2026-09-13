import { z } from 'zod'

import {
  FOLDER_ICON_KEYS,
  FOLDER_PRESET_COLOR_KEYS,
  type FolderCustomColor,
} from './appearance'
import {
  ROOT_FOLDER_ID,
  type FolderExportPayload,
  type FolderSyncEnvelope,
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

const settingsSchema = z.object({
  accountScopeId: accountScopeSchema,
  enabled: z.boolean(),
  hideOrganizedChats: z.boolean(),
  collapsedFolderIds: z.array(z.string().min(1)),
  updatedAt: timestampSchema,
  fieldVersions: z.record(z.string(), versionStampSchema),
})

export const folderExportPayloadSchema = z.object({
  schemaVersion: z.literal(1),
  accountScopeId: accountScopeSchema,
  folders: z.array(folderRowSchema),
  memberships: z.array(folderMembershipRowSchema),
  chatReferences: z.array(chatReferenceRowSchema),
  settings: settingsSchema,
  exportedAt: timestampSchema,
}).superRefine((value, ctx) => {
  const scopedRows = [...value.folders, ...value.memberships, ...value.chatReferences, value.settings]
  if (scopedRows.some((row) => row.accountScopeId !== value.accountScopeId)) {
    ctx.addIssue({ code: 'custom', message: 'Export contains a different account scope' })
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
})

export const folderSyncEnvelopeSchema = z.object({
  appId: z.literal('gemini-power-kit-folders'),
  schemaVersion: z.literal(1),
  syncProtocolVersion: z.literal(1),
  accountScopeId: accountScopeSchema,
  authority: z.object({
    provider: z.enum(['browser-sync', 'google-drive']),
    epoch: z.string().min(1),
  }),
  dataRevision: z.string().min(1),
  parentRevisions: z.array(z.string().min(1)),
  generatedByDeviceId: z.string().min(1),
  generatedAt: timestampSchema,
  encoding: z.object({ codec: z.literal('lz-string-base64'), codecVersion: z.literal(1) }),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  payload: z.string().min(1),
}).superRefine((value, ctx) => {
  if (!value.authority.epoch.trim()) {
    ctx.addIssue({ code: 'custom', message: 'Envelope authority epoch is required' })
  }
})

export function parseFolderExportPayload(value: unknown): FolderExportPayload {
  return folderExportPayloadSchema.parse(value)
}

export function parseFolderSyncEnvelope(value: unknown): FolderSyncEnvelope {
  return folderSyncEnvelopeSchema.parse(value)
}
