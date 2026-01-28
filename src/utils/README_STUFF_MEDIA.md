# Stuff Media Parser

Google Gemini "My Stuff" Media 接口的完整解析工具。

## 功能特性

- ✅ **请求识别**: 自动识别 Stuff Media 类型的 batchexecute 请求
- ✅ **参数解析**: 解析和构建请求参数,支持分页
- ✅ **响应解析**: 完整解析媒体数据,包括图片、标题、时间戳等
- ✅ **分页处理**: 自动提取和构建下一页请求
- ✅ **工具函数**: 提供过滤、分组、格式化等实用工具
- ✅ **类型安全**: 完整的 TypeScript 类型定义
- ✅ **单元测试**: 覆盖所有核心功能

## 文件结构

```
src/utils/
├── stuffMediaParser.ts       # 核心解析逻辑
└── stuffMediaParser.test.ts  # 单元测试

docs/api/
└── stuff-media-parser-usage.md  # 使用指南

.original/api_response/
├── stuff-media.txt           # 第一页示例数据
└── stuff-media-page-2.txt    # 第二页示例数据
```

## 快速开始

### 1. 识别请求

```typescript
import { isStuffMediaRequest } from '@/utils/stuffMediaParser';

if (isStuffMediaRequest(url, formData)) {
  console.log('检测到 Stuff Media 请求');
}
```

### 2. 解析响应

```typescript
import { parseMediaResponse } from '@/utils/stuffMediaParser';

const mediaData = parseMediaResponse(responseText);

if (mediaData) {
  console.log(`获取到 ${mediaData.totalCount} 条记录`);
  console.log('下一页:', mediaData.nextPageToken || '无');
}
```

### 3. 处理分页

```typescript
import { buildNextPageRequest, extractPageToken } from '@/utils/stuffMediaParser';

const pageToken = extractPageToken(responseText);
if (pageToken) {
  const nextFReq = buildNextPageRequest(currentParams, pageToken);
  // 发起下一页请求
}
```

## API 接口标识

### URL 特征

```
https://gemini.google.com/_/BardChatUi/data/batchexecute?
  rpcids=jGArJ
  source-path=/mystuff
  ...
```

### 请求参数 (f.req)

```json
{
  "typeArray": [1, 1, 1, 0, 0, 0, 1],  // Media 类型标识
  "pageSize": 30,
  "pageToken": "..."  // 可选,分页时使用
}
```

**类型数组说明**:
- 位置 3-4 为 `[0, 0]` → Media 请求
- 位置 3-4 为 `[1, 1]` → Docs 请求

### 响应结构

```typescript
interface ParsedMediaResponse {
  items: MediaItem[];        // 媒体项目列表
  nextPageToken?: string;    // 下一页 token
  totalCount: number;        // 当前页项目数
  metadata?: {
    responseSize?: number;   // 响应大小(字节)
    processingTime?: number; // 处理时间(ms)
  };
}
```

### MediaItem 结构

```typescript
interface MediaItem {
  conversationId: string;    // "c_96480b882e7bb164"
  responseId: string;        // "r_54bdc43ff50972bf"
  timestamp: number;         // 1768396706 (Unix 秒)
  timestampNano: number;     // 495190169
  status: MediaItemStatus;   // 1=普通, 3=带标题
  title?: string;            // 可选标题
  thumbnailUrl?: string;     // 可选缩略图
  resourceId: string;        // "rc_be3433e9856e2387"
  hasImage: boolean;         // 是否有图片
  date: Date;                // 完整时间对象
}
```

## 工具函数

### 核心函数

| 函数 | 说明 |
|------|------|
| `isStuffMediaRequest()` | 判断是否为 Media 请求 |
| `parseRequestParams()` | 解析请求参数 |
| `parseMediaResponse()` | 解析响应数据 |
| `extractPageToken()` | 提取分页 token |
| `buildNextPageRequest()` | 构建下一页请求 |

### 工具函数

| 函数 | 说明 |
|------|------|
| `formatMediaItem()` | 格式化项目为字符串 |
| `groupMediaItemsByDate()` | 按日期分组 |
| `filterMediaItemsWithImages()` | 过滤有图片的项目 |
| `filterMediaItemsAudio()` | 过滤有标题的项目 |

## 使用场景

### 1. 在 Background Script 中拦截请求

```typescript
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (details.method === 'POST' && details.requestBody) {
      const formData = parseFormData(details.requestBody);
      
      if (isStuffMediaRequest(details.url, formData)) {
        // 存储请求信息
        storeRequestMetadata(details.requestId, { type: 'stuff-media' });
      }
    }
  },
  { urls: ["https://gemini.google.com/_/BardChatUi/data/batchexecute*"] },
  ["requestBody"]
);
```

### 2. 保存到 IndexedDB

```typescript
const mediaData = parseMediaResponse(responseText);

if (mediaData) {
  await db.stuffMedia.bulkPut(
    mediaData.items.map(item => ({
      conversationId: item.conversationId,
      title: item.title || null,
      thumbnailUrl: item.thumbnailUrl || null,
      timestamp: item.timestamp,
      createdAt: item.date,
    }))
  );
}
```

### 3. 自动获取所有分页

```typescript
async function fetchAllMedia(url: string, formData: Record<string, string>) {
  const allItems: MediaItem[] = [];
  let currentFormData = formData;
  
  while (true) {
    const response = await fetch(url, {
      method: 'POST',
      body: new URLSearchParams(currentFormData)
    });
    
    const responseText = await response.text();
    const mediaData = parseMediaResponse(responseText);
    
    if (!mediaData) break;
    
    allItems.push(...mediaData.items);
    
    if (!mediaData.nextPageToken) break;
    
    // 构建下一页请求
    const params = parseRequestParams(currentFormData['f.req']);
    if (!params) break;
    
    currentFormData = {
      ...currentFormData,
      'f.req': buildNextPageRequest(params, mediaData.nextPageToken)
    };
  }
  
  return allItems;
}
```

## 测试

运行单元测试:

```bash
pnpm test src/utils/stuffMediaParser.test.ts
```

测试覆盖:
- ✅ 请求类型识别
- ✅ 参数解析(首页和分页)
- ✅ 响应解析(图片和标题类型)
- ✅ 分页 token 提取
- ✅ 下一页请求构建
- ✅ 所有工具函数

## 性能特点

- 🚀 **同步解析**: 所有解析函数都是同步的,无阻塞
- 📦 **内存高效**: 使用流式处理,不会一次性加载所有数据
- 🔒 **类型安全**: 完整的 TypeScript 类型,编译时检查
- 🛡️ **错误处理**: 优雅处理各种边界情况,返回 null 而非抛出异常

## 数据示例

### 带图片的记录

```json
{
  "conversationId": "c_96480b882e7bb164",
  "responseId": "r_54bdc43ff50972bf",
  "timestamp": 1768396706,
  "status": 1,
  "thumbnailUrl": "https://lh3.googleusercontent.com/gg/...",
  "hasImage": true,
  "resourceId": "rc_be3433e9856e2387"
}
```

### 带标题的记录

```json
{
  "conversationId": "c_396b19508f294c28",
  "responseId": "r_95c135cc5c02660f",
  "status": 3,
  "title": "巴菲特为何巨亏仍买入SIRI XM",
  "hasImage": false,
  "resourceId": "rc_a098e405e401a395"
}
```

## 相关文档

- [使用指南](../../docs/api/stuff-media-parser-usage.md) - 详细使用示例
- [API 响应示例](./.original/api_response/) - 真实响应数据
- [项目架构](../../.cursor/rules/project-structure.mdc) - 项目结构说明

## 贡献

欢迎提交 Issue 和 Pull Request!

## License

MIT
