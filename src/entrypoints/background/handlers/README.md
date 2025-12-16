# Background Bridge Handlers

This directory contains all bridge handlers for the background script. Each handler processes a specific namespace of bridge method calls from content scripts.

## Architecture

- **`types.ts`**: Core handler interface and registry
- **`handlers/`**: Individual handler implementations
  - `analytics.ts`: Google Analytics events
  - Add more handlers as needed

## Adding a New Handler

### 1. Create a Handler File

Create a new file in this directory (e.g., `storage.ts`):

```typescript
import type { BridgeMessage } from '@/utils/bridge/msg';
import type { BridgeHandler } from '../types';

/**
 * Storage bridge handler
 * Handles all storage.* method calls
 */
export class StorageHandler implements BridgeHandler {
  namespace = 'storage';

  async handle(message: BridgeMessage): Promise<any> {
    const { name, params } = message;
    const method = name.split('.').slice(1).join('.');

    switch (method) {
      case 'get':
        return this.get(params);

      case 'set':
        return this.set(params);

      default:
        throw new Error(`Unknown storage method: ${method}`);
    }
  }

  private async get(params: any): Promise<any> {
    // Implementation
  }

  private async set(params: any): Promise<void> {
    // Implementation
  }
}
```

### 2. Define Types in Bridge

Update `src/utils/bridge/msg.ts` to add your methods to `BridgeMethodMap`:

```typescript
export interface BridgeMethodMap {
  // Existing methods...
  'storage.get': (params: { key: string }) => Promise<any>;
  'storage.set': (params: { key: string; value: any }) => Promise<void>;
}
```

### 3. Register the Handler

Update `handlers/index.ts`:

```typescript
import { StorageHandler } from './storage';

export function getAllHandlers(): BridgeHandler[] {
  return [
    new AnalyticsHandler(),
    new StorageHandler(),
    // Add more here...
  ];
}
```

### 4. Use from Content Script

```typescript
import { call } from '@/utils/bridge';

// Type-safe call
const value = await call('storage.get', { key: 'myKey' });
await call('storage.set', { key: 'myKey', value: 'myValue' });
```

## Best Practices

1. **Single Responsibility**: Each handler manages one domain (analytics, storage, etc.)
2. **Error Handling**: Let errors bubble up; the bridge will serialize them
3. **Type Safety**: Always define method signatures in `BridgeMethodMap`
4. **Private Methods**: Keep implementation details private
5. **Documentation**: Add JSDoc comments for public methods

## Available Handlers

- **analytics**: Google Analytics event tracking
  - `analytics.fireEvent`
  - `analytics.firePageViewEvent`
  - `analytics.fireErrorEvent`

Add your handlers to this list as you create them.

