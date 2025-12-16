/**
 * Bridge message type constant to identify bridge messages
 */
export const BRIDGE_MESSAGE_TYPE = 'BRIDGE_CALL' as const;

/**
 * Bridge message structure sent from content script to background
 */
export interface BridgeMessage<T = any> {
  type: typeof BRIDGE_MESSAGE_TYPE;
  name: string;
  params: T;
  requestId: string;
}

/**
 * Bridge response structure sent from background to content script
 */
export interface BridgeResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    message: string;
    stack?: string;
  };
}

/**
 * Analytics method parameters
 */
export interface AnalyticsFireEventParams {
  name: string;
  params?: Record<string, any>;
}

export interface AnalyticsFirePageViewEventParams {
  pageTitle: string;
  pageLocation: string;
  additionalParams?: Record<string, any>;
}

export interface AnalyticsFireErrorEventParams {
  error: any;
  additionalParams?: Record<string, any>;
}

/**
 * Bridge method map - defines all available methods that can be called via bridge
 * Key format: 'namespace.methodName'
 */
export interface BridgeMethodMap {
  'analytics.fireEvent': (params: AnalyticsFireEventParams) => Promise<void>;
  'analytics.firePageViewEvent': (params: AnalyticsFirePageViewEventParams) => Promise<void>;
  'analytics.fireErrorEvent': (params: AnalyticsFireErrorEventParams) => Promise<void>;
}

/**
 * Helper type to extract method names
 */
export type BridgeMethodName = keyof BridgeMethodMap;

/**
 * Helper type to extract parameters for a specific method
 */
export type BridgeMethodParams<K extends BridgeMethodName> = Parameters<BridgeMethodMap[K]>[0];

/**
 * Helper type to extract return type for a specific method
 */
export type BridgeMethodReturn<K extends BridgeMethodName> = ReturnType<BridgeMethodMap[K]>;

