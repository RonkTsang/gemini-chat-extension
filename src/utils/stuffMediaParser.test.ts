/**
 * @file stuffMediaParser.test.ts
 * @description Unit tests for Google Gemini "My Stuff" Media parser
 * Test cases are based on real API response data
 *
 * Running tests:
 * pnpm test              - Watch mode
 * pnpm test:ui           - UI mode
 * pnpm test:run          - Single run
 * pnpm test:coverage     - Generate coverage report
 */

import { describe, it, expect } from 'vitest';
import {
  identifyStuffRequestType,
  isStuffMediaRequest,
  parseRequestParams,
  buildNextPageRequest,
  parseMediaResponse,
  extractPageToken,
  formatMediaItem,
  groupMediaItemsByDate,
  filterMediaItemsWithImages,
  filterMediaItemsAudio,
  STUFF_REQUEST_TYPES,
} from './stuffMediaParser';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get current file's directory path (ES module compatible)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read test sample data
const SAMPLE_RESPONSE_PATH = path.resolve(__dirname, '../../test/samples/media-response.txt');
const sampleResponse = fs.readFileSync(SAMPLE_RESPONSE_PATH, 'utf-8');

describe('stuffMediaParser', () => {
  // ==================== Request Type Identification ====================
  describe('identifyStuffRequestType', () => {
    it('should identify Media type requests', () => {
      expect(identifyStuffRequestType(STUFF_REQUEST_TYPES.MEDIA as any)).toBe('media');
    });

    it('should identify Docs type requests', () => {
      expect(identifyStuffRequestType(STUFF_REQUEST_TYPES.DOCS as any)).toBe('docs');
    });

    it('should return null for invalid type arrays', () => {
      expect(identifyStuffRequestType([0, 0, 0, 0, 0, 0, 0])).toBeNull();
    });
  });

  describe('isStuffMediaRequest', () => {
    it('should identify valid Media requests', () => {
      const url =
        'https://gemini.google.com/_/BardChatUi/data/batchexecute?rpcids=jGArJ&source-path=%2Fmystuff';
      const fReq = encodeURIComponent(
        JSON.stringify([
          [['jGArJ', JSON.stringify([STUFF_REQUEST_TYPES.MEDIA, 30]), null, 'generic']],
        ]),
      );
      const formData = { 'f.req': fReq };

      expect(isStuffMediaRequest(url, formData)).toBe(true);
    });

    it('should reject non-batchexecute endpoints', () => {
      const url = 'https://gemini.google.com/api/other';
      expect(isStuffMediaRequest(url, {})).toBe(false);
    });

    it('should reject incorrect rpcids', () => {
      const url = 'https://gemini.google.com/_/BardChatUi/data/batchexecute?rpcids=OTHER';
      expect(isStuffMediaRequest(url, {})).toBe(false);
    });

    it('should reject Docs type requests', () => {
      const url =
        'https://gemini.google.com/_/BardChatUi/data/batchexecute?rpcids=jGArJ&source-path=%2Fmystuff';
      const fReq = encodeURIComponent(
        JSON.stringify([
          [['jGArJ', JSON.stringify([STUFF_REQUEST_TYPES.DOCS, 30]), null, 'generic']],
        ]),
      );
      const formData = { 'f.req': fReq };

      expect(isStuffMediaRequest(url, formData)).toBe(false);
    });
  });

  // ==================== Request Parameter Parsing ====================
  describe('Request Parameter Parsing', () => {
    it('should parse first page request parameters', () => {
      const fReq = encodeURIComponent(
        JSON.stringify([
          [['jGArJ', JSON.stringify([STUFF_REQUEST_TYPES.MEDIA, 30]), null, 'generic']],
        ]),
      );
      const params = parseRequestParams(fReq);

      expect(params).not.toBeNull();
      expect(params?.pageSize).toBe(30);
      expect(params?.pageToken).toBeUndefined();
    });

    it('should parse request parameters with page token', () => {
      const fReq = encodeURIComponent(
        JSON.stringify([
          [['jGArJ', JSON.stringify([STUFF_REQUEST_TYPES.MEDIA, 50, 'token123']), null, 'generic']],
        ]),
      );
      const params = parseRequestParams(fReq);

      expect(params?.pageSize).toBe(50);
      expect(params?.pageToken).toBe('token123');
    });

    it('should handle invalid f.req', () => {
      expect(parseRequestParams('invalid')).toBeNull();
    });

    it('should build next page request', () => {
      const currentParams = {
        typeArray: STUFF_REQUEST_TYPES.MEDIA as any,
        pageSize: 30,
      };
      const token = 'next_token';
      const built = buildNextPageRequest(currentParams, token);

      const decoded = decodeURIComponent(built);
      const outer = JSON.parse(decoded);
      const inner = JSON.parse(outer[0][0][1]);

      expect(inner[2]).toBe(token);
    });
  });

  // ==================== Response Parsing ====================
  describe('Response Parsing', () => {
    it('should parse real media response data', () => {
      // Use real test sample data
      const result = parseMediaResponse(sampleResponse);

      expect(result).not.toBeNull();
      expect(result?.totalCount).toBeGreaterThan(0);

      // Check the first item
      const firstItem = result!.items[0];
      expect(firstItem.conversationId).toBeDefined();
      expect(firstItem.responseId).toBeDefined();
      expect(firstItem.timestamp).toBeGreaterThan(0);
      expect(firstItem.date).toBeInstanceOf(Date);
      expect(firstItem.hasImage).toBe(true);
      expect(firstItem.thumbnailUrl).toBeDefined();

      // Check page token
      expect(result?.nextPageToken).toBeDefined();

      // Check if it contains items with titles
      const titleItems = result!.items.filter((item) => item.title);
      expect(titleItems.length).toBeGreaterThan(0);
      expect(titleItems[0].title).toBe('Why Warren Buffett Bought SIRI XM Despite Huge Losses');
    });

    it('should handle invalid responses', () => {
      expect(parseMediaResponse('not json')).toBeNull();
      expect(parseMediaResponse('{"error": 500}')).toBeNull();
    });

    it('should extract page token from real response', () => {
      const token = extractPageToken(sampleResponse);
      expect(token).not.toBeNull();
      expect(typeof token).toBe('string');
    });

    it('should return null for response without page token', () => {
      const emptyResponse = ')]}\'\n\n[[["wResponse",null,"[[[]]]"]]]';
      expect(extractPageToken(emptyResponse)).toBeNull();
    });
  });

  // ==================== Utility Functions ====================
  describe('Utility Functions', () => {
    it('should format item with image', () => {
      const item = {
        conversationId: 'conv123',
        responseId: 'resp456',
        timestamp: 1700000000,
        timestampNano: 0,
        status: 1,
        resourceId: 'res789',
        hasImage: true,
        date: new Date(1700000000 * 1000),
      };

      const formatted = formatMediaItem(item);
      expect(formatted).toContain('conv123');
      expect(formatted).toContain('Has Image');
      expect(formatted).toContain('res789');
    });

    it('should format item with title', () => {
      const item = {
        conversationId: 'conv123',
        responseId: 'resp456',
        timestamp: 1700000000,
        timestampNano: 0,
        status: 3,
        title: 'Test Title',
        resourceId: 'res789',
        hasImage: false,
        date: new Date(1700000000 * 1000),
      };

      const formatted = formatMediaItem(item);
      expect(formatted).toContain('conv123');
      expect(formatted).toContain('Title: Test Title');
      expect(formatted).not.toContain('Has Image');
    });

    it('should group by date', () => {
      const items = [
        {
          conversationId: '1',
          date: new Date('2024-01-01T10:00:00Z'),
        },
        {
          conversationId: '2',
          date: new Date('2024-01-01T15:00:00Z'),
        },
        {
          conversationId: '3',
          date: new Date('2024-01-02T10:00:00Z'),
        },
      ] as any;

      const grouped = groupMediaItemsByDate(items);
      expect(Object.keys(grouped)).toHaveLength(2);
      expect(grouped['2024-01-01']).toHaveLength(2);
      expect(grouped['2024-01-02']).toHaveLength(1);
    });

    it('should return items with images only', () => {
      const items = [
        { conversationId: '1', hasImage: true },
        { conversationId: '2', hasImage: false },
        { conversationId: '3', hasImage: true },
      ] as any;

      const filtered = filterMediaItemsWithImages(items);
      expect(filtered).toHaveLength(2);
      expect(filtered[0].conversationId).toBe('1');
    });

    it('should return items with titles only', () => {
      const items = [
        { conversationId: '1', title: 'Title' },
        { conversationId: '2', title: undefined },
        { conversationId: '3', title: '' },
      ] as any;

      const filtered = filterMediaItemsAudio(items);
      expect(filtered).toHaveLength(1);
      expect(filtered[0].conversationId).toBe('1');
    });
  });
});
