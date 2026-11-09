"""Produce up to three distinct truck routes.

TomTom often returns fewer alternatives than requested (Dallas -> Denver gave 2
for maxAlternatives=5), so when fewer than three distinct routes remain we
force alternatives through a via point offset perpendicular to the trip
direction at the primary route's midpoint.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime

from core.errors import UpstreamError
from routing.geometry import (
    METERS_PER_MILE,
    LatLon,
    destination_point,
    haversine_m,
    initial_bearing_deg,
    overlap_fraction,
)
from routing.tomtom import RawRoute, calculate_routes

logger = logging.getLogger(__name__)

TARGET_ROUTES = 3
MAX_SHARED_FRACTION = 0.80
MAX_DURATION_RATIO = 1.5
OFFSET_FACTORS = (0.15, 0.30)
MIN_OFFSET_M = 25 * METERS_PER_MILE
MAX_OFFSET_M = 120 * METERS_PER_MILE


def is_distinct(candidate: RawRoute, kept: list[RawRoute]) -> bool:
    return all(
        overlap_fraction(candidate.polyline, k.polyline) <= MAX_SHARED_FRACTION
        and overlap_fraction(k.polyline, candidate.polyline) <= MAX_SHARED_FRACTION
        for k in kept
    )


def via_points(
    primary: RawRoute, origin: LatLon, destination: LatLon, factor: float
) -> list[LatLon]:
    straight = haversine_m(origin, destination)
    offset = min(max(factor * straight, MIN_OFFSET_M), MAX_OFFSET_M)
    mid = primary.polyline.point_at(primary.polyline.length_m / 2)
    bearing = initial_bearing_deg(origin, destination)
    return [destination_point(mid, (bearing + side) % 360, offset) for side in (-90, 90)]


async def three_routes(
    origin: LatLon, destination: LatLon, *, depart_at: datetime, load_lb: float
) -> list[RawRoute]:
    candidates = await calculate_routes(origin, destination, depart_at=depart_at, load_lb=load_lb)
    kept: list[RawRoute] = []
    for route in candidates:
        if len(kept) < TARGET_ROUTES and is_distinct(route, kept):
            kept.append(route)

    primary = kept[0]
    for factor in OFFSET_FACTORS:
        if len(kept) >= TARGET_ROUTES:
            break
        vias = via_points(primary, origin, destination, factor)
        results = await asyncio.gather(
            *(
                calculate_routes(origin, destination, depart_at=depart_at, load_lb=load_lb, via=v)
                for v in vias
            ),
            return_exceptions=True,
        )
        for result in results:
            if isinstance(result, UpstreamError):
                logger.info("forced alternative failed: %s", result.code)
                continue
            if isinstance(result, BaseException):
                raise result
            for route in result:
                if (
                    len(kept) < TARGET_ROUTES
                    and route.duration_s <= primary.duration_s * MAX_DURATION_RATIO
                    and is_distinct(route, kept)
                ):
                    kept.append(route)

    return sorted(kept, key=lambda r: r.duration_s)
