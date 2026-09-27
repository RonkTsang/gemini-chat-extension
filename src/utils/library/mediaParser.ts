import { z } from 'zod'
import { extractGeminiAccountRoutePrefix } from '../geminiAccountRoute'

// MAIN-world Trusted Types blocks Zod's JIT probe; use its normal parser directly.
z.config({ jitless: true })

export const LIBRARY_QUERY_PATH = '/_/BardChatUi/graphql/schemas/GEMINI_WEB_GRAPHQL/executeQuery'
export const MAX_LIBRARY_RESPONSE_BYTES = 2 * 1024 * 1024

export const libraryMediaItemSchema = z.object({
  conversationId: z.string().regex(/^c_[A-Za-z0-9_-]+$/),
  requestId: z.string().regex(/^r_[A-Za-z0-9_-]+$/),
  responseId: z.string().min(1),
  artifactType: z.string().min(1),
  thumbnailUrl: z.url().optional(),
})

export type LibraryMediaItem = z.infer<typeof libraryMediaItemSchema>

export const libraryMediaDataSchema = z.object({
  items: z.array(libraryMediaItemSchema),
  timestamp: z.number().finite(),
})

export type LibraryMediaData = z.infer<typeof libraryMediaDataSchema>

const mediaNodeSchema = z.object({
  responseIdentifier: z.object({
    conversationId: libraryMediaItemSchema.shape.conversationId,
    requestId: libraryMediaItemSchema.shape.requestId,
  }),
  responseId: libraryMediaItemSchema.shape.responseId,
  artifactType: libraryMediaItemSchema.shape.artifactType,
  metadata: z.object({ thumbnailUrl: z.url().nullish() }).nullish(),
})

const mediaPacketSchema = z.object({
  data: z.object({
    viewer: z.object({
      media: z.object({ edges: z.array(z.object({ node: z.unknown() })) }),
    }),
  }),
})

export function isLibraryMediaRequest(url: string, baseUrl = 'https://gemini.google.com'): boolean {
  try {
    const parsed = new URL(url, baseUrl)
    const accountRoutePrefix = extractGeminiAccountRoutePrefix(parsed.pathname)
    const pathname = parsed.pathname.slice(accountRoutePrefix.length)
    return parsed.origin === 'https://gemini.google.com' && pathname === LIBRARY_QUERY_PATH
  } catch {
    return false
  }
}

export interface LibraryMediaParseResult {
  items: LibraryMediaItem[] | null
  reason: 'parsed' | 'response-too-large' | 'invalid-json' | 'unexpected-envelope' | 'no-media-connection'
  packetCount: number
  edgeCount: number
  rejectedNodes: number
  issues: Array<{ path: string; code: string }>
}

/** Return structural diagnostics without retaining response contents or rejected field values. */
export function inspectLibraryMediaResponse(responseText: string): LibraryMediaParseResult {
  const result: LibraryMediaParseResult = {
    items: null, reason: 'response-too-large', packetCount: 0,
    edgeCount: 0, rejectedNodes: 0, issues: [],
  }
  if (responseText.length > MAX_LIBRARY_RESPONSE_BYTES) return result

  let response: unknown
  try {
    response = JSON.parse(responseText)
  } catch {
    return { ...result, reason: 'invalid-json' }
  }
  if (!Array.isArray(response)) return { ...result, reason: 'unexpected-envelope' }
  result.packetCount = response.length

  const items: LibraryMediaItem[] = []
  let hasMediaConnection = false
  for (const packet of response) {
    const parsedPacket = mediaPacketSchema.safeParse(packet)
    if (!parsedPacket.success) {
      if (result.issues.length < 3) {
        const issue = parsedPacket.error.issues[0]
        if (issue) result.issues.push({ path: issue.path.map(String).join('.'), code: issue.code })
      }
      continue
    }
    hasMediaConnection = true

    for (const edge of parsedPacket.data.data.viewer.media.edges) {
      result.edgeCount++
      const node = mediaNodeSchema.safeParse(edge.node)
      if (!node.success) {
        result.rejectedNodes++
        if (result.issues.length < 3) {
          const issue = node.error.issues[0]
          if (issue) result.issues.push({ path: issue.path.map(String).join('.'), code: issue.code })
        }
        continue
      }
      items.push({
        ...node.data.responseIdentifier,
        responseId: node.data.responseId,
        artifactType: node.data.artifactType,
        thumbnailUrl: node.data.metadata?.thumbnailUrl ?? undefined,
      })
    }
  }
  return { ...result, items: hasMediaConnection ? items : null,
    reason: hasMediaConnection ? 'parsed' : 'no-media-connection' }
}

/** Only read the observed media connection; unrelated GraphQL queries are ignored. */
export function parseLibraryMediaResponse(responseText: string): LibraryMediaItem[] | null {
  return inspectLibraryMediaResponse(responseText).items
}
