import { compareAscii } from './order-key'

export interface MembershipOrder {
  id: string
  orderKey: string
  pinnedOrderKey?: string
}

/** Pinning has its own order so unpinning preserves the ordinary position. */
export function compareMembershipOrder(left: MembershipOrder, right: MembershipOrder): number {
  const group = Number(Boolean(right.pinnedOrderKey)) - Number(Boolean(left.pinnedOrderKey))
  return group
    || compareAscii(left.pinnedOrderKey ?? left.orderKey, right.pinnedOrderKey ?? right.orderKey)
    || compareAscii(left.id, right.id)
}
