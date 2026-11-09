"""TomTom Routing API (truck mode) adapter."""

from __future__ import annotations

import re
from collections import defaultdict
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from django.conf import settings

from core.errors import NoRouteFound, UpstreamError
from core.http import get_json
from core.quota import count_tomtom_call
from routing.geometry import LatLon, Polyline, TimeProfile

BASE_URL = "https://api.tomtom.com/routing/1/calculateRoute"
LB_TO_KG = 0.45359237
_DIRECTION_SUFFIX = re.compile(r"\s+[NSEW]$")


@dataclass(frozen=True)
class RawRoute:
    polyline: Polyline
    time_profile: TimeProfile
    length_m: float
    duration_s: float
    traffic_delay_s: float
    roads: tuple[tuple[str, float], ...]  # (road number, metres) in travel order

    @property
    def road_names(self) -> tuple[str, ...]:
        """The two roads carrying the most distance, in travel order."""
        top = sorted(self.roads, key=lambda r: r[1], reverse=True)[:2]
        return tuple(name for name, _ in self.roads if (name, _) in top)


def gross_weight_kg(load_lb: float) -> int:
    return round((load_lb + settings.TARE_LB) * LB_TO_KG)


def _fmt_point(p: LatLon) -> str:
    return f"{p[0]:.6f},{p[1]:.6f}"


def _roads(
    instructions: Sequence[dict[str, Any]], length_m: float
) -> tuple[tuple[str, float], ...]:
    """Distance driven on each numbered road, in order of first use."""
    distance: dict[str, float] = defaultdict(float)
    for i, ins in enumerate(instructions):
        roads = ins.get("roadNumbers") or []
        if not roads:
            continue
        nxt = instructions[i + 1]["routeOffsetInMeters"] if i + 1 < len(instructions) else length_m
        name = _DIRECTION_SUFFIX.sub("", roads[0])
        distance[name] += max(0.0, nxt - ins["routeOffsetInMeters"])
    return tuple((name, round(m)) for name, m in distance.items())


def parse_route(route: dict[str, Any]) -> RawRoute:
    summary = route["summary"]
    points = tuple((p["latitude"], p["longitude"]) for leg in route["legs"] for p in leg["points"])
    length_m = float(summary["lengthInMeters"])
    duration_s = float(summary["travelTimeInSeconds"])
    instructions = route.get("guidance", {}).get("instructions", [])

    # Knots from guidance, scaled onto our haversine length so time lookups
    # by polyline distance stay consistent with TomTom's own metres.
    poly = Polyline(points)
    scale = poly.length_m / length_m if length_m else 1.0
    offsets: list[float] = [0.0]
    seconds: list[float] = [0.0]
    for ins in instructions:
        off = float(ins["routeOffsetInMeters"]) * scale
        sec = float(ins["travelTimeInSeconds"])
        if off > offsets[-1] and sec >= seconds[-1]:
            offsets.append(off)
            seconds.append(sec)
    if offsets[-1] < poly.length_m:
        offsets.append(poly.length_m)
        seconds.append(max(duration_s, seconds[-1]))

    return RawRoute(
        polyline=poly,
        time_profile=TimeProfile(tuple(offsets), tuple(seconds)),
        length_m=length_m,
        duration_s=duration_s,
        traffic_delay_s=float(summary.get("trafficDelayInSeconds", 0)),
        roads=_roads(instructions, length_m),
    )


async def calculate_routes(
    origin: LatLon,
    destination: LatLon,
    *,
    depart_at: datetime,
    load_lb: float,
    via: LatLon | None = None,
    max_alternatives: int = 5,
) -> list[RawRoute]:
    locations = [origin, *([via] if via else []), destination]
    path = ":".join(_fmt_point(p) for p in locations)
    params: dict[str, Any] = {
        "key": settings.TOMTOM_API_KEY,
        "travelMode": "truck",
        "vehicleCommercial": "true",
        "vehicleWeight": gross_weight_kg(load_lb),
        "traffic": "true",
        "departAt": depart_at.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "routeType": "fastest",
        "instructionsType": "coded",
        "routeRepresentation": "polyline",
    }
    if via is None:
        params["maxAlternatives"] = max_alternatives
    await count_tomtom_call()
    try:
        data = await get_json(f"{BASE_URL}/{path}/json", params=params, service="tomtom")
    except UpstreamError as exc:
        if exc.code == "tomtom_400" and via is None:
            raise NoRouteFound(
                "No truck route found between these places. Try a nearby address on a main road."
            ) from exc
        raise
    routes = data.get("routes") or []
    if not routes and via is None:
        raise NoRouteFound("No truck route found between these places.")
    return [parse_route(r) for r in routes]
