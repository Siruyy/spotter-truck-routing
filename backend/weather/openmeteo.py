"""Open-Meteo forecast provider (free tier, no key, CC BY 4.0)."""

from __future__ import annotations

import asyncio
import time
from collections.abc import Sequence
from typing import Any

from core.http import get_json
from core.quota import count_openmeteo_calls
from weather.models import Cell, CellForecast

URL = "https://api.open-meteo.com/v1/forecast"
BATCH_SIZE = 150  # keeps the GET URL well under nginx's limit
MAX_FORECAST_HOURS = 384
HOURLY = (
    "wind_speed_10m,wind_gusts_10m,rain,showers,snowfall,temperature_2m,visibility,weather_code"
)
FEET_PER_MILE = 5280.0


def _sum(a: float | None, b: float | None) -> float | None:
    if a is None and b is None:
        return None
    return (a or 0.0) + (b or 0.0)


def parse_location(item: dict[str, Any], fetched_at: int) -> CellForecast:
    h = item["hourly"]
    vis = h.get("visibility") or [None] * len(h["time"])
    return CellForecast(
        provider="open-meteo",
        fetched_at=fetched_at,
        times=tuple(int(t) for t in h["time"]),
        wind_mph=tuple(h["wind_speed_10m"]),
        gust_mph=tuple(h["wind_gusts_10m"]),
        rain_in_hr=tuple(_sum(r, s) for r, s in zip(h["rain"], h["showers"], strict=True)),
        snow_in_hr=tuple(h["snowfall"]),
        temp_f=tuple(h["temperature_2m"]),
        visibility_mi=tuple(None if v is None else v / FEET_PER_MILE for v in vis),
        weather_code=tuple(h["weather_code"]),
        utc_offset_s=int(item.get("utc_offset_seconds", 0)),
        timezone=str(item.get("timezone", "UTC")),
    )


async def _fetch_batch(cells: Sequence[Cell], hours: int) -> dict[Cell, CellForecast]:
    params = {
        "latitude": ",".join(f"{c[0]:.1f}" for c in cells),
        "longitude": ",".join(f"{c[1]:.1f}" for c in cells),
        "hourly": HOURLY,
        "wind_speed_unit": "mph",
        "precipitation_unit": "inch",
        "temperature_unit": "fahrenheit",
        "timezone": "auto",
        "timeformat": "unixtime",
        "forecast_hours": hours,
        "models": "best_match",
    }
    await count_openmeteo_calls(len(cells))
    data = await get_json(URL, params=params, service="openmeteo")
    items = data if isinstance(data, list) else [data]
    now = int(time.time())
    return {cell: parse_location(item, now) for cell, item in zip(cells, items, strict=True)}


async def fetch(cells: Sequence[Cell], hours: int) -> dict[Cell, CellForecast]:
    hours = max(1, min(hours, MAX_FORECAST_HOURS))
    batches = [cells[i : i + BATCH_SIZE] for i in range(0, len(cells), BATCH_SIZE)]
    results = await asyncio.gather(*(_fetch_batch(b, hours) for b in batches))
    merged: dict[Cell, CellForecast] = {}
    for part in results:
        merged.update(part)
    return merged
