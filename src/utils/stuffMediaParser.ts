/**
 * Stuff Media API Parser
 * 
 * 解析 Google Gemini "My Stuff" 页面的 Media 类型请求和响应
 * 
 * 接口标识:
 * - 端点: /_/BardChatUi/data/batchexecute
 * - rpcids: jGArJ
 * - 请求类型数组: [1,1,1,0,0,0,1] (Media)
 * 
 * @see .original/api_response/stuff-media.txt
 * @see .original/api_response/stuff-media-page-2.txt
 */

// ==================== 类型定义 ====================

/**
 * Stuff 请求类型数组
 * 位置含义:
 * [0] 启用基础对话记录
 * [1] 启用图片/媒体查询
 * [2] 启用时间戳
 * [3] 启用文档内容 (0=Media, 1=Docs)
 * [4] 启用文本摘要 (0=Media, 1=Docs)
 * [5] 保留位
 * [6] 启用资源ID
 */
export type StuffRequestTypeArray = [number, number, number, number, number, number, number];

/**
 * Stuff 请求类型常量
 */
export const STUFF_REQUEST_TYPES = {
  MEDIA: [1, 1, 1, 0, 0, 0, 1] as StuffRequestTypeArray,
  DOCS: [1, 1, 1, 1, 1, 0, 1] as StuffRequestTypeArray,
} as const;

/**
 * Stuff 请求参数结构
 */
export interface StuffRequestParams {
  typeArray: StuffRequestTypeArray;
  pageSize: number;
  pageToken?: string;
}

/**
 * batchexecute 请求的 f.req 结构
 */
export interface BatchExecuteRequest {
  rpcId: string;
  params: string;  // JSON 字符串,需要再次解析
  placeholder: null;
  type: 'generic';
}

/**
 * Media 项目状态码
 */
export enum MediaItemStatus {
  /** 普通对话(带图片) */
  Normal = 1,
  /** 带标题的对话 */
  WithTitle = 3,
  /** 分析报告 */
  Report = 4,
  /** 文档 */
  Document = 5,
  /** 代码 */
  Code = 6,
}

/**
 * Media 项目数据结构
 */
export interface MediaItem {
  /** 对话ID */
  conversationId: string;
  /** 响应ID */
  responseId: string;
  /** 主时间戳(Unix秒) */
  timestamp: number;
  /** 纳秒时间戳 */
  timestampNano: number;
  /** 状态码 */
  status: MediaItemStatus;
  /** 对话标题(可选) */
  title?: string;
  /** 缩略图URL(可选) */
  thumbnailUrl?: string;
  /** 资源ID */
  resourceId: string;
  /** 是否包含图片 */
  hasImage: boolean;
  /** 完整的 Date 对象 */
  date: Date;
}

/**
 * 解析后的 Media 响应
 */
export interface ParsedMediaResponse {
  /** 媒体项目列表 */
  items: MediaItem[];
  /** 下一页 token */
  nextPageToken?: string;
  /** 总项目数 */
  totalCount: number;
  /** 请求元数据 */
  metadata?: {
    /** 响应字节大小 */
    responseSize?: number;
    /** 处理时间(ms) */
    processingTime?: number;
  };
}

// ==================== 请求解析 ====================

/**
 * 识别 Stuff 请求类型
 * 
 * @param typeArray 类型数组
 * @returns 'media' | 'docs' | null
 */
export function identifyStuffRequestType(
  typeArray: number[]
): 'media' | 'docs' | null {
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
 * 判断是否为 Stuff Media 请求
 * 
 * @param url 请求 URL
 * @param formData 表单数据
 * @returns boolean
 */
export function isStuffMediaRequest(
  url: string,
  formData: Record<string, string>
): boolean {
  try {
    // 1. 检查 URL
    if (!url.includes('/_/BardChatUi/data/batchexecute')) {
      return false;
    }

    const urlObj = new URL(url);
    
    // 2. 检查 rpcids
    if (urlObj.searchParams.get('rpcids') !== 'jGArJ') {
      return false;
    }

    // 3. 检查 source-path
    if (urlObj.searchParams.get('source-path') !== '/mystuff') {
      return false;
    }

    // 4. 解析 f.req 并检查类型数组
    const params = parseRequestParams(formData['f.req']);
    if (!params) return false;

    return identifyStuffRequestType(params.typeArray) === 'media';
  } catch (error) {
    console.error('[StuffMediaParser] Error checking request:', error);
    return false;
  }
}

/**
 * 解析 f.req 表单参数
 * 
 * @param fReqEncoded URL 编码的 f.req 字符串
 * @returns 解析后的请求参数
 * 
 * @example
 * const params = parseRequestParams(formData['f.req']);
 * // => { typeArray: [1,1,1,0,0,0,1], pageSize: 30, pageToken: undefined }
 */
export function parseRequestParams(fReqEncoded: string): StuffRequestParams | null {
  try {
    // 1. URL 解码
    const fReqDecoded = decodeURIComponent(fReqEncoded);
    
    // 2. 解析外层 JSON: [[["jGArJ", "...", null, "generic"]]]
    const fReq = JSON.parse(fReqDecoded) as [[[string, string, null, string]]];
    
    // 3. 提取参数字符串: "[[1,1,1,0,0,0,1],30]" 或 "[[1,1,1,0,0,0,1],30,"token"]"
    const paramsStr = fReq[0][0][1];
    
    // 4. 解析参数 JSON
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
 * 构建下一页请求参数
 * 
 * @param currentParams 当前请求参数
 * @param nextPageToken 下一页 token
 * @returns 编码后的 f.req 字符串
 */
export function buildNextPageRequest(
  currentParams: StuffRequestParams,
  nextPageToken: string
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
    [['jGArJ', JSON.stringify(paramsArray), null, 'generic']]
  ];

  return encodeURIComponent(JSON.stringify(batchRequest));
}

// ==================== 响应解析 ====================

/**
 * 解析 Stuff Media 响应
 * 
 * @param responseText 原始响应文本
 * @returns 解析后的媒体数据
 * 
 * @example
 * const response = await fetch(url);
 * const text = await response.text();
 * const data = parseMediaResponse(text);
 */
export function parseMediaResponse(responseText: string): ParsedMediaResponse | null {
  try {
    // 1. 移除 XSSI 保护前缀 ")]}'\n\n"
    const cleanText = responseText.replace(/^\)\]\}'\s*\n\s*\n/, '');
    
    // 2. 按行分割
    const lines = cleanText.split('\n').filter(line => line.trim());
    
    if (lines.length < 2) {
      console.error('[StuffMediaParser] No valid lines in response');
      return null;
    }

    // 3. 第一行是响应字节大小
    const responseSize = parseInt(lines[0], 10);
    
    // 4. 第二行是主要数据
    const dataLine = lines[1];
    if (!dataLine) {
      console.error('[StuffMediaParser] No data line found');
      return null;
    }
    
    const data = JSON.parse(dataLine) as [[string, string, string, null, null, null, string]];
    
    // 5. 解析 payload (data[0][2] 是 JSON 字符串)
    const innerData = data[0];
    const payload = JSON.parse(innerData[2]) as [unknown[], string?];
    const rawItems = payload[0];
    const nextPageToken = payload[1];
    
    // 6. 解析每个媒体项目
    const items: MediaItem[] = rawItems.map((rawItem) => parseMediaItem(rawItem)).filter(Boolean) as MediaItem[];
    
    // 9. 提取元数据(如果有第三、四行)
    let processingTime: number | undefined;
    if (lines.length >= 4) {
      try {
        const metadataLine = lines[3];
        const metadata = JSON.parse(metadataLine);
        processingTime = metadata[0]?.[3];
      } catch {
        // 忽略元数据解析错误
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
 * 解析单个媒体项目
 * 
 * @param rawItem 原始项目数据
 * @returns 解析后的媒体项目
 */
function parseMediaItem(rawItem: unknown): MediaItem | null {
  try {
    if (!Array.isArray(rawItem) || rawItem.length < 5) {
      return null;
    }

    // 结构: [[conversationId, responseId], [timestamp, nano], status, title?, thumbnail?, resourceId]
    const [ids, timestamps, status, title, thumbnail, resourceId] = rawItem;

    if (!Array.isArray(ids) || ids.length !== 2) return null;
    if (!Array.isArray(timestamps)) return null; // 允许空数组

    const [conversationId, responseId] = ids as [string, string];
    const [timestamp, timestampNano] = timestamps as [number?, number?];
    const statusCode = status as number;
    const titleValue = title as string | undefined;
    const thumbnailArray = thumbnail as [null, string] | null;
    const resourceIdValue = resourceId as string;

    // 提取缩略图 URL
    const thumbnailUrl = thumbnailArray?.[1];
    const hasImage = !!thumbnailUrl;

    // 创建完整的 Date 对象 (如果有时间戳)
    const date = timestamp ? new Date(timestamp * 1000 + (timestampNano || 0) / 1000000) : new Date();

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
 * 提取分页 token
 * 
 * @param responseText 响应文本
 * @returns 下一页 token 或 null
 */
export function extractPageToken(responseText: string): string | null {
  const parsed = parseMediaResponse(responseText);
  return parsed?.nextPageToken || null;
}

// ==================== 工具函数 ====================

/**
 * 数组相等比较
 */
function arraysEqual(a: unknown[], b: unknown[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((val, idx) => val === b[idx]);
}

/**
 * 格式化媒体项目为可读字符串
 * 
 * @param item 媒体项目
 * @returns 格式化字符串
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
 * 按日期分组媒体项目
 * 
 * @param items 媒体项目列表
 * @returns 按日期(YYYY-MM-DD)分组的对象
 */
export function groupMediaItemsByDate(
  items: MediaItem[]
): Record<string, MediaItem[]> {
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
 * 过滤带图片的媒体项目
 * 
 * @param items 媒体项目列表
 * @returns 只包含图片的项目
 */
export function filterMediaItemsWithImages(items: MediaItem[]): MediaItem[] {
  return items.filter(item => item.hasImage);
}

/**
 * 过滤带标题的媒体项目
 * 
 * @param items 媒体项目列表
 * @returns 只包含标题的项目
 */
export function filterMediaItemsWithTitle(items: MediaItem[]): MediaItem[] {
  return items.filter(item => item.title);
}
