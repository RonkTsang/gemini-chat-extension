import { browser } from 'wxt/browser';
import type {
  BridgeMessage,
  BridgeResponse,
  BridgeMethodName,
  BridgeMethodParams,
  BridgeMethodReturn,
} from './msg';
import { BRIDGE_MESSAGE_TYPE } from './msg';

/**
 * Default timeout for bridge calls (30 seconds)
 */
const DEFAULT_TIMEOUT_MS = 30000;

/**
 * Error thrown when a bridge call times out
 */
export class BridgeTimeoutError extends Error {
  constructor(methodName: string, timeout: number) {
    super(`Bridge call to '${methodName}' timed out after ${timeout}ms`);
    this.name = 'BridgeTimeoutError';
  }
}

/**
 * Error thrown when a bridge call fails
 */
export class BridgeCallError extends Error {
  constructor(methodName: string, originalError: string, stack?: string) {
    super(`Bridge call to '${methodName}' failed: ${originalError}`);
    this.name = 'BridgeCallError';
    if (stack) {
      this.stack = stack;
    }
  }
}

/**
 * Call a method in the background script from content script
 * 
 * @param name - The method name (e.g., 'analytics.fireEvent')
 * @param params - The parameters to pass to the method
 * @param timeout - Optional timeout in milliseconds (default: 30000)
 * @returns Promise resolving to the method's return value
 * 
 * @example
 * ```ts
 * await call('analytics.fireEvent', {
 *   name: 'button_clicked',
 *   params: { button_name: 'prompt-entrance' }
 * });
 * ```
 */
export async function call<K extends BridgeMethodName>(
  name: K,
  params: BridgeMethodParams<K>,
  timeout: number = DEFAULT_TIMEOUT_MS
): Promise<BridgeMethodReturn<K> extends Promise<infer T> ? T : never> {
  const requestId = crypto.randomUUID();

  const message: BridgeMessage<BridgeMethodParams<K>> = {
    type: BRIDGE_MESSAGE_TYPE,
    name,
    params,
    requestId,
  };

  // Create a timeout promise
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new BridgeTimeoutError(name, timeout));
    }, timeout);
  });

  // Create the actual call promise
  const callPromise = (async () => {
    try {
      const response = await browser.runtime.sendMessage(message) as BridgeResponse;

      if (!response) {
        throw new Error('No response received from background script');
      }

      if (!response.success) {
        throw new BridgeCallError(
          name,
          response.error?.message || 'Unknown error',
          response.error?.stack
        );
      }

      return response.data;
    } catch (error) {
      // If it's already a BridgeCallError or BridgeTimeoutError, rethrow it
      if (error instanceof BridgeCallError || error instanceof BridgeTimeoutError) {
        throw error;
      }

      // Otherwise, wrap it in a BridgeCallError
      if (error instanceof Error) {
        throw new BridgeCallError(name, error.message, error.stack);
      }

      throw new BridgeCallError(name, String(error));
    }
  })();

  // Race between timeout and actual call
  return Promise.race([callPromise, timeoutPromise]);
}

/**
 * Export message types and constants for use in other modules
 */
export * from './msg';

