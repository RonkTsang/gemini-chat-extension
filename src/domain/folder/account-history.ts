import { z } from 'zod'
import { extensionRpcRequestSchema } from '@/integrations/extension-rpc/contract'

export const folderAccountEmailSchema = z.string().max(320)
  .transform((email) => email.normalize('NFKC').trim().toLocaleLowerCase('en-US'))
  .pipe(z.string().email())

export const folderAccountSchema = z.object({
  email: folderAccountEmailSchema,
  accountScopeId: z.string().regex(/^[A-Za-z0-9_-]{16,128}$/u),
  lastUsedAt: z.string().datetime(),
})
export type FolderAccount = z.infer<typeof folderAccountSchema>

export const folderAccountHistorySchema = z.object({
  accounts: z.array(folderAccountSchema),
  recentAccountScopeId: z.string().optional(),
})
export type FolderAccountHistory = z.infer<typeof folderAccountHistorySchema>

export const folderAccountHistoryCommandSchema = z.discriminatedUnion('method', [
  z.object({ method: z.literal('get'), params: z.object({}) }),
  z.object({ method: z.literal('remember'), params: z.object({
    email: folderAccountEmailSchema, accountScopeId: folderAccountSchema.shape.accountScopeId,
  }) }),
  z.object({ method: z.literal('forget'), params: z.object({
    accountScopeId: folderAccountSchema.shape.accountScopeId,
  }) }),
])
export type FolderAccountHistoryCommand = z.infer<typeof folderAccountHistoryCommandSchema>

export const folderAccountHistoryRequestSchema = extensionRpcRequestSchema
  .extend({ namespace: z.literal('folder-accounts') })
  .strip()
  .and(folderAccountHistoryCommandSchema)
export type FolderAccountHistoryRequest = z.infer<typeof folderAccountHistoryRequestSchema>

export const folderAccountHistoryResponseSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), requestId: z.string().min(1).max(128), data: folderAccountHistorySchema }),
  z.object({ ok: z.literal(false), requestId: z.string().min(1).max(128) }),
])
