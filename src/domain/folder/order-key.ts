const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
const BASE = BigInt(ALPHABET.length)
/** A 32-digit base62 range permits over 190 consecutive midpoint insertions. */
export const ORDER_KEY_WIDTH = 32
export const MAX_ORDER_KEY_LENGTH = ORDER_KEY_WIDTH
const MAX_VALUE = BASE ** BigInt(ORDER_KEY_WIDTH) - 1n

export function compareAscii(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function decode(key: string): bigint {
  if (!/^[0-9A-Za-z]+$/u.test(key) || key.length !== ORDER_KEY_WIDTH) {
    throw new Error('Folder order key requires the current fixed-width protocol')
  }
  return [...key].reduce((value, character) => {
    const digit = ALPHABET.indexOf(character)
    if (digit < 0) throw new Error('Invalid folder order key')
    return value * BASE + BigInt(digit)
  }, 0n)
}

function encode(value: bigint): string {
  if (value <= 0n || value >= MAX_VALUE) throw new Error('Folder order key space exhausted; rebalance required')
  let remaining = value
  let key = ''
  for (let index = 0; index < ORDER_KEY_WIDTH; index += 1) {
    key = ALPHABET[Number(remaining % BASE)] + key
    remaining /= BASE
  }
  return key
}

/** Produces a deterministic fixed-width ASCII key strictly between optional adjacent bounds. */
export function keyBetween(before?: string, after?: string): string {
  const lower = before === undefined ? 0n : decode(before)
  const upper = after === undefined ? MAX_VALUE : decode(after)
  if (lower >= upper) throw new Error('Order key bounds are invalid')
  if (upper - lower <= 1n) throw new Error('Folder order key space exhausted; rebalance required')
  return encode(lower + (upper - lower) / 2n)
}

export function rebalanceOrderKeys(ids: readonly string[]): Map<string, string> {
  if (new Set(ids).size !== ids.length) throw new Error('Cannot rebalance duplicate ids')
  if (ids.length === 0) return new Map()
  const step = MAX_VALUE / BigInt(ids.length + 1)
  const result = new Map<string, string>()
  ids.forEach((id, index) => result.set(id, encode(step * BigInt(index + 1))))
  return result
}
