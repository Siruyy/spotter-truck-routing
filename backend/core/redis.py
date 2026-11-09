"""Async Redis connection shared per event loop."""

from __future__ import annotations

import asyncio
import json
from typing import Any

import redis.asyncio as aioredis
from django.conf import settings

_conns: dict[int, aioredis.Redis] = {}


def get_redis() -> aioredis.Redis:
    loop_id = id(asyncio.get_running_loop())
    conn = _conns.get(loop_id)
    if conn is None:
        conn = aioredis.from_url(settings.REDIS_URL, decode_responses=False)
        _conns[loop_id] = conn
    return conn


def set_redis_for_tests(conn: aioredis.Redis) -> None:
    _conns[id(asyncio.get_running_loop())] = conn


async def get_json_value(key: str) -> Any | None:
    raw = await get_redis().get(key)
    return None if raw is None else json.loads(raw)


async def set_json_value(key: str, value: Any, ttl_s: int) -> None:
    await get_redis().set(key, json.dumps(value, separators=(",", ":")), ex=ttl_s)
