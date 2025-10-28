/**
 * EventBus - A lightweight, type-safe event system for efficient communication
 * Supports both synchronous and asynchronous event handling
 */
import { nanoid } from 'nanoid';
export type EventCallback<T = any> = (data: T) => void | Promise<void>;
export type EventMap = Record<string, any>;

export interface EventBusOptions {
  maxListeners?: number;
  enableAsync?: boolean;
}

export class EventBus<TEventMap extends EventMap = EventMap> {
  private listeners: Map<keyof TEventMap, Set<EventCallback>> = new Map();
  private onceListeners: Map<keyof TEventMap, Set<EventCallback>> = new Map();
  private options: Required<EventBusOptions>;
  public id: string;

  constructor(options: EventBusOptions = {}) {
    this.options = {
      maxListeners: 10,
      enableAsync: true,
      ...options,
    };
    this.id = nanoid();
  }

  /**
   * Subscribe to an event
   */
  on<K extends keyof TEventMap>(
    event: K,
    callback: EventCallback<TEventMap[K]>
  ): () => void {
    this.validateListenerCount(event);
    
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    
    this.listeners.get(event)!.add(callback);
    
    // Return unsubscribe function
    return () => this.off(event, callback);
  }

  /**
   * Subscribe to an event that will only fire once
   */
  once<K extends keyof TEventMap>(
    event: K,
    callback: EventCallback<TEventMap[K]>
  ): () => void {
    this.validateListenerCount(event);
    
    if (!this.onceListeners.has(event)) {
      this.onceListeners.set(event, new Set());
    }
    
    this.onceListeners.get(event)!.add(callback);
    
    // Return unsubscribe function
    return () => this.off(event, callback);
  }

  /**
   * Unsubscribe from an event
   */
  off<K extends keyof TEventMap>(
    event: K,
    callback: EventCallback<TEventMap[K]>
  ): void {
    this.listeners.get(event)?.delete(callback);
    this.onceListeners.get(event)?.delete(callback);
  }

  /**
   * Emit an event
   */
  async emit<K extends keyof TEventMap>(
    event: K,
    data: TEventMap[K]
  ): Promise<void> {
    const regularCallbacks = this.listeners.get(event);
    const onceCallbacks = this.onceListeners.get(event);

    if (!regularCallbacks && !onceCallbacks) {
      return;
    }

    const allCallbacks = [
      ...(regularCallbacks || []),
      ...(onceCallbacks || [])
    ];

    // Clear once listeners
    if (onceCallbacks) {
      this.onceListeners.delete(event);
    }

    if (this.options.enableAsync) {
      // Execute all callbacks in parallel
      await Promise.all(
        allCallbacks.map(callback => 
          Promise.resolve(callback(data)).catch(error => {
            console.error(`EventBus error in event "${String(event)}":`, error);
          })
        )
      );
    } else {
      // Execute callbacks synchronously
      allCallbacks.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`EventBus error in event "${String(event)}":`, error);
        }
      });
    }
  }

  /**
   * Emit an event synchronously
   */
  emitSync<K extends keyof TEventMap>(
    event: K,
    data: TEventMap[K]
  ): void {
    const regularCallbacks = this.listeners.get(event);
    const onceCallbacks = this.onceListeners.get(event);

    if (!regularCallbacks && !onceCallbacks) {
      return;
    }

    const allCallbacks = [
      ...(regularCallbacks || []),
      ...(onceCallbacks || [])
    ];

    // Clear once listeners
    if (onceCallbacks) {
      this.onceListeners.delete(event);
    }

    allCallbacks.forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error(`EventBus error in event "${String(event)}":`, error);
      }
    });
  }

  /**
   * Remove all listeners for a specific event
   */
  removeAllListeners<K extends keyof TEventMap>(event?: K): void {
    if (event) {
      this.listeners.delete(event);
      this.onceListeners.delete(event);
    } else {
      this.listeners.clear();
      this.onceListeners.clear();
    }
  }

  /**
   * Get the number of listeners for an event
   */
  listenerCount<K extends keyof TEventMap>(event: K): number {
    const regularCount = this.listeners.get(event)?.size || 0;
    const onceCount = this.onceListeners.get(event)?.size || 0;
    return regularCount + onceCount;
  }

  /**
   * Get all event names that have listeners
   */
  eventNames(): (keyof TEventMap)[] {
    const regularEvents = Array.from(this.listeners.keys());
    const onceEvents = Array.from(this.onceListeners.keys());
    return Array.from(new Set([...regularEvents, ...onceEvents]));
  }

  /**
   * Check if there are any listeners for an event
   */
  hasListeners<K extends keyof TEventMap>(event: K): boolean {
    return this.listenerCount(event) > 0;
  }

  private validateListenerCount(event: keyof TEventMap): void {
    const currentCount = this.listenerCount(event);
    if (currentCount >= this.options.maxListeners) {
      console.warn(
        `EventBus: Maximum listener count (${this.options.maxListeners}) exceeded for event "${String(event)}"`
      );
    }
  }
}

// Create a default global event bus instance
export const eventBus = new EventBus();

// Utility functions for the global event bus
export const on = eventBus.on.bind(eventBus);
export const once = eventBus.once.bind(eventBus);
export const off = eventBus.off.bind(eventBus);
export const emit = eventBus.emit.bind(eventBus);
export const emitSync = eventBus.emitSync.bind(eventBus);
export const removeAllListeners = eventBus.removeAllListeners.bind(eventBus);
export const listenerCount = eventBus.listenerCount.bind(eventBus);
export const eventNames = eventBus.eventNames.bind(eventBus);
export const hasListeners = eventBus.hasListeners.bind(eventBus);
