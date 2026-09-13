/**
 * Deliberately inert compatibility shell. P0 only records a Gemini title when
 * the user explicitly adds that chat to a Folder; it must not observe DOM
 * title mutations and create background writes during page rendering.
 */
export class FolderChatTitleCacheController {
  start(): void {}
  stop(): void {}
}
