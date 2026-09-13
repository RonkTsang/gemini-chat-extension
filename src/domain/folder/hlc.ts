/** A lexicographically comparable Hybrid Logical Clock stamp. */
export class HybridLogicalClock {
  private lastMillis = 0
  private counter = 0

  constructor(private readonly deviceId: string) {}
  getDeviceId(): string { return this.deviceId }

  next(now = Date.now()): string {
    if (now > this.lastMillis) { this.lastMillis = now; this.counter = 0 } else { this.counter += 1 }
    return `${String(this.lastMillis).padStart(13, '0')}:${String(this.counter).padStart(6, '0')}:${this.deviceId}`
  }
}

export function compareVersionStamp(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0 }
