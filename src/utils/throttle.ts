/**
 * Throttle Utility
 * Limits the rate at which a function can be called
 */

/**
 * Creates a throttled function that only invokes the provided function
 * at most once per specified time period
 * 
 * @param func - The function to throttle
 * @param delayMs - The number of milliseconds to throttle invocations to
 * @returns A throttled version of the function
 * 
 * @example
 * const throttled = throttle(() => console.log('called'), 1000)
 * throttled() // executed immediately
 * throttled() // ignored (within 1 second)
 * setTimeout(() => throttled(), 1500) // executed (after 1 second)
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  delayMs: number
): (...args: Parameters<T>) => void {
  let lastCallTime = 0

  return function throttled(...args: Parameters<T>): void {
    const now = Date.now()
    const timeSinceLastCall = now - lastCallTime

    if (timeSinceLastCall >= delayMs) {
      lastCallTime = now
      func(...args)
    }
  }
}

/**
 * Creates a throttled function with context preservation
 * Useful for class methods where 'this' context matters
 * 
 * @param func - The function to throttle
 * @param delayMs - The number of milliseconds to throttle invocations to
 * @returns A throttled version of the function with preserved context
 * 
 * @example
 * class MyClass {
 *   value = 42
 *   throttledMethod = throttleWithContext(() => {
 *     console.log(this.value) // 'this' is preserved
 *   }, 1000)
 * }
 */
export function throttleWithContext<T extends (...args: any[]) => any>(
  func: T,
  delayMs: number
): (...args: Parameters<T>) => void {
  let lastCallTime = 0

  return function throttled(this: any, ...args: Parameters<T>): void {
    const now = Date.now()
    const timeSinceLastCall = now - lastCallTime

    if (timeSinceLastCall >= delayMs) {
      lastCallTime = now
      func.apply(this, args)
    }
  }
}

