export type StreamGenerateControl =
  | { action: 'arm'; token: string; accountPath: string }
  | { action: 'cancel'; token: string }

export interface StreamGenerateObservation {
  token: string
  phase: 'armed' | 'started' | 'metadata' | 'finished'
  requestId?: string
  conversationId?: string
  title?: string
}
