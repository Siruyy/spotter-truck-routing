"""Lattice grids for the weather heatmap: corridor around routes or a viewport bbox."""

from __future__ import annotations

import math
from collections.abc import Iterable, Sequence
from dataclasses import dataclass

from routing.geometry import METERS_PER_MILE, LatLon, haversine_m

MAX_POINTS = 300
CORRIDOR_RADIUS_MI = 60
BBOX_PAD_DEG = 0.5
SPACINGS_DEG = (0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.8, 1.0, 1.2, 1.5, 2.0, 2.5, 3.0)
MAX_VIEWPORT_SPAN_DEG = 40.0


@dataclass(frozen=True)
class Grid:
    spacing: float
    bbox: tuple[float, float, float, float]  # west, south, east, north
    points: tuple[LatLon, ...]


def _lattice(bbox: tuple[float, float, float, float], spacing: float) -> list[LatLon]:
    west, south, east, north = bbox
    i0, i1 = math.ceil(south / spacing), math.floor(north / spacing)
    j0, j1 = math.ceil(west / spacing), math.floor(east / spacing)
    return [
        (round(i * spacing, 1), round(j * spacing, 1))
        for i in range(i0, i1 + 1)
        for j in range(j0, j1 + 1)
    ]


def _bbox_of(points: Iterable[LatLon], pad: float) -> tuple[float, float, float, float]:
    lats, lons = zip(*points, strict=True)
    return (min(lons) - pad, min(lats) - pad, max(lons) + pad, max(lats) + pad)


def corridor_grid(samples: Sequence[LatLon], max_points: int = MAX_POINTS) -> Grid:
    """Lattice points within CORRIDOR_RADIUS_MI of any route sample point."""
    if not samples:
        raise ValueError("corridor needs route samples")
    bbox = _bbox_of(samples, BBOX_PAD_DEG)
    radius_m = CORRIDOR_RADIUS_MI * METERS_PER_MILE
    buckets: dict[tuple[int, int], list[LatLon]] = {}
    for s in samples:
        buckets.setdefault((math.floor(s[0]), math.floor(s[1])), []).append(s)

    def near(p: LatLon) -> bool:
        ci, cj = math.floor(p[0]), math.floor(p[1])
        for di in (-1, 0, 1):
            for dj in (-2, -1, 0, 1, 2):
                for s in buckets.get((ci + di, cj + dj), ()):
                    if haversine_m(p, s) <= radius_m:
                        return True
        return False

    for spacing in SPACINGS_DEG:
        candidates = _lattice(bbox, spacing)
        # Cheap pre-check: skip spacings whose bbox lattice is hopelessly dense.
        if len(candidates) > max_points * 40:
            continue
        kept = [p for p in candidates if near(p)]
        if len(kept) <= max_points:
            return Grid(spacing, bbox, tuple(kept))
    spacing = SPACINGS_DEG[-1]
    return Grid(spacing, bbox, tuple(p for p in _lattice(bbox, spacing) if near(p))[:max_points])


def viewport_grid(bbox: tuple[float, float, float, float], max_points: int = MAX_POINTS) -> Grid:
    west, south, east, north = bbox
    if not (-180 <= west < east <= 180 and -90 <= south < north <= 90):
        raise ValueError("invalid bbox")
    if east - west > MAX_VIEWPORT_SPAN_DEG or north - south > MAX_VIEWPORT_SPAN_DEG:
        raise ValueError("bbox too large; zoom in")
    for spacing in SPACINGS_DEG:
        points = _lattice(bbox, spacing)
        if len(points) <= max_points:
            return Grid(spacing, bbox, tuple(points))
    spacing = SPACINGS_DEG[-1]
    return Grid(spacing, bbox, tuple(_lattice(bbox, spacing)[:max_points]))
