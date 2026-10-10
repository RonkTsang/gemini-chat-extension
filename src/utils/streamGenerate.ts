/** Pure parsers for Gemini's observed StreamGenerate wire format. */
export interface StreamGenerateRequest {
  conversationId: string | null
  isNewConversation: boolean
  prompt?: string
}

export interface StreamGenerateMetadata {
  conversationId: string
  title?: string
}

const CONVERSATION_ID = /^c_[a-f0-9]+$/u
const ENDPOINT = '/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate'
const MAX_FRAME_LENGTH = 2 * 1024 * 1024

export function isStreamGenerateUrl(value: string): boolean {
  try {
    const url = new URL(value, 'https://gemini.google.com')
    return url.origin === 'https://gemini.google.com'
      && url.pathname.replace(/^\/u\/\d+(?=\/)/u, '') === ENDPOINT
  } catch { return false }
}

export function parseStreamGenerateRequest(body: unknown): StreamGenerateRequest | null {
  if (typeof body !== 'string' && !(body instanceof URLSearchParams)) return null
  const encoded = new URLSearchParams(body).get('f.req')
  if (!encoded) return null
  try {
    const envelope: unknown = JSON.parse(encoded)
    if (!Array.isArray(envelope) || typeof envelope[1] !== 'string') return null
    const payload: unknown = JSON.parse(envelope[1])
    if (!Array.isArray(payload) || payload.length < 3 || !Array.isArray(payload[0])) return null
    const promptValue: unknown = payload[0][0]
    // Match Folder title normalization before applying the storage limit.
    const prompt = typeof promptValue === 'string' ? promptValue.normalize('NFKC').trim().slice(0, 500) : ''
    const promptMetadata = prompt ? { prompt } : {}
    const conversation = payload[2]
    if (conversation === null) return { conversationId: null, isNewConversation: true, ...promptMetadata }
    if (Array.isArray(conversation) && typeof conversation[0] === 'string' && CONVERSATION_ID.test(conversation[0])) {
      return { conversationId: conversation[0], isNewConversation: false, ...promptMetadata }
    }
    return null
  } catch { return null }
}

/** Parse only complete wrb.fr frames; unrelated IDs in response content are ignored. */
export function parseStreamGenerateFrame(frame: string): StreamGenerateMetadata[] {
  if (frame.length > MAX_FRAME_LENGTH) return []
  try {
    const rows: unknown = JSON.parse(frame)
    if (!Array.isArray(rows)) return []
    const metadata: StreamGenerateMetadata[] = []
    for (const row of rows) {
      if (!Array.isArray(row) || row[0] !== 'wrb.fr' || row[1] !== null || typeof row[2] !== 'string') continue
      let payload: unknown
      try { payload = JSON.parse(row[2]) } catch { continue }
      if (!Array.isArray(payload) || !Array.isArray(payload[1])) continue
      const conversationId: unknown = payload[1][0]
      if (typeof conversationId !== 'string' || !CONVERSATION_ID.test(conversationId)) continue
      const fields: unknown = payload[2]
      const titleValue = fields && typeof fields === 'object' && !Array.isArray(fields)
        ? (fields as Record<string, unknown>)['11'] : undefined
      const title = Array.isArray(titleValue) && typeof titleValue[0] === 'string'
        ? titleValue[0].trim() : undefined
      metadata.push({ conversationId, ...(title && title.length <= 500 ? { title } : {}) })
    }
    return metadata
  } catch { return [] }
}

/** Incremental, bounded decoder for newline-delimited, length-prefixed frames. */
export class StreamGenerateDecoder {
  private pending = ''
  private discarding = false

  push(chunk: string, final = false): StreamGenerateMetadata[] {
    const metadata: StreamGenerateMetadata[] = []
    const lines = chunk.split('\n')
    for (let index = 0; index < lines.length; index++) {
      const line = lines[index]
      if (!this.discarding) {
        if (this.pending.length + line.length > MAX_FRAME_LENGTH) {
          this.pending = ''
          this.discarding = true
        } else this.pending += line
      }
      if (index < lines.length - 1 || final) {
        if (!this.discarding && this.pending.trimStart().startsWith('[')) {
          metadata.push(...parseStreamGenerateFrame(this.pending))
        }
        this.pending = ''
        this.discarding = false
      }
    }
    return metadata
  }
}
