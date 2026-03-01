const storageState = new Map<string, unknown>()

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
      },
    }
  },
}
