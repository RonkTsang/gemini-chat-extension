import { browser } from 'wxt/browser';
import type { BridgeMessage, BridgeResponse } from '@/utils/bridge/msg';
import { BRIDGE_MESSAGE_TYPE } from '@/utils/bridge/msg';
import { HandlerRegistry } from './types';
import { getAllHandlers } from './handlers';

/**
 * Initialize handler registry and register all handlers
 */
const registry = new HandlerRegistry();

// Register all handlers
getAllHandlers().forEach((handler) => {
  registry.register(handler);
});

console.log(`Registered bridge handlers for: ${registry.getNamespaces().join(', ')}`);

/**
 * Handle bridge messages from content scripts
 */
browser.runtime.onMessage.addListener((message: any, sender, sendResponse) => {
  // Check if this is a bridge message
  if (message?.type !== BRIDGE_MESSAGE_TYPE) {
    return false; // Not a bridge message, let other handlers process it
  }

  const bridgeMessage = message as BridgeMessage;

  // Handle the message asynchronously
  handleBridgeMessage(bridgeMessage)
    .then((data) => {
      const response: BridgeResponse = {
        success: true,
        data,
      };
      sendResponse(response);
    })
    .catch((error) => {
      const response: BridgeResponse = {
        success: false,
        error: {
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        },
      };
      sendResponse(response);
    });

  // Return true to indicate we will send a response asynchronously
  return true;
});

/**
 * Route bridge messages to appropriate handlers using the registry
 */
async function handleBridgeMessage(message: BridgeMessage): Promise<any> {
  const { name } = message;

  // Look up the handler for this method
  const handlerInfo = registry.getHandler(name);

  if (!handlerInfo) {
    const namespace = name.split('.')[0];
    throw new Error(
      `No handler registered for namespace '${namespace}'. Available: ${registry.getNamespaces().join(', ')}`
    );
  }

  // Delegate to the appropriate handler
  return handlerInfo.handler.handle(message);
}

export default defineBackground(() => {
  console.log('Background script loaded');
  console.log(`Bridge handlers ready: ${registry.getNamespaces().join(', ')}`);
});
