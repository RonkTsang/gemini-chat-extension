/**
 * @file stuffMediaParser.ts
 * @description Parse Media type requests and responses from Google Gemini's "My Stuff" page
 *
 * Interface Identification:
 * - Endpoint: /_/BardChatUi/data/batchexecute
 * - RPC ID: jGArJ
 * - Request type array: [1,1,1,0,0,0,1] (Media)
 */

// ==================== Type Definitions ====================

/**
 * Stuff request type array
 * Index meanings:
 * [0] Enable basic conversation records
 * [1] Enable image/media queries
 * [2] Enable timestamps
 * [3] Enable document content (0=Media, 1=Docs)
 * [4] Enable text summary (0=Media, 1=Docs)
 * [5] Reserved
 * [6] Enable resource ID
 */
export type StuffRequestTypeArray = [number, number, number, number, number, number, number];

/**
 * Stuff request type constants
 */
export const STUFF_REQUEST_TYPES = {
  MEDIA: [1, 1, 1, 0, 0, 0, 1] as StuffRequestTypeArray,
  DOCS: [1, 1, 1, 1, 1, 0, 1] as StuffRequestTypeArray,
} as const;

/**
 * Stuff request parameters structure
 */
export interface StuffRequestParams {
  typeArray: StuffRequestTypeArray;
  pageSize: number;
  pageToken?: string;
}

/**
 * f.req structure for batchexecute requests
 */
export interface BatchExecuteRequest {
  rpcId: string;
  params: string; // JSON string, needs further parsing
  placeholder: null;
  type: 'generic';
}

/**
 * Media item status codes
 */
export enum MediaItemStatus {
  /** Normal conversation (with image) */
  Normal = 1,
  /** Video */
  Video = 2,
  /** Audio */
  Audio = 3,
  /** Analysis Report */
  Report = 4,
  /** Document */
  Document = 5,
  /** Code */
  Code = 6,
}

/**
 * Media item data structure
 */
export interface MediaItem {
  /** Conversation ID */
  conversationId: string;
  /** Response ID */
  responseId: string;
  /** Primary timestamp (Unix seconds) */
  timestamp: number;
  /** Nanosecond timestamp */
  timestampNano: number;
  /** Status code */
  status: MediaItemStatus;
  /** Conversation title (optional) */
  title?: string;
  /** Thumbnail URL (optional) */
  thumbnailUrl?: string;
  /** Resource ID */
  resourceId: string;
  /** Whether it contains an image */
  hasImage: boolean;
  /** Complete Date object */
  date: Date;
}

/**
 * Parsed Media response
 */
export interface ParsedMediaResponse {
  /** List of media items */
  items: MediaItem[];
  /** Next page token */
  nextPageToken?: string;
  /** Total items in current response */
  totalCount: number;
  /** Request metadata */
  metadata?: {
    /** Response size in bytes */
    responseSize?: number;
    /** Processing time (ms) */
    processingTime?: number;
  };
}

// ==================== Request Parsing ====================

/**
 * Identify Stuff request type
 *
 * @param typeArray Request type array
 * @returns 'media' | 'docs' | null
 */
export function identifyStuffRequestType(typeArray: number[]): 'media' | 'docs' | null {
  if (typeArray.length !== 7) return null;

  if (arraysEqual(typeArray, STUFF_REQUEST_TYPES.MEDIA)) {
    return 'media';
  }

  if (arraysEqual(typeArray, STUFF_REQUEST_TYPES.DOCS)) {
    return 'docs';
  }

  return null;
}

/**
 * Determine if it is a Stuff Media request
 *
 * @param url Request URL
 * @param formData Form data
 * @returns boolean
 */
export function isStuffMediaRequest(url: string, formData: Record<string, string>): boolean {
  try {
    // 1. Check URL
    if (!url.includes('/_/BardChatUi/data/batchexecute')) {
      return false;
    }

    const urlObj = new URL(url);

    // 2. Check rpcids
    if (urlObj.searchParams.get('rpcids') !== 'jGArJ') {
      return false;
    }

    // 3. Check source-path
    if (urlObj.searchParams.get('source-path') !== '/mystuff') {
      return false;
    }

    // 4. Parse f.req and check type array
    const params = parseRequestParams(formData['f.req']);
    if (!params) return false;

    return identifyStuffRequestType(params.typeArray) === 'media';
  } catch (error) {
    console.error('[StuffMediaParser] Error checking request:', error);
    return false;
  }
}

/**
 * Parse f.req form parameters
 *
 * @param fReqEncoded URL-encoded f.req string
 * @returns Parsed request parameters
 *
 * @example
 * const params = parseRequestParams(formData['f.req']);
 * // => { typeArray: [1,1,1,0,0,0,1], pageSize: 30, pageToken: undefined }
 */
export function parseRequestParams(fReqEncoded: string): StuffRequestParams | null {
  try {
    // 1. URL Decode
    const fReqDecoded = decodeURIComponent(fReqEncoded);

    // 2. Parse outer JSON: [[["jGArJ", "...", null, "generic"]]]
    const fReq = JSON.parse(fReqDecoded) as [[[string, string, null, string]]];

    // 3. Extract parameter string: "[[1,1,1,0,0,0,1],30]" or "[[1,1,1,0,0,0,1],30,"token"]"
    const paramsStr = fReq[0][0][1];

    // 4. Parse parameters JSON
    const params = JSON.parse(paramsStr) as [StuffRequestTypeArray, number, string?];

    return {
      typeArray: params[0],
      pageSize: params[1],
      pageToken: params[2],
    };
  } catch (error) {
    console.error('[StuffMediaParser] Error parsing request params:', error);
    return null;
  }
}

/**
 * Build parameters for the next page request
 *
 * @param currentParams Current request parameters
 * @param nextPageToken Next page token
 * @returns Encoded f.req string
 */
export function buildNextPageRequest(
  currentParams: StuffRequestParams,
  nextPageToken: string,
): string {
  const newParams: StuffRequestParams = {
    ...currentParams,
    pageToken: nextPageToken,
  };

  const paramsArray: [StuffRequestTypeArray, number, string] = [
    newParams.typeArray,
    newParams.pageSize,
    nextPageToken,
  ];

  const batchRequest: [[[string, string, null, string]]] = [
    [['jGArJ', JSON.stringify(paramsArray), null, 'generic']],
  ];

  return encodeURIComponent(JSON.stringify(batchRequest));
}

// ==================== Response Parsing ====================

/**
 * Parse Stuff Media response
 *
 * @param responseText Raw response text
 * @returns Parsed media data
 *
 * @example
 * const response = await fetch(url);
 * const text = await response.text();
 * const data = parseMediaResponse(text);
 */
export function parseMediaResponse(responseText: string): ParsedMediaResponse | null {
  try {
    // 1. Remove XSSI protection prefix ")]}'\n\n"
    const cleanText = responseText.replace(/^\)\]\}'\s*\n\s*\n/, '');

    // 2. Split by lines
    const lines = cleanText.split('\n').filter((line) => line.trim());

    if (lines.length < 2) {
      console.error('[StuffMediaParser] No valid lines in response');
      return null;
    }

    // 3. First line is response size in bytes
    const responseSize = parseInt(lines[0], 10);

    // 4. Second line is the main data
    const dataLine = lines[1];
    if (!dataLine) {
      console.error('[StuffMediaParser] No data line found');
      return null;
    }

    const data = JSON.parse(dataLine) as [[string, string, string, null, null, null, string]];

    // 5. Parse payload (data[0][2] is a JSON string)
    const innerData = data[0];
    const payload = JSON.parse(innerData[2]) as [unknown[], string?];
    const rawItems = payload[0] ?? [];
    const nextPageToken = payload[1] ?? '';

    // 6. Parse each media item
    const items: MediaItem[] = rawItems
      .map((rawItem) => parseMediaItem(rawItem))
      .filter(Boolean) as MediaItem[];

    // 9. Extract metadata if available (3rd or 4th line)
    let processingTime: number | undefined;
    if (lines.length >= 4) {
      try {
        const metadataLine = lines[3];
        const metadata = JSON.parse(metadataLine);
        processingTime = metadata[0]?.[3];
      } catch {
        // Ignore metadata parsing errors
      }
    }

    return {
      items,
      nextPageToken,
      totalCount: items.length,
      metadata: {
        responseSize,
        processingTime,
      },
    };
  } catch (error) {
    console.error('[StuffMediaParser] Error parsing response:', error);
    return null;
  }
}

/**
 * Parse a single media item
 *
 * @param rawItem Raw item data
 * @returns Parsed media item
 */
export function parseMediaItem(rawItem: unknown): MediaItem | null {
  try {
    if (!Array.isArray(rawItem) || rawItem.length < 5) {
      return null;
    }

    // Structure: [[conversationId, responseId], [timestamp, nano], status, title?, thumbnail?, resourceId]
    const [ids, timestamps, status, title, thumbnail, resourceId] = rawItem;

    if (!Array.isArray(ids) || ids.length !== 2) return null;
    if (!Array.isArray(timestamps)) return null; // Allow empty array

    const [conversationId, responseId] = ids as [string, string];
    const [timestamp, timestampNano] = timestamps as [number?, number?];
    const statusCode = status as number;
    const titleValue = title as string | undefined;
    const thumbnailArray = thumbnail as [null, string] | null;
    const resourceIdValue = resourceId as string;

    // Extract thumbnail URL
    const thumbnailUrl = thumbnailArray?.[1];
    const hasImage = !!thumbnailUrl;

    // Create complete Date object (if timestamp exists)
    const date = timestamp
      ? new Date(timestamp * 1000 + (timestampNano || 0) / 1000000)
      : new Date();

    return {
      conversationId,
      responseId,
      timestamp: timestamp || 0,
      timestampNano: timestampNano || 0,
      status: statusCode as MediaItemStatus,
      title: titleValue || undefined,
      thumbnailUrl,
      resourceId: resourceIdValue,
      hasImage,
      date,
    };
  } catch (error) {
    console.error('[StuffMediaParser] Error parsing media item:', error);
    return null;
  }
}

/**
 * Extract page token
 *
 * @param responseText Response text
 * @returns Next page token or null
 */
export function extractPageToken(responseText: string): string | null {
  const parsed = parseMediaResponse(responseText);
  return parsed?.nextPageToken || null;
}

// ==================== Utility Functions ====================

/**
 * Array equality comparison
 */
export function arraysEqual(a: unknown[], b: unknown[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((val, idx) => val === b[idx]);
}

/**
 * Format media item as a readable string
 *
 * @param item Media item
 * @returns Formatted string
 */
export function formatMediaItem(item: MediaItem): string {
  const parts = [
    `ID: ${item.conversationId}`,
    `Date: ${item.date.toLocaleString()}`,
    item.title ? `Title: ${item.title}` : null,
    item.hasImage ? 'Has Image' : 'No Image',
    `Resource: ${item.resourceId}`,
  ].filter(Boolean);

  return parts.join(' | ');
}

/**
 * Group media items by date
 *
 * @param items List of media items
 * @returns Object grouped by date (YYYY-MM-DD)
 */
export function groupMediaItemsByDate(items: MediaItem[]): Record<string, MediaItem[]> {
  return items.reduce((acc, item) => {
    const dateKey = item.date.toISOString().split('T')[0];
    if (!acc[dateKey]) {
      acc[dateKey] = [];
    }
    acc[dateKey].push(item);
    return acc;
  }, {} as Record<string, MediaItem[]>);
}

/**
 * Filter media items with images
 *
 * @param items List of media items
 * @returns Only items with images
 */
export function filterMediaItemsWithImages(items: MediaItem[]): MediaItem[] {
  return items.filter((item) => item.hasImage);
}

/**
 * Filter media items with titles
 *
 * @param items List of media items
 * @returns Only items with titles
 */
export function filterMediaItemsAudio(items: MediaItem[]): MediaItem[] {
  return items.filter((item) => item.title);
}
