"""National Weather Service gridpoint provider (public domain, no key).

Used as the fallback when the Open-Meteo daily budget is spent. NWS gives
precipitation and snowfall as multi-hour totals (often 6 h), which we spread
evenly per hour; the UI labels these as averaged rates.
"""

from __future__ import annotations

import asyncio
import re
import time
from collections import defaultdict
from collections.abc import Sequence
from datetime import datetime
from typing import Any

from django.conf import settings

from core.http import get_json
from core.redis import get_json_value, set_json_value
from weather.models import HOUR_S, Cell, CellForecast

BASE = "https://api.weather.gov"
POINTS_TTL_S = 30 * 24 * 3600
KMH_TO_MPH = 0.621371
MM_TO_IN = 1 / 25.4
M_TO_MI = 1 / 1609.344
_DURATION = re.compile(r"^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$")
_CONCURRENCY = 4


def duration_hours(iso: str) -> int:
    m = _DURATION.match(iso)
    if not m:
        raise ValueError(f"unsupported ISO duration: {iso}")
    days, hours, minutes = (int(g) if g else 0 for g in m.groups())
    return max(1, days * 24 + hours + (1 if minutes else 0))


def expand(series: dict[str, Any], *, spread: bool) -> dict[int, float]:
    """Map 'hour-ending' epoch -> value. `spread` divides totals across hours."""
    out: dict[int, float] = {}
    for entry in series.get("values", []):
        value = entry.get("value")
        if value is None:
            continue
        start_iso, dur = entry["validTime"].split("/")
        start = int(datetime.fromisoformat(start_iso).timestamp())
        n = duration_hours(dur)
        per_hour = value / n if spread else value
        for k in range(n):
            out[start + (k + 1) * HOUR_S] = per_hour
    return out


def parse_grid(props: dict[str, Any], timezone: str, fetched_at: int) -> CellForecast:
    wind = expand(props["windSpeed"], spread=False)
    gust = expand(props.get("windGust", {}), spread=False)
    qpf = expand(props.get("quantitativePrecipitation", {}), spread=True)
    snow = expand(props.get("snowfallAmount", {}), spread=True)
    temp = expand(props.get("temperature", {}), spread=False)
    vis = expand(props.get("visibility", {}), spread=False)
    times = sorted(t for t in wind if t in qpf)

    def conv(series: dict[int, float], factor: float) -> tuple[float | None, ...]:
        return tuple(series[t] * factor if t in series else None for t in times)

    rain_mm = {t: max(0.0, qpf[t] - snow.get(t, 0.0) / 10) for t in qpf}  # ~10:1 snow ratio
    return CellForecast(
        provider="nws",
        fetched_at=fetched_at,
        times=tuple(times),
        wind_mph=conv(wind, KMH_TO_MPH),
        gust_mph=conv(gust, KMH_TO_MPH),
        rain_in_hr=conv(rain_mm, MM_TO_IN),
        snow_in_hr=conv(snow, MM_TO_IN),
        temp_f=tuple(None if t not in temp else temp[t] * 9 / 5 + 32 for t in times),
        visibility_mi=conv(vis, M_TO_MI),
        weather_code=tuple(None for _ in times),
        timezone=timezone,
    )


def _headers() -> dict[str, str]:
    return {"User-Agent": settings.NWS_USER_AGENT, "Accept": "application/geo+json"}


async def _grid_for(cell: Cell) -> tuple[str, str]:
    key = f"nws:points:{cell[0]}:{cell[1]}"
    cached = await get_json_value(key)
    if cached:
        return cached["url"], cached["tz"]
    data = await get_json(
        f"{BASE}/points/{cell[0]:.4f},{cell[1]:.4f}", headers=_headers(), service="nws"
    )
    props = data["properties"]
    value = {"url": props["forecastGridData"], "tz": props.get("timeZone", "UTC")}
    await set_json_value(key, value, POINTS_TTL_S)
    return value["url"], value["tz"]


async def fetch(cells: Sequence[Cell], hours: int) -> dict[Cell, CellForecast]:
    del hours  # NWS always returns ~7 days
    sem = asyncio.Semaphore(_CONCURRENCY)

    async def grid(cell: Cell) -> tuple[Cell, str, str]:
        async with sem:
            url, tz = await _grid_for(cell)
            return cell, url, tz

    located = await asyncio.gather(*(grid(c) for c in cells))
    by_url: dict[str, list[Cell]] = defaultdict(list)
    tz_for: dict[str, str] = {}
    for cell, url, tz in located:
        by_url[url].append(cell)
        tz_for[url] = tz

    async def load(url: str) -> tuple[str, CellForecast]:
        async with sem:
            data = await get_json(url, headers=_headers(), service="nws")
            return url, parse_grid(data["properties"], tz_for[url], int(time.time()))

    grids = await asyncio.gather(*(load(u) for u in by_url))
    return {cell: fc for url, fc in grids for cell in by_url[url]}
