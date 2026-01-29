# Google Gemini "My Stuff" Media Parser

A complete parsing utility for the Google Gemini "My Stuff" Media interface.

## Features

- ✅ **Request Identification**: Automatically identifies Stuff Media type `batchexecute` requests.
- ✅ **Parameter Parsing**: Parses and builds request parameters, including pagination support.
- ✅ **Response Parsing**: Fully parses media data, including images, titles, timestamps, etc.
- ✅ **Pagination Handling**: Automatically extracts and builds next page requests.
- ✅ **Utility Functions**: Provides useful tools for filtering, grouping, and formatting.
- ✅ **Type Safety**: Full TypeScript type definitions.
- ✅ **Unit Testing**: Covers all core functionality.

## File Structure

```text
src/utils/
├── stuffMediaParser.ts       # Core parsing logic
└── stuffMediaParser.test.ts  # Unit tests

docs/api/
└── stuff-media-parser-usage.md  # Usage guide

test/samples/
└── media-response.txt        # Sample response data
```

## Quick Start

### 1. Identify Requests

```typescript
if (isStuffMediaRequest(url, formData)) {
  console.log('Stuff Media request detected');
}
```

### 2. Parse Response

```typescript
const mediaData = parseMediaResponse(responseText);
if (mediaData) {
  console.log(`Fetched ${mediaData.totalCount} records`);
  console.log('Next Page:', mediaData.nextPageToken || 'None');
}
```

### 3. Handle Pagination

```typescript
const nextParams = buildNextPageRequest(currentParams, pageToken);
// Issue next page request
```

## API Interface Identification

### URL Features
- Endpoint: `/_/BardChatUi/data/batchexecute`
- Parameter: `rpcids=jGArJ`
- Parameter: `source-path=/mystuff`

### Request Parameters (f.req)
```json
[
  "typeArray": [1, 1, 1, 0, 0, 0, 1],  // Media type identifier
  "pageSize": 30,                      // Default 30
  "pageToken": "..."                   // Optional, used for pagination
]
```

**Type Array Description**:
- Position 3-4 is `[0, 0]` → Media request
- Position 3-4 is `[1, 1]` → Docs request

### Response Structure
```typescript
{
  items: MediaItem[];        // List of media items
  nextPageToken?: string;    // Next page token
  totalCount: number;        // Item count in current page
  metadata?: {
    responseSize?: number;   // Response size (bytes)
    processingTime?: number; // Processing time (ms)
  }
}
```

### MediaItem Structure
```typescript
{
  conversationId: string;    // "c_..."
  responseId: string;        // "r_..."
  timestamp: number;         // 1768396706 (Unix seconds)
  status: MediaItemStatus;   // 1=Normal, 3=Audio
  title?: string;            // Optional title
  thumbnailUrl?: string;     // Optional thumbnail URL
  resourceId: string;        // "rc_..."
  hasImage: boolean;         // Whether it has an image
  date: Date;                // Full Date object
}
```

## API Functions

### Core Functions

| Function | Description |
| :--- | :--- |
| `isStuffMediaRequest()` | Determines if it is a Media request |
| `parseRequestParams()` | Parses request parameters |
| `parseMediaResponse()` | Parses response data |
| `extractPageToken()` | Extracts pagination token |
| `buildNextPageRequest()` | Builds request for the next page |

### Utility Functions

| Function | Description |
| :--- | :--- |
| `formatMediaItem()` | Formats an item as a string |
| `groupMediaItemsByDate()` | Groups items by date |
| `filterMediaItemsWithImages()` | Filters items with images |
| `filterMediaItemsAudio()` | Filters items with titles |

## Usage Scenarios

### 1. Intercepting Requests in Background Script
- Monitor `batchexecute` requests.
- Identify Media requests using `isStuffMediaRequest`.
- Store request information.

### 2. Saving to IndexedDB
- Parse the response.
- Map `MediaItem` to database records.
- Batch save using `bulkPut`.

### 3. Automatically Fetching All Pages
- Loop through requests until `nextPageToken` is null.
- Build each subsequent request using `buildNextPageRequest`.

## Testing

Run unit tests:
```bash
pnpm test src/utils/stuffMediaParser.test.ts
```

Test Coverage:
- ✅ Request type identification
- ✅ Parameter parsing (initial and paginated)
- ✅ Response parsing (image and title types)
- ✅ Pagination token extraction
- ✅ Next page request construction
- ✅ All utility functions

## Performance Characteristics

- 🚀 **Synchronous Parsing**: All parsing functions are synchronous and non-blocking.
- 📦 **Memory Efficient**: Uses stream-like processing to avoid loading all data at once.
- 🔒 **Type Safety**: Full TypeScript types with compile-time checks.
- 🛡️ **Error Handling**: Gracefully handles boundary cases, returning `null` instead of throwing exceptions.

## Data Examples

### Record with Image
- Status: 1
- `hasImage`: true
- `thumbnailUrl`: "https://..."

### Record with Title
- Status: 3
- `title`: "Why Warren Buffett Bought SIRI XM Despite Huge Losses"

## Related Documents

- [Usage Guide](../../docs/api/stuff-media-parser-usage.md) - Detailed examples
- [API Response Examples](./.original/api_response/) - Real response data
- [Project Architecture](../../.cursor/rules/project-structure.mdc) - Project structure description

## Contribution

Issues and Pull Requests are welcome!
