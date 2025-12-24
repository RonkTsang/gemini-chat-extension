/**
 * React hooks for EventBus integration
 * Provides efficient, type-safe event communication in React components
 */
import { useEffect, useRef, useCallback, useMemo, useState } from 'react';
import { EventCallback, EventMap, eventBus } from '../utils/eventbus';
import { AppEvents } from '@/common/event';;

/**
 * Hook to subscribe to an event with automatic cleanup
 * @param event - The event name to listen to
 * @param callback - The callback function to execute when the event is emitted
 * @param eventBus - Optional custom event bus instance (uses global by default)
 * @param deps - Dependency array for the callback (similar to useEffect)
 */
export function useEvent<K extends keyof AppEvents>(
  event: K,
  callback: EventCallback<AppEvents[K]>,
  deps: React.DependencyList = []
): void {
  const bus = eventBus;
  const callbackRef = useRef(callback);
  
  // Update callback ref when callback changes
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);
  
  // Create stable callback that uses the ref
  const stableCallback = useCallback((data: AppEvents[K]) => {
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
export function useEventEmitter() {
  const bus = eventBus;
  
  const emit = useCallback(<K extends keyof AppEvents>(
    event: K,
    data: AppEvents[K]
  ) => {
    return bus.emit(event, data);
  }, [bus]);
  
  const emitSync = useCallback(<K extends keyof AppEvents>(
    event: K,
    data: AppEvents[K]
  ) => {
    return bus.emitSync(event, data);
  }, [bus]);
  
  return { emit, emitSync };
}
