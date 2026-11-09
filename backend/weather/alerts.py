"""Active NWS alerts along planned routes (informational; never changes risk levels)."""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Sequence
from dataclasses import dataclass, field
from typing import Any

from django.conf import settings

from core.errors import UpstreamError
from core.http import get_json
from core.redis import get_json_value, set_json_value

logger = logging.getLogger(__name__)

URL = "https://api.weather.gov/alerts/active"
ALERT_CELL_DEG = 0.25
TTL_S = 180
SEVERITIES = ("Extreme", "Severe", "Moderate")
_CONCURRENCY = 8


def alert_cell(lat: float, lon: float) -> tuple[float, float]:
    return (
        round(round(lat / ALERT_CELL_DEG) * ALERT_CELL_DEG, 2),
        round(round(lon / ALERT_CELL_DEG) * ALERT_CELL_DEG, 2),
    )


@dataclass
class RouteAlert:
    id: str
    event: str
    severity: str
    headline: str
    description: str
    instruction: str
    onset: str | None
    ends: str | None
    area: str
    hits: dict[str, list[int]] = field(default_factory=dict)  # route id -> checkpoint indexes

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "event": self.event,
            "severity": self.severity,
            "headline": self.headline,
            "description": self.description,
            "instruction": self.instruction,
            "onset": self.onset,
            "ends": self.ends,
            "area": self.area,
            "hits": self.hits,
        }


async def _alerts_at(cell: tuple[float, float], sem: asyncio.Semaphore) -> list[dict[str, Any]]:
    key = f"alerts:{cell[0]}:{cell[1]}"
    cached = await get_json_value(key)
    if cached is not None:
        return list(cached)
    async with sem:
        data = await get_json(
            URL,
            params={"point": f"{cell[0]:.4f},{cell[1]:.4f}", "status": "actual"},
            headers={"User-Agent": settings.NWS_USER_AGENT, "Accept": "application/geo+json"},
            service="nws",
            attempts=2,
        )
    features = [f["properties"] for f in data.get("features", [])]
    slim = [
        {
            "id": p["id"],
            "event": p.get("event", ""),
            "severity": p.get("severity", "Unknown"),
            "headline": p.get("headline") or p.get("event", ""),
            "description": (p.get("description") or "")[:1200],
            "instruction": (p.get("instruction") or "")[:600],
            "onset": p.get("onset") or p.get("effective"),
            "ends": p.get("ends") or p.get("expires"),
            "area": p.get("areaDesc", ""),
        }
        for p in features
        if p.get("severity") in SEVERITIES
    ]
    await set_json_value(key, slim, TTL_S)
    return slim


async def alerts_for_routes(
    routes: Sequence[tuple[str, Sequence[tuple[float, float]]]],
) -> tuple[list[RouteAlert], bool]:
    """routes: (route_id, checkpoint coordinates). Returns (alerts, partial)."""
    cell_hits: dict[tuple[float, float], list[tuple[str, int]]] = {}
    for route_id, coords in routes:
        for idx, (lat, lon) in enumerate(coords):
            cell_hits.setdefault(alert_cell(lat, lon), []).append((route_id, idx))

    sem = asyncio.Semaphore(_CONCURRENCY)
    cells = list(cell_hits)
    results = await asyncio.gather(*(_alerts_at(c, sem) for c in cells), return_exceptions=True)

    merged: dict[str, RouteAlert] = {}
    partial = False
    for cell, result in zip(cells, results, strict=True):
        if isinstance(result, UpstreamError):
            partial = True
            continue
        if isinstance(result, BaseException):
            raise result
        for raw in result:
            alert = merged.get(raw["id"])
            if alert is None:
                alert = RouteAlert(**raw)
                merged[raw["id"]] = alert
            for route_id, idx in cell_hits[cell]:
                bucket = alert.hits.setdefault(route_id, [])
                if idx not in bucket:
                    bucket.append(idx)
    order = {s: i for i, s in enumerate(SEVERITIES)}
    alerts = sorted(merged.values(), key=lambda a: (order.get(a.severity, 9), a.event))
    for a in alerts:
        for idxs in a.hits.values():
            idxs.sort()
    return alerts, partial
