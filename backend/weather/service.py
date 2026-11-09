"""Forecast access with caching, request coalescing, quota guard and fallback."""

from __future__ import annotations

import asyncio
import json
import logging
import math
import time
from collections.abc import Awaitable, Callable, Iterable, Sequence
from dataclasses import dataclass

from django.conf import settings

from core.errors import UpstreamError
from core.quota import openmeteo_budget_left
from core.redis import get_redis
from weather import nws, openmeteo
from weather.models import HOUR_S, Cell, CellForecast

logger = logging.getLogger(__name__)

STORE_TTL_S = 24 * 3600  # kept long so stale data can be served on upstream failure
MIN_HORIZON_H = 72

Fetcher = Callable[[Sequence[Cell], int], Awaitable[dict[Cell, CellForecast]]]


class WeatherUnavailable(UpstreamError):
    code = "weather_unavailable"


@dataclass(frozen=True)
class ForecastSet:
    cells: dict[Cell, CellForecast]
    provider: str
    stale_as_of: int | None  # epoch of oldest stale data served, if any


def _key(cell: Cell) -> str:
    return f"fc:{cell[0]}:{cell[1]}"


def _is_fresh(fc: CellForecast, until: float, now: float) -> bool:
    return now - fc.fetched_at < settings.FORECAST_TTL_S and fc.end >= until


async def _read_cache(cells: Sequence[Cell]) -> dict[Cell, CellForecast]:
    if not cells:
        return {}

    raws = await get_redis().mget([_key(c) for c in cells])
    return {
        c: CellForecast.from_dict(json.loads(raw))
        for c, raw in zip(cells, raws, strict=True)
        if raw is not None
    }


async def _write_cache(forecasts: dict[Cell, CellForecast]) -> None:
    """One pipelined round trip, not one connection per cell."""
    if not forecasts:
        return
    pipe = get_redis().pipeline(transaction=False)
    for cell, fc in forecasts.items():
        pipe.set(_key(cell), json.dumps(fc.to_dict(), separators=(",", ":")), ex=STORE_TTL_S)
    await pipe.execute()


_inflight: dict[Cell, asyncio.Future[CellForecast | None]] = {}


async def _fetch_coalesced(
    cells: Sequence[Cell], hours: int, fetcher: Fetcher
) -> dict[Cell, CellForecast]:
    """Fetch cells, sharing in-flight requests between concurrent callers."""
    loop = asyncio.get_running_loop()
    mine: list[Cell] = []
    waiting: dict[Cell, asyncio.Future[CellForecast | None]] = {}
    for c in cells:
        fut = _inflight.get(c)
        if fut is not None and fut.get_loop() is loop and not fut.done():
            waiting[c] = fut
        else:
            _inflight[c] = loop.create_future()
            mine.append(c)
    result: dict[Cell, CellForecast] = {}
    try:
        if mine:
            fetched = await fetcher(mine, hours)
            await _write_cache(fetched)
            result.update(fetched)
            for c in mine:
                _inflight[c].set_result(fetched.get(c))
    except BaseException as exc:
        for c in mine:
            fut = _inflight[c]
            if not fut.done():
                fut.set_result(None)
        raise exc
    finally:
        for c in mine:
            _inflight.pop(c, None)
    for c, fut in waiting.items():
        fc = await fut
        if fc is not None:
            result[c] = fc
    return result


def horizon_hours(until: float, now: float) -> int:
    return max(MIN_HORIZON_H, math.ceil((until - now) / HOUR_S) + 2)


async def get_forecasts(
    cells: Iterable[Cell], *, until: float, allow_nws_fallback: bool = True
) -> ForecastSet:
    """Forecasts for every cell, covering at least up to epoch `until`."""
    unique = list(dict.fromkeys(cells))
    now = time.time()
    cached = await _read_cache(unique)
    fresh = {c: fc for c, fc in cached.items() if _is_fresh(fc, until, now)}
    missing = [c for c in unique if c not in fresh]
    if not missing:
        return ForecastSet(fresh, _provider_of(fresh), None)

    hours = horizon_hours(until, now)
    use_openmeteo = settings.FORECAST_PROVIDER == "open-meteo" and await openmeteo_budget_left(
        len(missing)
    )
    fetched: dict[Cell, CellForecast] = {}
    try:
        if use_openmeteo:
            fetched = await _fetch_coalesced(missing, hours, openmeteo.fetch)
        elif allow_nws_fallback:
            fetched = await _fetch_coalesced(missing, hours, nws.fetch)
        else:
            raise WeatherUnavailable("Forecast budget for today is used up.")
    except UpstreamError as exc:
        logger.warning("forecast fetch failed (%s); trying stale/fallback", exc.code)
        stale = {c: cached[c] for c in missing if c in cached and cached[c].end >= until}
        still = [c for c in missing if c not in stale]
        if still and use_openmeteo and allow_nws_fallback:
            try:
                stale.update(await _fetch_coalesced(still, hours, nws.fetch))
            except UpstreamError:
                logger.warning("NWS fallback failed too")
        if not stale and not fresh:
            raise WeatherUnavailable("Weather data is temporarily unavailable.") from exc
        merged = {**fresh, **stale}
        oldest = min((fc.fetched_at for fc in stale.values()), default=None)
        return ForecastSet(merged, _provider_of(merged), oldest)

    merged = {**fresh, **fetched}
    return ForecastSet(merged, _provider_of(merged), None)


def _provider_of(forecasts: dict[Cell, CellForecast]) -> str:
    providers = {fc.provider for fc in forecasts.values()}
    if not providers:
        return "none"
    return providers.pop() if len(providers) == 1 else "mixed"
