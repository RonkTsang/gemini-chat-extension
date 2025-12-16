import type { BridgeMessage } from '@/utils/bridge/msg';

/**
 * Bridge handler interface - each module implements this to handle its methods
 */
export interface BridgeHandler {
  /**
   * The namespace prefix for this handler (e.g., 'analytics')
   */
  namespace: string;

  /**
   * Handle a bridge message for this namespace
   * @param message - The bridge message to handle
   * @returns Promise resolving to the method's return value
   */
  handle(message: BridgeMessage): Promise<any>;
}

/**
 * Registry of all bridge handlers
 */
export class HandlerRegistry {
  private handlers: Map<string, BridgeHandler> = new Map();

  /**
   * Register a handler for a specific namespace
   */
  register(handler: BridgeHandler): void {
    if (this.handlers.has(handler.namespace)) {
      console.warn(`Handler for namespace '${handler.namespace}' already registered, overwriting`);
    }
    this.handlers.set(handler.namespace, handler);
  }

  /**
   * Get handler for a given method name
   * @param methodName - Full method name (e.g., 'analytics.fireEvent')
   * @returns The handler and the remaining method name, or null if not found
   */
  getHandler(methodName: string): { handler: BridgeHandler; method: string } | null {
    const parts = methodName.split('.');
    if (parts.length < 2) {
      return null;
    }

    const namespace = parts[0];
    const method = parts.slice(1).join('.');
    const handler = this.handlers.get(namespace);

    if (!handler) {
      return null;
    }

    return { handler, method };
  }

  /**
   * Get all registered namespaces
   */
  getNamespaces(): string[] {
    return Array.from(this.handlers.keys());
  }
}

