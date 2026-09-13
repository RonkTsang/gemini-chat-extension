import { ROOT_FOLDER_ID, type FolderRow } from './types'
import { compareAscii } from './order-key'

export interface FolderTreeNode extends FolderRow { children: FolderTreeNode[] }
export type FolderTreeProjectionResult = { ok: true; roots: FolderTreeNode[] } | { ok: false; reason: 'duplicate-id' | 'cross-account' | 'orphan' | 'cycle' | 'depth-exceeded'; folderId?: string }

export function validateAndProjectFolderTree(rows: FolderRow[]): FolderTreeProjectionResult {
  const active = rows.filter(row => !row.deletedAt)
  if (new Set(active.map(row => row.id)).size !== active.length) return { ok: false, reason: 'duplicate-id' }
  const account = active[0]?.accountScopeId
  if (account && active.some(row => row.accountScopeId !== account)) return { ok: false, reason: 'cross-account' }
  const nodes = new Map<string, FolderTreeNode>(active.map(row => [row.id, { ...row, children: [] }]))
  for (const node of nodes.values()) {
    const seen = new Set<string>(); let current: FolderTreeNode | undefined = node; let depth = 0
    while (current && current.parentFolderId !== ROOT_FOLDER_ID) {
      if (seen.has(current.id)) return { ok: false, reason: 'cycle', folderId: current.id }
      seen.add(current.id); depth += 1
      if (depth > 32) return { ok: false, reason: 'depth-exceeded', folderId: node.id }
      current = nodes.get(current.parentFolderId)
      if (!current) return { ok: false, reason: 'orphan', folderId: node.id }
    }
  }
  const roots: FolderTreeNode[] = []
  for (const node of nodes.values()) {
    if (node.parentFolderId === ROOT_FOLDER_ID) roots.push(node)
    else {
      const parent = nodes.get(node.parentFolderId)
      if (!parent) return { ok: false, reason: 'orphan', folderId: node.id }
      parent.children.push(node)
    }
  }
  const sort = (items: FolderTreeNode[], depth = 1): FolderTreeProjectionResult | undefined => { if (depth > 32) return { ok: false, reason: 'depth-exceeded' }; items.sort((a, b) => compareAscii(a.orderKey, b.orderKey) || compareAscii(a.id, b.id)); for (const item of items) { const result = sort(item.children, depth + 1); if (result) return result }; return undefined }
  const topology = new Set<string>(); const visit = (node: FolderTreeNode): FolderTreeProjectionResult | undefined => { if (topology.has(node.id)) return { ok: false, reason: 'cycle', folderId: node.id }; topology.add(node.id); for (const child of node.children) { const result = visit(child); if (result) return result }; topology.delete(node.id); return undefined }
  for (const root of roots) { const result = visit(root); if (result) return result }
  const result = sort(roots); return result ?? { ok: true, roots }
}

export function projectFolderTree(rows: FolderRow[]): FolderTreeNode[] { const result = validateAndProjectFolderTree(rows); if (!result.ok) throw new Error(`Invalid folder tree: ${result.reason}`); return result.roots }
