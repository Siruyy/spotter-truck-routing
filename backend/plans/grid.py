"""Lattice grids for the weather heatmap: the area around a trip, or a viewport bbox."""

from __future__ import annotations

import math
from collections.abc import Iterable, Sequence
from dataclasses import dataclass

from routing.geometry import LatLon

MAX_POINTS = 300
AREA_PAD_DEG = 1.0
SPACINGS_DEG = (0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.8, 1.0, 1.2, 1.5, 2.0, 2.5, 3.0, 4.0)
MAX_VIEWPORT_SPAN_DEG = 40.0


@dataclass(frozen=True)
class Grid:
    spacing: float
    bbox: tuple[float, float, float, float]  # west, south, east, north
    points: tuple[LatLon, ...]  # regular lattice at `spacing`
    # Exact forecast cells along the routes (the checkpoints' own cells), drawn
    # on top of the lattice so the map agrees with the checkpoints near the road.
    fine: tuple[LatLon, ...] = ()


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


def _coarsest_fit(bbox: tuple[float, float, float, float], max_points: int) -> Grid:
    for spacing in SPACINGS_DEG:
        points = _lattice(bbox, spacing)
        if len(points) <= max_points:
            return Grid(spacing, bbox, tuple(points))
    spacing = SPACINGS_DEG[-1]
    return Grid(spacing, bbox, tuple(_lattice(bbox, spacing)[:max_points]))


def area_grid(
    samples: Sequence[LatLon], fine: Sequence[LatLon] = (), max_points: int = MAX_POINTS
) -> Grid:
    """Whole padded area around the routes (no gaps between them), plus exact route cells."""
    if not samples:
        raise ValueError("area grid needs route samples")
    grid = _coarsest_fit(_bbox_of(samples, AREA_PAD_DEG), max_points)
    coarse = set(grid.points)
    extra = tuple(dict.fromkeys(c for c in fine if c not in coarse))
    return Grid(grid.spacing, grid.bbox, grid.points, extra)


def viewport_grid(bbox: tuple[float, float, float, float], max_points: int = MAX_POINTS) -> Grid:
    west, south, east, north = bbox
    if not (-180 <= west < east <= 180 and -90 <= south < north <= 90):
        raise ValueError("invalid bbox")
    if east - west > MAX_VIEWPORT_SPAN_DEG or north - south > MAX_VIEWPORT_SPAN_DEG:
        raise ValueError("bbox too large; zoom in")
    return _coarsest_fit(bbox, max_points)
