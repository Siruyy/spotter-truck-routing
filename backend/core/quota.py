"""Daily upstream-call budgets and per-IP rate limits, backed by Redis."""

from __future__ import annotations

import time
from datetime import UTC, datetime

from django.conf import settings

from core.errors import AppError, QuotaExceeded
from core.redis import get_redis

DAY_TTL_S = 2 * 24 * 3600


def _day() -> str:
    return datetime.now(UTC).strftime("%Y%m%d")


async def _incr(key: str, amount: int, ttl_s: int) -> int:
    pipe = get_redis().pipeline()
    pipe.incrby(key, amount)
    pipe.expire(key, ttl_s)
    value, _ = await pipe.execute()
    return int(value)


async def count_tomtom_call() -> None:
    used = await _incr(f"quota:tomtom:{_day()}", 1, DAY_TTL_S)
    if used > settings.TOMTOM_DAILY_LIMIT:
        raise QuotaExceeded(
            "The daily demo limit for new routes has been reached. Shared and recent trips "
            "still work; please try again tomorrow."
        )


async def count_openmeteo_calls(locations: int) -> int:
    return await _incr(f"quota:openmeteo:{_day()}", locations, DAY_TTL_S)


async def openmeteo_budget_left(locations: int) -> bool:
    raw = await get_redis().get(f"quota:openmeteo:{_day()}")
    used = int(raw) if raw else 0
    return used + locations <= settings.OPENMETEO_DAILY_LIMIT


class RateLimited(AppError):
    status = 429
    code = "rate_limited"


async def enforce_rate_limit(bucket: str, client_ip: str, per_minute: int) -> None:
    window = int(time.time() // 60)
    used = await _incr(f"rl:{bucket}:{client_ip}:{window}", 1, 120)
    if used > per_minute:
        raise RateLimited("Too many requests. Please wait a minute and try again.")
