import type { SheetSnap } from '@/store/ui'

/** Bottom sheet heights in dynamic viewport units. */
export const SNAP_VH: Record<SheetSnap, number> = { peek: 22, half: 52, full: 92 }

export function sheetHeightVh(snap: SheetSnap): number {
  return SNAP_VH[snap]
}
