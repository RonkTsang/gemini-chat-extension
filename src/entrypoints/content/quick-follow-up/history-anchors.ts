import { attachSelectionAnchors, baselineQueries, listUserQueries, readRawQuery } from './dom'
import { parseDisplayMessage, serializeMessage, type QuoteAnchor, type SelectionItem } from './protocol'

type Snapshot = {
  scope: string
  key: string
  anchors: Array<QuoteAnchor | undefined>
  baseline: WeakSet<Element>
  expiresAt: number
}

const RETENTION_MS = 15_000
const MAX_RECENT_DRAFTS = 10

/** Optional history decoration; it never controls editing, sending or draft cleanup. */
export function createHistoryAnchorTracker() {
  let current: Snapshot | null = null
  let recent: Snapshot[] = []
  let linked = new WeakMap<Element, Snapshot>()

  const prune = () => { recent = recent.filter(snapshot => snapshot.expiresAt > Date.now()) }

  const update = (items: readonly SelectionItem[], chat: Element | null, scope: string) => {
    if (!items.length || !chat) {
      current = null
      return
    }
    current = {
      scope,
      key: JSON.stringify(parseDisplayMessage(serializeMessage(items, ''))?.selections),
      anchors: items.map(item => item.anchor ? { ...item.anchor } : undefined),
      baseline: current?.scope === scope ? current.baseline : baselineQueries(chat),
      expiresAt: Infinity,
    }
  }

  const retire = () => {
    prune()
    if (current) recent = [...recent, { ...current, expiresAt: Date.now() + RETENTION_MS }].slice(-MAX_RECENT_DRAFTS)
    current = null
  }

  const link = (query: Element, scope: string) => {
    prune()
    const raw = readRawQuery(query)
    const parsed = raw === null ? null : parseDisplayMessage(raw)
    const key = parsed?.format === 'multi-selection' ? JSON.stringify(parsed.selections) : null
    const existing = linked.get(query)
    if (existing?.key === key && existing.scope === scope) return
    if (existing) {
      linked.delete(query)
      attachSelectionAnchors(query, [])
    }
    if (!key) return
    const candidates = [...recent, ...(current ? [current] : [])].filter(snapshot =>
      snapshot.scope === scope && snapshot.key === key && !snapshot.baseline.has(query))
    // Identical text can come from different sources. Do not guess between them.
    const sources = new Map(candidates.map(snapshot => [JSON.stringify(snapshot.anchors), snapshot]))
    if (sources.size !== 1) return
    const snapshot = [...sources.values()][0]
    attachSelectionAnchors(query, snapshot.anchors)
    linked.set(query, snapshot)
  }

  const migrate = (from: string, to: string, chat: Element | null) => {
    prune()
    const move = (snapshot: Snapshot) => {
      if (snapshot.scope !== from) return
      snapshot.scope = to
      snapshot.anchors = snapshot.anchors.map(anchor => anchor ? { ...anchor, conversationId: to } : undefined)
    }
    recent.forEach(move)
    if (current) move(current)
    if (chat) for (const query of listUserQueries(chat)) {
      const snapshot = linked.get(query)
      if (!snapshot || snapshot.scope !== from && snapshot.scope !== to) continue
      move(snapshot)
      attachSelectionAnchors(query, snapshot.anchors)
    }
  }

  const clear = () => {
    current = null
    recent = []
    linked = new WeakMap()
  }

  return { update, retire, link, migrate, clear }
}
