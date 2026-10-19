import { createHash } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { parseArgs } from 'node:util'

const { values } = parseArgs({ options: {
  scope: { type: 'string' }, folders: { type: 'string', default: '5' }, chats: { type: 'string', default: '10000' },
  seed: { type: 'string', default: 'phase-a-v1' }, output: { type: 'string', default: '/tmp/gpk-folder-performance.json' },
} })
if (!/^[A-Za-z0-9_-]{16,128}$/u.test(values.scope ?? '')) throw new Error('--scope must match the isolated test account scope in its exported backup')
const folderCount = Number(values.folders)
const chatCount = Number(values.chats)
if (![1, 5, 50].includes(folderCount) || ![10, 1000, 10000].includes(chatCount)) throw new Error('--folders: 1/5/50; --chats: 10/1000/10000')
if (!/^[A-Za-z0-9_-]{1,40}$/u.test(values.seed)) throw new Error('--seed must use 1-40 ASCII letters, numbers, dashes or underscores')
const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
const maximum = 62n ** 32n - 1n
const orderKey = (index, count) => {
  let number = maximum / BigInt(count + 1) * BigInt(index + 1)
  let key = ''
  for (let digit = 0; digit < 32; digit++) { key = alphabet[Number(number % 62n)] + key; number /= 62n }
  return key
}
const timestamp = '2026-10-18T00:00:00.000Z'
const folders = Array.from({ length: folderCount }, (_, index) => ({
  id: `${values.seed}-folder-${String(index).padStart(2, '0')}`, parentFolderId: '__root__', name: `Perf ${index + 1}`,
  iconKey: 'folder', colorValue: 'neutral', orderKey: orderKey(index, folderCount), createdAt: timestamp, updatedAt: timestamp,
}))
const chatReferences = Array.from({ length: chatCount }, (_, index) => ({
  chatId: createHash('sha256').update(`${values.seed}:${index}`).digest('hex').slice(0, 16), cachedTitle: `Synthetic chat ${index + 1}`,
  createdAt: timestamp, updatedAt: timestamp,
}))
const memberships = folders.flatMap((folder) => chatReferences.map(({ chatId }, index) => ({
  id: `${folder.id}:${chatId}`, folderId: folder.id, chatId, orderKey: orderKey(index, chatCount),
  ...(index % 7 === 0 ? { pinnedOrderKey: orderKey(index, chatCount) } : {}), createdAt: timestamp, updatedAt: timestamp,
})))
const backup = { schemaVersion: 1, accountScopeId: values.scope, exportedAt: timestamp, data: { folders, memberships, chatReferences } }
const json = JSON.stringify(backup)
await writeFile(values.output, json, { flag: 'wx' })
console.log(JSON.stringify({ output: values.output, seed: values.seed, folders: folderCount, memberships: memberships.length,
  uniqueChats: chatCount, jsonBytes: Buffer.byteLength(json) }, null, 2))
