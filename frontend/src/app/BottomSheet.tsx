import { type ReactNode, useRef } from 'react'
import { cn } from '@/lib/cn'
import { type SheetSnap, useUi } from '@/store/ui'

const SNAP_VH: Record<SheetSnap, number> = { peek: 22, half: 52, full: 92 }
const ORDER: SheetSnap[] = ['peek', 'half', 'full']

/** Mobile bottom sheet with three snap points; drag the handle or tap it to cycle. */
export function BottomSheet({ children }: { children: ReactNode }) {
  const snap = useUi((s) => s.sheet)
  const setSnap = useUi((s) => s.setSheet)
  const drag = useRef<{ y: number; startVh: number; moved: boolean } | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = { y: e.clientY, startVh: SNAP_VH[snap], moved: false }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d || !ref.current) return
    const dvh = ((d.y - e.clientY) / window.innerHeight) * 100
    if (Math.abs(dvh) > 1) d.moved = true
    const vh = Math.min(95, Math.max(12, d.startVh + dvh))
    ref.current.style.height = `${vh}dvh`
    ref.current.style.transition = 'none'
  }
  const onPointerUp = () => {
    const d = drag.current
    drag.current = null
    if (!ref.current || !d) return
    ref.current.style.transition = ''
    const current = Number.parseFloat(ref.current.style.height) || SNAP_VH[snap]
    ref.current.style.height = ''
    if (!d.moved) {
      const i = ORDER.indexOf(snap)
      setSnap(ORDER[(i + 1) % ORDER.length] as SheetSnap)
      return
    }
    const nearest = ORDER.reduce((best, s) => (Math.abs(SNAP_VH[s] - current) < Math.abs(SNAP_VH[best] - current) ? s : best), snap)
    setSnap(nearest)
  }

  return (
    <div
      ref={ref}
      className={cn(
        'absolute inset-x-0 bottom-0 z-20 flex flex-col rounded-t-3xl border-t border-line bg-panel shadow-[0_-10px_40px_rgb(0_0_0/0.35)] transition-[height] duration-300 ease-out',
      )}
      style={{ height: `${SNAP_VH[snap]}dvh` }}
    >
      <button
        type="button"
        aria-label={`Panel ${snap === 'full' ? 'expanded' : snap === 'half' ? 'half open' : 'collapsed'}. Drag or tap to resize`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className="flex h-8 w-full shrink-0 touch-none items-center justify-center"
      >
        <span className="h-1.5 w-12 rounded-full bg-line-strong" />
      </button>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-8 scroll-thin">{children}</div>
    </div>
  )
}

export function sheetHeightVh(snap: SheetSnap): number {
  return SNAP_VH[snap]
}
