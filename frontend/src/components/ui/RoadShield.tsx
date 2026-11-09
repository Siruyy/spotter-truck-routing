/**
 * Compact highway marker for route names: interstates get the blue/red shield
 * shape, US and state routes a plain white plate. Purely decorative; the text
 * is the accessible name.
 */
export function RoadShield({ road }: { road: string }) {
  const m = /^(I|US|SR|[A-Z]{2})-?(\d+[A-Z]?)/.exec(road)
  const kind = m?.[1] ?? ''
  const num = m?.[2] ?? road
  if (kind === 'I') {
    return (
      <span className="relative inline-grid h-[22px] min-w-[22px] place-items-center px-1" title={road}>
        <svg viewBox="0 0 24 24" className="absolute inset-0 h-full w-full" aria-hidden="true" preserveAspectRatio="none">
          <path d="M3 2h18c.6 2.4.6 9-1.2 13.5C18.4 19.3 15 21.3 12 22.5 9 21.3 5.6 19.3 4.2 15.5 2.4 11 2.4 4.4 3 2z" fill="#1d4f91" stroke="#fff" strokeWidth="1.2" />
          <path d="M3 2h18c.15.9.25 2.1.3 3.4H2.7C2.75 4.1 2.85 2.9 3 2z" fill="#c8102e" />
        </svg>
        <span className="relative pt-[3px] font-display text-[11px] font-bold leading-none text-white">{num}</span>
      </span>
    )
  }
  return (
    <span
      className="inline-grid h-[22px] min-w-[22px] place-items-center rounded-[5px] border border-black/70 bg-white px-1 font-display text-[11px] font-bold leading-none text-black"
      title={road}
    >
      {num}
    </span>
  )
}

/** "I-35E & US-287 (alt)" -> shields plus any suffix. */
export function RouteName({ name }: { name: string }) {
  if (!name) return <span className="text-muted">Unnamed roads</span>
  const alt = name.endsWith('(alt)')
  const roads = name.replace(' (alt)', '').split(' & ')
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5" aria-label={`via ${name}`}>
      <span className="text-sm text-muted">via</span>
      {roads.map((r) => (
        <RoadShield key={r} road={r} />
      ))}
      {alt && <span className="text-xs text-faint">alt</span>}
    </span>
  )
}
