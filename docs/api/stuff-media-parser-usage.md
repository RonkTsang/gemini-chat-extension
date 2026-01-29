# Stuff Media Parser Usage Guide

## Overview

The `stuffMediaParser` utility provides complete parsing functionality for the Google Gemini "My Stuff" Media interface, including:

- ✅ Request parameter parsing and building
- ✅ Response data parsing
- ✅ Pagination handling
- ✅ Data filtering and formatting tools

## Quick Start

### 1. Identify Stuff Media Requests

```typescript
import { isStuffMediaRequest } from '@/utils/stuffMediaParser';

// In webRequest interceptor
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (details.method === 'POST' && details.requestBody) {
      const formData = parseFormDataFromRequest(details.requestBody);
      
      if (isStuffMediaRequest(details.url, formData)) {
        console.log('[Stuff Media] Media request detected');
        // Store request metadata for subsequent response processing
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

### 2. Parse Request Parameters

```typescript
import { parseRequestParams, identifyStuffRequestType } from '@/utils/stuffMediaParser';

// Parse f.req form parameters
const params = parseRequestParams(formData['f.req']);

if (params) {
  console.log('Request Type:', identifyStuffRequestType(params.typeArray));
  console.log('Page Size:', params.pageSize);
  console.log('Page Token:', params.pageToken || 'First Page');
}

// Output:
// Request Type: media
// Page Size: 30
// Page Token: First Page
```

### 3. Parse Response Data

```typescript
import { parseMediaResponse } from '@/utils/stuffMediaParser';

// Get response text
const response = await fetch(url);
const responseText = await response.text();

// Parse media data
const mediaData = parseMediaResponse(responseText);

if (mediaData) {
  console.log(`Fetched ${mediaData.totalCount} media records`);
  
  mediaData.items.forEach(item => {
    console.log(`Conversation ID: ${item.conversationId}`);
    console.log(`Date: ${item.date.toLocaleString()}`);
    console.log(`Title: ${item.title || 'None'}`);
    console.log(`Image: ${item.hasImage ? item.thumbnailUrl : 'None'}`);
    console.log('---');
  });
  
  if (mediaData.nextPageToken) {
    console.log('Next page exists, Token:', mediaData.nextPageToken);
  }
}
```

### 4. Handle Pagination

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
    // Send request
    const response = await fetch(initialUrl, {
      method: 'POST',
      body: new URLSearchParams(currentFormData)
    });
    
    const responseText = await response.text();
    const pageToken = extractPageToken(responseText);
    
    // Parse current page data
    const mediaData = parseMediaResponse(responseText);
    if (mediaData) {
      allItems.push(...mediaData.items);
      console.log(`Fetched ${allItems.length} records`);
    }
    
    // Check if there's a next page
    if (!pageToken) {
      break;
    }
    
    // Build next page request
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

## Data Structure

### MediaItem

```typescript
interface MediaItem {
  conversationId: string;    // Conversation ID (e.g., "c_96480b882e7bb164")
  responseId: string;        // Response ID (e.g., "r_54bdc43ff50972bf")
  timestamp: number;         // Unix timestamp (seconds)
  timestampNano: number;     // Nanosecond timestamp
  status: MediaItemStatus;   // Status code (1=Normal, 3=Audio)
  title?: string;            // Conversation title (optional)
  thumbnailUrl?: string;     // Thumbnail URL (optional)
  resourceId: string;        // Resource ID (e.g., "rc_be3433e9856e2387")
  hasImage: boolean;         // Whether it contains an image
  date: Date;                // Complete Date object
}
```

### MediaItemStatus

```typescript
enum MediaItemStatus {
  Normal = 1,      // Normal conversation (with image)
  Audio = 3,       // Conversation with title
  Report = 4,      // Analysis report
  Document = 5,    // Document
  Code = 6,        // Code
}
```

## Utility Functions

### Formatted Output

```typescript
import { formatMediaItem } from '@/utils/stuffMediaParser';

const item = mediaData.items[0];
console.log(formatMediaItem(item));
// Output: ID: c_96480b882e7bb164 | Date: 2026/1/24 10:05:06 | Has Image | Resource: rc_be3433e9856e2387
```

### Group by Date

```typescript
import { groupMediaItemsByDate } from '@/utils/stuffMediaParser';

const grouped = groupMediaItemsByDate(mediaData.items);

Object.entries(grouped).forEach(([date, items]) => {
  console.log(`${date}: ${items.length} records`);
});

// Output:
// 2026-01-24: 5 records
// 2026-01-23: 8 records
// 2026-01-22: 3 records
```

### Filter Data

```typescript
import { 
  filterMediaItemsWithImages, 
  filterMediaItemsAudio 
} from '@/utils/stuffMediaParser';

// Only get records with images
const withImages = filterMediaItemsWithImages(mediaData.items);
console.log(`${withImages.length} records contain images`);

// Only get records with titles
const withTitles = filterMediaItemsAudio(mediaData.items);
console.log(`${withTitles.length} records have titles`);
withTitles.forEach(item => {
  console.log(`- ${item.title}`);
});
```

## Complete Example: Save to IndexedDB

```typescript
import { parseMediaResponse, type MediaItem } from '@/utils/stuffMediaParser';
import { db } from '@/data/db';

async function saveMediaItemsToDB(responseText: string) {
  const mediaData = parseMediaResponse(responseText);
  
  if (!mediaData) {
    console.error('Failed to parse response');
    return;
  }
  
  try {
    // Convert to database format
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
    
    // Batch save
    await db.stuffMedia.bulkPut(dbRecords);
    
    console.log(`Successfully saved ${dbRecords.length} media records`);
    
    // Return next page token
    return mediaData.nextPageToken;
  } catch (error) {
    console.error('Failed to save to database:', error);
    throw error;
  }
}
```

## Use in Background Script

```typescript
// background.ts
import { 
  isStuffMediaRequest, 
  parseMediaResponse,
  extractPageToken 
} from '@/utils/stuffMediaParser';

// Map to store request ID and metadata
const pendingRequests = new Map<string, { type: string; timestamp: number }>();

// Intercept request
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

// Handle response (needs to get response body via content script or other means)
async function handleMediaResponse(requestId: string, responseText: string) {
  const metadata = pendingRequests.get(requestId);
  
  if (!metadata || metadata.type !== 'stuff-media') {
    return;
  }
  
  // Parse response
  const mediaData = parseMediaResponse(responseText);
  
  if (mediaData) {
    // Save to database
    await saveMediaItemsToDB(responseText);
    
    // Notify UI update
    chrome.runtime.sendMessage({
      type: 'stuff-media-updated',
      count: mediaData.totalCount,
      hasMore: !!mediaData.nextPageToken
    });
  }
  
  // Clean up
  pendingRequests.delete(requestId);
}

function extractFormData(requestBody: chrome.webRequest.WebRequestBody): Record<string, string> {
  // Implement form data extraction logic
  // ...
}
```

## Type Safety

All functions provide complete TypeScript type definitions:

```typescript
import type { 
  MediaItem,
  MediaItemStatus,
  ParsedMediaResponse,
  StuffRequestParams,
  StuffRequestTypeArray 
} from '@/utils/stuffMediaParser';

// Use type guards
function isMediaItemWithImage(item: MediaItem): item is MediaItem & { thumbnailUrl: string } {
  return item.hasImage && !!item.thumbnailUrl;
}

// Type-safe processing
mediaData.items
  .filter(isMediaItemWithImage)
  .forEach(item => {
    // TypeScript knows item.thumbnailUrl must exist
    console.log(item.thumbnailUrl);
  });
```

## Error Handling

All parsing functions handle errors gracefully:

```typescript
import { parseMediaResponse } from '@/utils/stuffMediaParser';

const result = parseMediaResponse(responseText);

if (!result) {
  // Parsing failed, possible reasons:
  // - Invalid response format
  // - Not a valid Stuff Media response
  // - Data corruption
  console.error('Unable to parse Media response');
  return;
}

// Safely use data
console.log(`Fetched ${result.items.length} records`);
```

## Performance Considerations

- ✅ All parsing functions are synchronous and do not block I/O
- ✅ Efficient use of functional methods like `filter` and `map`
- ✅ Pagination handling avoids loading large amounts of data at once
- ✅ Optional metadata extraction (e.g., response size, processing time)

## Debugging Tips

```typescript
import { 
  parseRequestParams, 
  parseMediaResponse,
  formatMediaItem 
} from '@/utils/stuffMediaParser';

// Enable detailed logging
const DEBUG = true;

function debugParse(responseText: string) {
  if (DEBUG) {
    console.group('[Stuff Media Debug]');
    
    // Check response format
    console.log('Response Length:', responseText.length);
    console.log('XSSI Prefix:', responseText.substring(0, 10));
    
    // Try parsing
    const result = parseMediaResponse(responseText);
    
    if (result) {
      console.log('✅ Parsing successful');
      console.log('Item Count:', result.totalCount);
      console.log('Next Page Token:', result.nextPageToken || 'None');
      console.log('Response Size:', result.metadata?.responseSize);
      console.log('Processing Time:', result.metadata?.processingTime, 'ms');
      
      // Show first 3 records
      console.log('\nFirst 3 Records:');
      result.items.slice(0, 3).forEach((item, idx) => {
        console.log(`${idx + 1}. ${formatMediaItem(item)}`);
      });
    } else {
      console.error('❌ Parsing failed');
    }
    
    console.groupEnd();
  }
}
```

## Related Files

- Implementation: `src/utils/stuffMediaParser.ts`
- Tests: `src/utils/stuffMediaParser.test.ts`
- Sample Data:
  - `.original/api_response/stuff-media.txt` (Page 1)
  - `.original/api_response/stuff-media-page-2.txt` (Page 2)
