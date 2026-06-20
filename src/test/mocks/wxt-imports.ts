const storageState = new Map<string, unknown>()
const storageWatchers = new Map<string, Set<(value: unknown) => void>>()

export const storage = {
  defineItem<T>(key: string, options: { fallback: T }) {
    return {
      async getValue(): Promise<T> {
        if (storageState.has(key)) {
          return storageState.get(key) as T
        }
        return options.fallback
      },
      async setValue(value: T): Promise<void> {
        storageState.set(key, value)
        storageWatchers.get(key)?.forEach((callback) => callback(value))
      },
      watch(callback: (value: T) => void): () => void {
        const watchers = storageWatchers.get(key) ?? new Set<(value: unknown) => void>()
        const wrappedCallback = callback as (value: unknown) => void
        watchers.add(wrappedCallback)
        storageWatchers.set(key, watchers)

        return () => {
          watchers.delete(wrappedCallback)
        }
      },
    }
  },
}
