"""Geodesic helpers: distances, interpolation along a polyline, simplification, overlap."""

from __future__ import annotations

import math
from bisect import bisect_right
from collections.abc import Sequence
from dataclasses import dataclass, field

EARTH_RADIUS_M = 6_371_008.8
METERS_PER_MILE = 1609.344

LatLon = tuple[float, float]


def haversine_m(a: LatLon, b: LatLon) -> float:
    lat1, lon1 = math.radians(a[0]), math.radians(a[1])
    lat2, lon2 = math.radians(b[0]), math.radians(b[1])
    dlat, dlon = lat2 - lat1, lon2 - lon1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * EARTH_RADIUS_M * math.asin(min(1.0, math.sqrt(h)))


def initial_bearing_deg(a: LatLon, b: LatLon) -> float:
    lat1, lat2 = math.radians(a[0]), math.radians(b[0])
    dlon = math.radians(b[1] - a[1])
    x = math.sin(dlon) * math.cos(lat2)
    y = math.cos(lat1) * math.sin(lat2) - math.sin(lat1) * math.cos(lat2) * math.cos(dlon)
    return (math.degrees(math.atan2(x, y)) + 360) % 360


def destination_point(origin: LatLon, bearing_deg: float, distance_m: float) -> LatLon:
    lat1, lon1 = math.radians(origin[0]), math.radians(origin[1])
    brg = math.radians(bearing_deg)
    d = distance_m / EARTH_RADIUS_M
    lat2 = math.asin(math.sin(lat1) * math.cos(d) + math.cos(lat1) * math.sin(d) * math.cos(brg))
    lon2 = lon1 + math.atan2(
        math.sin(brg) * math.sin(d) * math.cos(lat1), math.cos(d) - math.sin(lat1) * math.sin(lat2)
    )
    return (math.degrees(lat2), (math.degrees(lon2) + 540) % 360 - 180)


@dataclass(frozen=True)
class Polyline:
    points: tuple[LatLon, ...]
    cumulative_m: tuple[float, ...] = field(init=False)

    def __post_init__(self) -> None:
        if len(self.points) < 2:
            raise ValueError("a polyline needs at least two points")
        cum = [0.0]
        for prev, cur in zip(self.points, self.points[1:], strict=False):
            cum.append(cum[-1] + haversine_m(prev, cur))
        object.__setattr__(self, "cumulative_m", tuple(cum))

    @property
    def length_m(self) -> float:
        return self.cumulative_m[-1]

    def point_at(self, distance_m: float) -> LatLon:
        d = min(max(distance_m, 0.0), self.length_m)
        i = bisect_right(self.cumulative_m, d) - 1
        if i >= len(self.points) - 1:
            return self.points[-1]
        seg = self.cumulative_m[i + 1] - self.cumulative_m[i]
        t = 0.0 if seg == 0 else (d - self.cumulative_m[i]) / seg
        a, b = self.points[i], self.points[i + 1]
        return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)

    def densified(self, step_m: float) -> list[LatLon]:
        """Points every `step_m` along the line (plus the end point)."""
        n = max(1, math.ceil(self.length_m / step_m))
        return [self.point_at(self.length_m * k / n) for k in range(n)] + [self.points[-1]]


@dataclass(frozen=True)
class TimeProfile:
    """Monotone distance -> elapsed-seconds mapping, linear between knots."""

    offsets_m: tuple[float, ...]
    seconds: tuple[float, ...]

    def __post_init__(self) -> None:
        if len(self.offsets_m) != len(self.seconds) or len(self.offsets_m) < 2:
            raise ValueError("time profile needs >= 2 matching knots")

    def seconds_at(self, distance_m: float) -> float:
        offs, secs = self.offsets_m, self.seconds
        if distance_m <= offs[0]:
            return secs[0]
        if distance_m >= offs[-1]:
            return secs[-1]
        i = bisect_right(offs, distance_m) - 1
        span = offs[i + 1] - offs[i]
        t = 0.0 if span == 0 else (distance_m - offs[i]) / span
        return secs[i] + (secs[i + 1] - secs[i]) * t


def _project(p: LatLon, lat0_cos: float) -> tuple[float, float]:
    return (math.radians(p[1]) * lat0_cos * EARTH_RADIUS_M, math.radians(p[0]) * EARTH_RADIUS_M)


def simplify(points: Sequence[LatLon], tolerance_m: float) -> list[LatLon]:
    """Iterative Douglas-Peucker on an equirectangular projection."""
    n = len(points)
    if n <= 2:
        return list(points)
    lat0_cos = math.cos(math.radians(sum(p[0] for p in points) / n))
    xy = [_project(p, lat0_cos) for p in points]
    keep = [False] * n
    keep[0] = keep[-1] = True
    stack = [(0, n - 1)]
    tol2 = tolerance_m * tolerance_m
    while stack:
        start, end = stack.pop()
        ax, ay = xy[start]
        bx, by = xy[end]
        dx, dy = bx - ax, by - ay
        seg2 = dx * dx + dy * dy
        best_i, best_d2 = -1, tol2
        for i in range(start + 1, end):
            px, py = xy[i]
            if seg2 == 0:
                d2 = (px - ax) ** 2 + (py - ay) ** 2
            else:
                t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / seg2))
                d2 = (px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2
            if d2 > best_d2:
                best_i, best_d2 = i, d2
        if best_i != -1:
            keep[best_i] = True
            stack.append((start, best_i))
            stack.append((best_i, end))
    return [p for p, k in zip(points, keep, strict=True) if k]


_CELL_DEG = 0.004  # ~450 m latitude cells for the overlap spatial hash


def overlap_fraction(a: Polyline, b: Polyline, *, within_m: float = 200.0) -> float:
    """Share of `a`'s length that lies within `within_m` of `b`."""
    cells: dict[tuple[int, int], list[LatLon]] = {}
    for p in b.densified(100.0):
        cells.setdefault((int(p[0] // _CELL_DEG), int(p[1] // _CELL_DEG)), []).append(p)
    samples = a.densified(1000.0)
    hits = 0
    for p in samples:
        cx, cy = int(p[0] // _CELL_DEG), int(p[1] // _CELL_DEG)
        near = (
            q for dx in (-1, 0, 1) for dy in (-1, 0, 1) for q in cells.get((cx + dx, cy + dy), ())
        )
        if any(haversine_m(p, q) <= within_m for q in near):
            hits += 1
    return hits / len(samples)
