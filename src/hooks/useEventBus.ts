/**
 * React hooks for EventBus integration
 * Provides efficient, type-safe event communication in React components
 */
import { useEffect, useRef, useCallback, useMemo, useState } from 'react';
import { EventBus, EventCallback, EventMap, eventBus } from '../utils/eventbus';

// Global EventBus instance - shared across all components
const globalEventBusInstance = eventBus;

/**
 * Hook to get access to the global event bus or create a new instance
 * @param options - If provided, creates a new instance instead of using global
 */
export function useEventBus<TEventMap extends EventMap = EventMap>(
  options?: { maxListeners?: number; enableAsync?: boolean }
): EventBus<TEventMap> {
  // If options are provided, create a new instance (for custom use cases)
  const customEventBusRef = useRef<EventBus<TEventMap> | undefined>(undefined);
  
  if (options) {
    if (!customEventBusRef.current) {
      customEventBusRef.current = new EventBus<TEventMap>(options);
    }
    return customEventBusRef.current;
  }
  
  // Otherwise, return the global instance
  return globalEventBusInstance as EventBus<TEventMap>;
}

/**
 * Hook to subscribe to an event with automatic cleanup
 * @param event - The event name to listen to
 * @param callback - The callback function to execute when the event is emitted
 * @param eventBus - Optional custom event bus instance (uses global by default)
 * @param deps - Dependency array for the callback (similar to useEffect)
 */
export function useEvent<K extends keyof TEventMap, TEventMap extends EventMap = EventMap>(
  event: K,
  callback: EventCallback<TEventMap[K]>,
  eventBus?: EventBus<TEventMap>,
  deps: React.DependencyList = []
): void {
  const bus = eventBus || (globalEventBusInstance as EventBus<TEventMap>);
  const callbackRef = useRef(callback);
  
  // Update callback ref when callback changes
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);
  
  // Create stable callback that uses the ref
  const stableCallback = useCallback((data: TEventMap[K]) => {
    callbackRef.current(data);
  }, []);
  
  useEffect(() => {
    const unsubscribe = bus.on(event, stableCallback);
    return unsubscribe;
  }, [event, bus, stableCallback, ...deps]);
}

/**
 * Hook to emit events from a component
 * @param eventBus - Optional custom event bus instance (uses global by default)
 */
export function useEventEmitter<TEventMap extends EventMap = EventMap>(
  eventBus?: EventBus<TEventMap>
) {
  const bus = eventBus || (globalEventBusInstance as EventBus<TEventMap>);
  
  const emit = useCallback(<K extends keyof TEventMap>(
    event: K,
    data: TEventMap[K]
  ) => {
    return bus.emit(event, data);
  }, [bus]);
  
  const emitSync = useCallback(<K extends keyof TEventMap>(
    event: K,
    data: TEventMap[K]
  ) => {
    return bus.emitSync(event, data);
  }, [bus]);
  
  return { emit, emitSync };
}


/**
 * Hook for managing multiple event subscriptions with automatic cleanup
 * @param subscriptions - Array of event subscriptions
 * @param eventBus - Optional custom event bus instance (uses global by default)
 */
export function useEventSubscriptions<TEventMap extends EventMap = EventMap>(
  subscriptions: Array<{
    event: keyof TEventMap;
    callback: EventCallback<TEventMap[keyof TEventMap]>;
    once?: boolean;
  }>,
  eventBus?: EventBus<TEventMap>
) {
  const bus = eventBus || (globalEventBusInstance as EventBus<TEventMap>);
  
  useEffect(() => {
    const unsubscribers = subscriptions.map(({ event, callback, once = false }) => {
      return once ? bus.once(event, callback) : bus.on(event, callback);
    });
    
    return () => {
      unsubscribers.forEach(unsubscribe => unsubscribe());
    };
  }, [bus, subscriptions]);
}
