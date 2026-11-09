"""Human-readable route names ("via I-35 & US-287") that tell alternatives apart."""

from __future__ import annotations

from collections.abc import Sequence

from routing.geometry import METERS_PER_MILE

MIN_DISTINCT_M = 20 * METERS_PER_MILE

Roads = Sequence[tuple[str, float]]


def _top_two(roads: Roads, score: dict[str, float]) -> list[str]:
    chosen = sorted(score, key=lambda r: score[r], reverse=True)[:2]
    return [name for name, _ in roads if name in chosen]


def route_names(routes: Sequence[Roads]) -> list[str]:
    """Prefer roads a route uses much more than any other route does."""
    totals = [dict(r) for r in routes]
    names: list[str] = []
    for i, roads in enumerate(routes):
        own = totals[i]
        others = [t for j, t in enumerate(totals) if j != i]
        distinct = {
            name: m - max((t.get(name, 0.0) for t in others), default=0.0)
            for name, m in own.items()
        }
        distinct = {n: d for n, d in distinct.items() if d >= MIN_DISTINCT_M}
        picked = _top_two(roads, distinct) or _top_two(roads, own)
        names.append(" & ".join(picked))
    seen: dict[str, int] = {}
    for i, name in enumerate(names):
        if name in seen:
            names[i] = f"{name} (alt)" if name else ""
        seen.setdefault(name, i)
    return names
