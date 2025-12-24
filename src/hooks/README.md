# EventBus React Hooks

A comprehensive, type-safe event system for efficient communication in React applications.

## Features

- 🚀 **High Performance**: Optimized for minimal re-renders and memory usage
- 🔒 **Type Safety**: Full TypeScript support with generic event types
- ⚡ **Async Support**: Built-in support for both sync and async event handling
- 🧹 **Auto Cleanup**: Automatic listener cleanup on component unmount
- 🎯 **Flexible**: Support for global and custom event bus instances
- 📦 **Lightweight**: Minimal bundle size with zero external dependencies

## Quick Start

```tsx
import { useEvent, useEventEmitter } from './hooks';

// Define your event types
interface AppEvents {
  'user:login': { userId: string; username: string };
  'notification:show': { message: string; type: 'success' | 'error' };
}

function MyComponent() {
  const { emit } = useEventEmitter<AppEvents>();
  
  // Listen to events
  useEvent('user:login', (data) => {
    console.log(`Welcome, ${data.username}!`);
  });
  
  // Emit events
  const handleLogin = () => {
    emit('user:login', { userId: '123', username: 'john_doe' });
  };
  
  return <button onClick={handleLogin}>Login</button>;
}
```

## API Reference

### Hooks

#### `useEvent(event, callback, eventBus?, deps?)`
Subscribe to an event with automatic cleanup.

```tsx
useEvent('data:updated', (data) => {
  console.log('Data updated:', data);
});
```

#### `useEventOnce(event, callback, eventBus?, deps?)`
Subscribe to an event that fires only once.

```tsx
useEventOnce('app:initialized', () => {
  console.log('App initialized!');
});
```

#### `useEventEmitter(eventBus?)`
Get functions to emit events.

```tsx
const { emit, emitSync } = useEventEmitter<AppEvents>();

// Async emit
await emit('data:updated', { data: newData });

// Sync emit
emitSync('ui:clicked', { element: 'button' });
```

#### `useEventInfo(event, eventBus?)`
Get information about event listeners.

```tsx
const { listenerCount, hasListeners } = useEventInfo('data:updated');
```

#### `useCustomEventBus(options?)`
Create a custom event bus instance.

```tsx
const customBus = useCustomEventBus<AppEvents>({
  maxListeners: 10,
  enableAsync: true
});
```

#### `useEventSubscriptions(subscriptions, eventBus?)`
Subscribe to multiple events at once.

```tsx
useEventSubscriptions([
  { event: 'user:login', callback: handleLogin },
  { event: 'user:logout', callback: handleLogout },
  { event: 'data:updated', callback: handleDataUpdate }
]);
```

### Core EventBus Class

#### `EventBus<TEventMap>(options?)`
Create a new event bus instance.

```tsx
const eventBus = new EventBus<AppEvents>({
  maxListeners: 10,
  enableAsync: true
});
```

#### Methods

- `on(event, callback)` - Subscribe to an event
- `once(event, callback)` - Subscribe to an event once
- `off(event, callback)` - Unsubscribe from an event
- `emit(event, data)` - Emit an event (async)
- `emitSync(event, data)` - Emit an event (sync)
- `removeAllListeners(event?)` - Remove all listeners
- `listenerCount(event)` - Get listener count
- `hasListeners(event)` - Check if event has listeners

## Advanced Patterns

### Shared Event Bus Between Components

```tsx
// Create a shared event bus
const sharedEventBus = useMemo(() => new EventBus<AppEvents>(), []);

// Component A
function ComponentA() {
  const { emit } = useEventEmitter<AppEvents>(sharedEventBus);
  return <button onClick={() => emit('data:shared', { value: 42 })}>Send</button>;
}

// Component B
function ComponentB() {
  useEvent('data:shared', (data) => {
    console.log('Received:', data.value);
  }, sharedEventBus);
  return <div>Listening...</div>;
}
```

### Event Bus with Context

```tsx
const EventBusContext = createContext<EventBus<AppEvents>>();

function EventBusProvider({ children }) {
  const eventBus = useCustomEventBus<AppEvents>();
  return (
    <EventBusContext.Provider value={eventBus}>
      {children}
    </EventBusContext.Provider>
  );
}

function useEventBusContext() {
  const eventBus = useContext(EventBusContext);
  if (!eventBus) throw new Error('EventBusProvider required');
  return eventBus;
}
```

## Performance Tips

1. **Use stable callbacks**: Wrap callbacks in `useCallback` when they depend on props/state
2. **Minimize re-subscriptions**: Use dependency arrays carefully in `useEvent`
3. **Prefer specific events**: Use specific event names instead of generic ones
4. **Clean up properly**: The hooks handle cleanup automatically, but be mindful of custom event buses

## TypeScript Support

The EventBus system is fully typed. Define your event types for better development experience:

```tsx
interface MyAppEvents {
  'user:login': { userId: string; username: string };
  'user:logout': { userId: string };
  'data:updated': { data: any; timestamp: number };
  'ui:theme:changed': { theme: 'light' | 'dark' };
}

// All hooks will be type-safe
useEvent('user:login', (data) => {
  // data is typed as { userId: string; username: string }
});
```

## Examples

See `useEventBus.example.tsx` for comprehensive usage examples including:
- Basic event listening and emitting
- One-time event handling
- Event monitoring and debugging
- Custom event bus instances
- Multiple event subscriptions
- Advanced component communication patterns
