import type { BridgeHandler } from '../types';
import { AnalyticsHandler } from './analytics';

/**
 * Get all registered bridge handlers
 * Add new handlers here as the extension grows
 */
export function getAllHandlers(): BridgeHandler[] {
  return [
    new AnalyticsHandler(),
    // Add more handlers here as needed:
    // new StorageHandler(),
    // new NotificationHandler(),
    // new TabsHandler(),
    // etc.
  ];
}

// Export individual handlers for direct use if needed
export { AnalyticsHandler };

