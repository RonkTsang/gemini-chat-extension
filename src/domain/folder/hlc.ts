/** A lexicographically comparable Hybrid Logical Clock stamp. */
export class HybridLogicalClock {
  private lastMillis = 0
  private counter = 0

  constructor(private readonly deviceId: string) {}
  getDeviceId(): string { return this.deviceId }

  observe(stamp: string): void {
    const [millis, counter] = stamp.split(':').map(Number)
    if (!Number.isFinite(millis) || !Number.isFinite(counter)) return
    if (millis > this.lastMillis) { this.lastMillis = millis; this.counter = counter }
    else if (millis === this.lastMillis) this.counter = Math.max(this.counter, counter)
  }

  next(now = Date.now()): string {
    if (now > this.lastMillis) { this.lastMillis = now; this.counter = 0 } else { this.counter += 1 }
    return `${String(this.lastMillis).padStart(13, '0')}:${String(this.counter).padStart(6, '0')}:${this.deviceId}`
  }
}

export function compareVersionStamp(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0 }
