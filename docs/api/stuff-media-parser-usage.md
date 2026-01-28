# Stuff Media Parser 使用指南

## 概述

`stuffMediaParser` 工具提供了完整的 Google Gemini "My Stuff" Media 接口解析功能,包括:

- ✅ 请求参数解析和构建
- ✅ 响应数据解析
- ✅ 分页处理
- ✅ 数据过滤和格式化工具

## 快速开始

### 1. 识别 Stuff Media 请求

```typescript
import { isStuffMediaRequest } from '@/utils/stuffMediaParser';

// 在 webRequest 拦截器中
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (details.method === 'POST' && details.requestBody) {
      const formData = parseFormDataFromRequest(details.requestBody);
      
      if (isStuffMediaRequest(details.url, formData)) {
        console.log('[Stuff Media] 检测到 Media 请求');
        // 存储请求信息用于后续处理响应
        storeRequestMetadata(details.requestId, {
          type: 'stuff-media',
          timestamp: Date.now()
        });
      }
    }
  },
  { urls: ["https://gemini.google.com/_/BardChatUi/data/batchexecute*"] },
  ["requestBody"]
);
```

### 2. 解析请求参数

```typescript
import { parseRequestParams, identifyStuffRequestType } from '@/utils/stuffMediaParser';

// 解析 f.req 表单参数
const params = parseRequestParams(formData['f.req']);

if (params) {
  console.log('请求类型:', identifyStuffRequestType(params.typeArray));
  console.log('每页数量:', params.pageSize);
  console.log('分页 Token:', params.pageToken || '首页');
}

// 输出:
// 请求类型: media
// 每页数量: 30
// 分页 Token: 首页
```

### 3. 解析响应数据

```typescript
import { parseMediaResponse } from '@/utils/stuffMediaParser';

// 获取响应文本
const response = await fetch(url);
const responseText = await response.text();

// 解析媒体数据
const mediaData = parseMediaResponse(responseText);

if (mediaData) {
  console.log(`获取到 ${mediaData.totalCount} 条媒体记录`);
  
  mediaData.items.forEach(item => {
    console.log(`对话ID: ${item.conversationId}`);
    console.log(`时间: ${item.date.toLocaleString()}`);
    console.log(`标题: ${item.title || '无'}`);
    console.log(`图片: ${item.hasImage ? item.thumbnailUrl : '无'}`);
    console.log('---');
  });
  
  if (mediaData.nextPageToken) {
    console.log('存在下一页,Token:', mediaData.nextPageToken);
  }
}
```

### 4. 处理分页

```typescript
import { 
  parseRequestParams, 
  buildNextPageRequest, 
  extractPageToken 
} from '@/utils/stuffMediaParser';

async function fetchAllMediaPages(initialUrl: string, initialFormData: Record<string, string>) {
  const allItems = [];
  let currentFormData = initialFormData;
  
  while (true) {
    // 发起请求
    const response = await fetch(initialUrl, {
      method: 'POST',
      body: new URLSearchParams(currentFormData)
    });
    
    const responseText = await response.text();
    const pageToken = extractPageToken(responseText);
    
    // 解析当前页数据
    const mediaData = parseMediaResponse(responseText);
    if (mediaData) {
      allItems.push(...mediaData.items);
      console.log(`已获取 ${allItems.length} 条记录`);
    }
    
    // 检查是否有下一页
    if (!pageToken) {
      break;
    }
    
    // 构建下一页请求
    const currentParams = parseRequestParams(currentFormData['f.req']);
    if (!currentParams) break;
    
    const nextFReq = buildNextPageRequest(currentParams, pageToken);
    currentFormData = {
      ...currentFormData,
      'f.req': nextFReq
    };
  }
  
  return allItems;
}
```

## 数据结构

### MediaItem

```typescript
interface MediaItem {
  conversationId: string;    // 对话ID (如 "c_96480b882e7bb164")
  responseId: string;        // 响应ID (如 "r_54bdc43ff50972bf")
  timestamp: number;         // Unix 时间戳(秒)
  timestampNano: number;     // 纳秒时间戳
  status: MediaItemStatus;   // 状态码 (1=普通, 3=带标题)
  title?: string;            // 对话标题(可选)
  thumbnailUrl?: string;     // 缩略图URL(可选)
  resourceId: string;        // 资源ID (如 "rc_be3433e9856e2387")
  hasImage: boolean;         // 是否包含图片
  date: Date;                // 完整的 Date 对象
}
```

### MediaItemStatus

```typescript
enum MediaItemStatus {
  Normal = 1,      // 普通对话(带图片)
  Audio = 3,   // 带标题的对话
  Report = 4,      // 分析报告
  Document = 5,    // 文档
  Code = 6,        // 代码
}
```

## 工具函数

### 格式化输出

```typescript
import { formatMediaItem } from '@/utils/stuffMediaParser';

const item = mediaData.items[0];
console.log(formatMediaItem(item));
// 输出: ID: c_96480b882e7bb164 | Date: 2026/1/24 10:05:06 | Has Image | Resource: rc_be3433e9856e2387
```

### 按日期分组

```typescript
import { groupMediaItemsByDate } from '@/utils/stuffMediaParser';

const grouped = groupMediaItemsByDate(mediaData.items);

Object.entries(grouped).forEach(([date, items]) => {
  console.log(`${date}: ${items.length} 条记录`);
});

// 输出:
// 2026-01-24: 5 条记录
// 2026-01-23: 8 条记录
// 2026-01-22: 3 条记录
```

### 过滤数据

```typescript
import { 
  filterMediaItemsWithImages, 
  filterMediaItemsAudio 
} from '@/utils/stuffMediaParser';

// 只获取带图片的记录
const withImages = filterMediaItemsWithImages(mediaData.items);
console.log(`${withImages.length} 条记录包含图片`);

// 只获取带标题的记录
const Audios = filterMediaItemsAudio(mediaData.items);
console.log(`${Audios.length} 条记录有标题`);
Audios.forEach(item => {
  console.log(`- ${item.title}`);
});
```

## 完整示例:保存到 IndexedDB

```typescript
import { parseMediaResponse, type MediaItem } from '@/utils/stuffMediaParser';
import { db } from '@/data/db';

async function saveMediaItemsToDB(responseText: string) {
  const mediaData = parseMediaResponse(responseText);
  
  if (!mediaData) {
    console.error('解析响应失败');
    return;
  }
  
  try {
    // 转换为数据库格式
    const dbRecords = mediaData.items.map(item => ({
      conversationId: item.conversationId,
      responseId: item.responseId,
      title: item.title || null,
      thumbnailUrl: item.thumbnailUrl || null,
      resourceId: item.resourceId,
      status: item.status,
      timestamp: item.timestamp,
      createdAt: item.date,
      syncedAt: new Date(),
    }));
    
    // 批量保存
    await db.stuffMedia.bulkPut(dbRecords);
    
    console.log(`成功保存 ${dbRecords.length} 条媒体记录`);
    
    // 返回下一页 token
    return mediaData.nextPageToken;
  } catch (error) {
    console.error('保存到数据库失败:', error);
    throw error;
  }
}
```

## 在 Background Script 中使用

```typescript
// background.ts
import { 
  isStuffMediaRequest, 
  parseMediaResponse,
  extractPageToken 
} from '@/utils/stuffMediaParser';

// 存储请求ID和元数据的映射
const pendingRequests = new Map<string, { type: string; timestamp: number }>();

// 拦截请求
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (details.method === 'POST' && details.requestBody) {
      const formData = extractFormData(details.requestBody);
      
      if (isStuffMediaRequest(details.url, formData)) {
        pendingRequests.set(details.requestId, {
          type: 'stuff-media',
          timestamp: Date.now()
        });
      }
    }
  },
  { urls: ["https://gemini.google.com/_/BardChatUi/data/batchexecute*"] },
  ["requestBody"]
);

// 处理响应(需要通过 content script 或其他方式获取响应体)
async function handleMediaResponse(requestId: string, responseText: string) {
  const metadata = pendingRequests.get(requestId);
  
  if (!metadata || metadata.type !== 'stuff-media') {
    return;
  }
  
  // 解析响应
  const mediaData = parseMediaResponse(responseText);
  
  if (mediaData) {
    // 保存到数据库
    await saveMediaItemsToDB(responseText);
    
    // 通知 UI 更新
    chrome.runtime.sendMessage({
      type: 'stuff-media-updated',
      count: mediaData.totalCount,
      hasMore: !!mediaData.nextPageToken
    });
  }
  
  // 清理
  pendingRequests.delete(requestId);
}

function extractFormData(requestBody: chrome.webRequest.WebRequestBody): Record<string, string> {
  // 实现表单数据提取逻辑
  // ...
}
```

## 类型安全

所有函数都提供完整的 TypeScript 类型定义:

```typescript
import type { 
  MediaItem,
  MediaItemStatus,
  ParsedMediaResponse,
  StuffRequestParams,
  StuffRequestTypeArray 
} from '@/utils/stuffMediaParser';

// 使用类型守卫
function isMediaItemWithImage(item: MediaItem): item is MediaItem & { thumbnailUrl: string } {
  return item.hasImage && !!item.thumbnailUrl;
}

// 类型安全的处理
mediaData.items
  .filter(isMediaItemWithImage)
  .forEach(item => {
    // TypeScript 知道 item.thumbnailUrl 一定存在
    console.log(item.thumbnailUrl);
  });
```

## 错误处理

所有解析函数都会优雅地处理错误:

```typescript
import { parseMediaResponse } from '@/utils/stuffMediaParser';

const result = parseMediaResponse(responseText);

if (!result) {
  // 解析失败,可能原因:
  // - 响应格式错误
  // - 不是有效的 Stuff Media 响应
  // - 数据损坏
  console.error('无法解析 Media 响应');
  return;
}

// 安全使用数据
console.log(`获取到 ${result.items.length} 条记录`);
```

## 性能考虑

- ✅ 所有解析函数都是同步的,不会阻塞 I/O
- ✅ 使用 `filter` 和 `map` 等函数式方法,性能高效
- ✅ 分页处理避免一次性加载大量数据
- ✅ 可选的元数据提取(如响应大小、处理时间)

## 调试技巧

```typescript
import { 
  parseRequestParams, 
  parseMediaResponse,
  formatMediaItem 
} from '@/utils/stuffMediaParser';

// 开启详细日志
const DEBUG = true;

function debugParse(responseText: string) {
  if (DEBUG) {
    console.group('[Stuff Media Debug]');
    
    // 检查响应格式
    console.log('响应长度:', responseText.length);
    console.log('XSSI 前缀:', responseText.substring(0, 10));
    
    // 尝试解析
    const result = parseMediaResponse(responseText);
    
    if (result) {
      console.log('✅ 解析成功');
      console.log('项目数:', result.totalCount);
      console.log('下一页 Token:', result.nextPageToken || '无');
      console.log('响应大小:', result.metadata?.responseSize);
      console.log('处理时间:', result.metadata?.processingTime, 'ms');
      
      // 显示前 3 条
      console.log('\n前 3 条记录:');
      result.items.slice(0, 3).forEach((item, idx) => {
        console.log(`${idx + 1}. ${formatMediaItem(item)}`);
      });
    } else {
      console.error('❌ 解析失败');
    }
    
    console.groupEnd();
  }
}
```

## 相关文件

- 实现: `src/utils/stuffMediaParser.ts`
- 测试: `src/utils/stuffMediaParser.test.ts`
- 示例数据:
  - `.original/api_response/stuff-media.txt` (第一页)
  - `.original/api_response/stuff-media-page-2.txt` (第二页)
