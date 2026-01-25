/**
 * Stuff Media Parser Tests
 * 
 * 测试用例基于实际的 API 响应数据
 * @see .original/api_response/stuff-media.txt
 * @see .original/api_response/stuff-media-page-2.txt
 * 
 * 运行测试:
 * pnpm test              - 监视模式
 * pnpm test:ui           - UI 模式
 * pnpm test:run          - 单次运行
 * pnpm test:coverage     - 生成覆盖率报告
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {
  STUFF_REQUEST_TYPES,
  identifyStuffRequestType,
  isStuffMediaRequest,
  parseRequestParams,
  parseMediaResponse,
  extractPageToken,
  buildNextPageRequest,
  formatMediaItem,
  groupMediaItemsByDate,
  filterMediaItemsWithImages,
  filterMediaItemsWithTitle,
  type StuffRequestParams,
  MediaItemStatus,
} from './stuffMediaParser';

// 获取当前文件的目录路径 (ES 模块兼容)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 读取测试样本数据
const TEST_SAMPLES_DIR = join(__dirname, '../../test/samples');
const mediaResponseSample = readFileSync(
  join(TEST_SAMPLES_DIR, 'media-response.txt'),
  'utf-8'
);

describe('stuffMediaParser', () => {
  
  // ==================== 请求类型识别 ====================
  
  describe('identifyStuffRequestType', () => {
    it('应该识别 Media 类型请求', () => {
      const result = identifyStuffRequestType(STUFF_REQUEST_TYPES.MEDIA);
      expect(result).toBe('media');
    });

    it('应该识别 Docs 类型请求', () => {
      const result = identifyStuffRequestType(STUFF_REQUEST_TYPES.DOCS);
      expect(result).toBe('docs');
    });

    it('应该返回 null 对于无效的类型数组', () => {
      expect(identifyStuffRequestType([1, 2, 3])).toBe(null);
      expect(identifyStuffRequestType([0, 0, 0, 0, 0, 0, 0])).toBe(null);
    });
  });

  describe('isStuffMediaRequest', () => {
    it('应该识别有效的 Media 请求', () => {
      const url = 'https://gemini.google.com/_/BardChatUi/data/batchexecute?rpcids=jGArJ&source-path=%2Fmystuff&hl=en';
      const formData = {
        'f.req': encodeURIComponent('[[["jGArJ","[[1,1,1,0,0,0,1],30]",null,"generic"]]]')
      };

      expect(isStuffMediaRequest(url, formData)).toBe(true);
    });

    it('应该拒绝非 batchexecute 端点', () => {
      const url = 'https://gemini.google.com/other/endpoint';
      const formData = {
        'f.req': encodeURIComponent('[[["jGArJ","[[1,1,1,0,0,0,1],30]",null,"generic"]]]')
      };

      expect(isStuffMediaRequest(url, formData)).toBe(false);
    });

    it('应该拒绝错误的 rpcids', () => {
      const url = 'https://gemini.google.com/_/BardChatUi/data/batchexecute?rpcids=wrongId&source-path=%2Fmystuff';
      const formData = {
        'f.req': encodeURIComponent('[[["jGArJ","[[1,1,1,0,0,0,1],30]",null,"generic"]]]')
      };

      expect(isStuffMediaRequest(url, formData)).toBe(false);
    });

    it('应该拒绝 Docs 类型请求', () => {
      const url = 'https://gemini.google.com/_/BardChatUi/data/batchexecute?rpcids=jGArJ&source-path=%2Fmystuff';
      const formData = {
        'f.req': encodeURIComponent('[[["jGArJ","[[1,1,1,1,1,0,1],30]",null,"generic"]]]')
      };

      expect(isStuffMediaRequest(url, formData)).toBe(false);
    });
  });

  // ==================== 请求参数解析 ====================
  
  describe('parseRequestParams', () => {
    it('应该解析第一页请求参数', () => {
      const fReq = encodeURIComponent('[[["jGArJ","[[1,1,1,0,0,0,1],30]",null,"generic"]]]');
      const params = parseRequestParams(fReq);

      expect(params).not.toBeNull();
      expect(params?.typeArray).toEqual([1, 1, 1, 0, 0, 0, 1]);
      expect(params?.pageSize).toBe(30);
      expect(params?.pageToken).toBeUndefined();
    });

    it('应该解析带分页 token 的请求参数', () => {
      const pageToken = 'tClQBf34IgCvYrjHHPh/zNTW/Gi4RxDJ4Wl7BxAa6oIQ+L4zAlJezckNYMdKlzOjy86EPcIkBLSJ15h43MYF2EfFllt/Fb4dx/2CYa79mgcuu3I3jsJAQAg==';
      const fReq = encodeURIComponent(`[[["jGArJ","[[1,1,1,0,0,0,1],30,\\"${pageToken}\\"]",null,"generic"]]]`);
      const params = parseRequestParams(fReq);

      expect(params).not.toBeNull();
      expect(params?.typeArray).toEqual([1, 1, 1, 0, 0, 0, 1]);
      expect(params?.pageSize).toBe(30);
      expect(params?.pageToken).toBe(pageToken);
    });

    it('应该处理无效的 f.req', () => {
      expect(parseRequestParams('invalid')).toBeNull();
      expect(parseRequestParams('')).toBeNull();
    });
  });

  describe('buildNextPageRequest', () => {
    it('应该构建下一页请求', () => {
      const currentParams: StuffRequestParams = {
        typeArray: [1, 1, 1, 0, 0, 0, 1],
        pageSize: 30,
      };
      const nextToken = 'nextPageToken123';

      const fReq = buildNextPageRequest(currentParams, nextToken);
      const decoded = decodeURIComponent(fReq);
      const parsed = JSON.parse(decoded);

      expect(parsed[0][0][0]).toBe('jGArJ');
      
      const innerParams = JSON.parse(parsed[0][0][1]);
      expect(innerParams[0]).toEqual([1, 1, 1, 0, 0, 0, 1]);
      expect(innerParams[1]).toBe(30);
      expect(innerParams[2]).toBe(nextToken);
    });
  });

  // ==================== 响应解析 ====================
  
  describe('parseMediaResponse', () => {
    it('应该解析真实的媒体响应数据', () => {
      // 使用真实的测试样本数据
      const result = parseMediaResponse(mediaResponseSample);

      expect(result).not.toBeNull();
      expect(result?.items.length).toBeGreaterThan(0);
      
      // 检查第一个项目
      const firstItem = result!.items[0];
      expect(firstItem.conversationId).toBe('c_96480b882e7bb164');
      expect(firstItem.responseId).toBe('r_54bdc43ff50972bf');
      expect(firstItem.timestamp).toBe(1768396706);
      expect(firstItem.timestampNano).toBe(495190169);
      expect(firstItem.status).toBe(MediaItemStatus.Normal);
      expect(firstItem.hasImage).toBe(true);
      expect(firstItem.thumbnailUrl).toContain('https://lh3.googleusercontent.com/gg/');
      expect(firstItem.resourceId).toBe('rc_be3433e9856e2387');
      expect(firstItem.date).toBeInstanceOf(Date);
      
      // 检查分页 token
      expect(result?.nextPageToken).toBeTruthy();
      expect(result?.nextPageToken).toContain('tClQBf34Ig');
      
      // 检查是否包含带标题的项目
      const titleItems = result!.items.filter(item => item.status === MediaItemStatus.WithTitle);
      expect(titleItems.length).toBeGreaterThan(0);
      expect(titleItems[0].title).toBe('巴菲特为何巨亏仍买入SIRI XM');
    });

    it('应该处理无效的响应', () => {
      expect(parseMediaResponse('')).toBeNull();
      expect(parseMediaResponse('invalid')).toBeNull();
      expect(parseMediaResponse(')]}\'\\n\\n')).toBeNull();
    });
  });

  describe('extractPageToken', () => {
    it('应该从真实响应中提取分页 token', () => {
      const token = extractPageToken(mediaResponseSample);
      expect(token).toBeTruthy();
      expect(token).toContain('tClQBf34Ig');
    });

    it('应该返回 null 对于无分页 token 的响应', () => {
      const noTokenResponse = `)]}'\n\n100\n[["wrb.fr","jGArJ","[[[[\\\"c_test\\\",\\\"r_test\\\"],[1234567890,0],1,null,[null,\\\"url\\\"],\\\"rc_test\\\"]]]",null,null,null,"generic"]]`;
      const token = extractPageToken(noTokenResponse);
      expect(token).toBeNull();
    });
  });

  // ==================== 工具函数 ====================
  
  describe('formatMediaItem', () => {
    it('应该格式化带图片的项目', () => {
      const item = {
        conversationId: 'c_123',
        responseId: 'r_456',
        timestamp: 1768396706,
        timestampNano: 495190169,
        status: MediaItemStatus.Normal,
        thumbnailUrl: 'https://example.com/image.jpg',
        resourceId: 'rc_789',
        hasImage: true,
        date: new Date(1768396706000),
      };

      const formatted = formatMediaItem(item);
      expect(formatted).toContain('c_123');
      expect(formatted).toContain('Has Image');
      expect(formatted).toContain('rc_789');
    });

    it('应该格式化带标题的项目', () => {
      const item = {
        conversationId: 'c_123',
        responseId: 'r_456',
        timestamp: 1768396706,
        timestampNano: 0,
        status: MediaItemStatus.WithTitle,
        title: 'Test Title',
        resourceId: 'rc_789',
        hasImage: false,
        date: new Date(1768396706000),
      };

      const formatted = formatMediaItem(item);
      expect(formatted).toContain('Test Title');
      expect(formatted).toContain('No Image');
    });
  });

  describe('groupMediaItemsByDate', () => {
    it('应该按日期分组', () => {
      const items = [
        {
          conversationId: 'c_1',
          responseId: 'r_1',
          timestamp: 1768396706,
          timestampNano: 0,
          status: MediaItemStatus.Normal,
          resourceId: 'rc_1',
          hasImage: false,
          date: new Date('2026-01-15'),
        },
        {
          conversationId: 'c_2',
          responseId: 'r_2',
          timestamp: 1768396706,
          timestampNano: 0,
          status: MediaItemStatus.Normal,
          resourceId: 'rc_2',
          hasImage: false,
          date: new Date('2026-01-15'),
        },
        {
          conversationId: 'c_3',
          responseId: 'r_3',
          timestamp: 1768396706,
          timestampNano: 0,
          status: MediaItemStatus.Normal,
          resourceId: 'rc_3',
          hasImage: false,
          date: new Date('2026-01-16'),
        },
      ];

      const grouped = groupMediaItemsByDate(items);

      expect(Object.keys(grouped)).toHaveLength(2);
      expect(grouped['2026-01-15']).toHaveLength(2);
      expect(grouped['2026-01-16']).toHaveLength(1);
    });
  });

  describe('filterMediaItemsWithImages', () => {
    it('应该只返回带图片的项目', () => {
      const items = [
        {
          conversationId: 'c_1',
          responseId: 'r_1',
          timestamp: 1768396706,
          timestampNano: 0,
          status: MediaItemStatus.Normal,
          thumbnailUrl: 'url1',
          resourceId: 'rc_1',
          hasImage: true,
          date: new Date(),
        },
        {
          conversationId: 'c_2',
          responseId: 'r_2',
          timestamp: 1768396706,
          timestampNano: 0,
          status: MediaItemStatus.WithTitle,
          resourceId: 'rc_2',
          hasImage: false,
          date: new Date(),
        },
      ];

      const filtered = filterMediaItemsWithImages(items);
      expect(filtered).toHaveLength(1);
      expect(filtered[0].conversationId).toBe('c_1');
    });
  });

  describe('filterMediaItemsWithTitle', () => {
    it('应该只返回带标题的项目', () => {
      const items = [
        {
          conversationId: 'c_1',
          responseId: 'r_1',
          timestamp: 1768396706,
          timestampNano: 0,
          status: MediaItemStatus.Normal,
          resourceId: 'rc_1',
          hasImage: false,
          date: new Date(),
        },
        {
          conversationId: 'c_2',
          responseId: 'r_2',
          timestamp: 1768396706,
          timestampNano: 0,
          status: MediaItemStatus.WithTitle,
          title: 'Test Title',
          resourceId: 'rc_2',
          hasImage: false,
          date: new Date(),
        },
      ];

      const filtered = filterMediaItemsWithTitle(items);
      expect(filtered).toHaveLength(1);
      expect(filtered[0].conversationId).toBe('c_2');
      expect(filtered[0].title).toBe('Test Title');
    });
  });
});
