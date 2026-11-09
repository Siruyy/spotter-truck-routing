"""Shared async HTTP client with timeouts and bounded retries."""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Mapping
from typing import Any

import httpx

from core.errors import UpstreamError

logger = logging.getLogger(__name__)

RETRY_STATUSES = frozenset({429, 500, 502, 503, 504})
RETRY_BACKOFF_S = 0.6
DEFAULT_TIMEOUT = httpx.Timeout(20.0, connect=5.0)

_client: httpx.AsyncClient | None = None
_client_loop: asyncio.AbstractEventLoop | None = None


def get_client() -> httpx.AsyncClient:
    """Process-wide client, recreated if the running event loop changed."""
    global _client, _client_loop
    loop = asyncio.get_running_loop()
    if _client is None or _client.is_closed or _client_loop is not loop:
        _client = httpx.AsyncClient(
            timeout=DEFAULT_TIMEOUT,
            limits=httpx.Limits(max_connections=50, max_keepalive_connections=20),
            headers={"Accept-Encoding": "gzip"},
        )
        _client_loop = loop
    return _client


async def get_json(
    url: str,
    *,
    params: Mapping[str, Any] | None = None,
    headers: Mapping[str, str] | None = None,
    service: str,
    attempts: int = 3,
    backoff_s: float | None = None,
) -> Any:
    """GET JSON with retries on transient failures. Raises UpstreamError."""
    client = get_client()
    last_status: int | None = None
    for attempt in range(attempts):
        try:
            resp = await client.get(url, params=params, headers=headers)
        except httpx.TransportError as exc:
            logger.warning("%s transport error (attempt %d): %s", service, attempt + 1, exc)
            last_status = None
        else:
            if resp.status_code < 400:
                return resp.json()
            last_status = resp.status_code
            if resp.status_code not in RETRY_STATUSES:
                raise UpstreamError(
                    f"{service} rejected the request ({resp.status_code})",
                    code=f"{service}_{resp.status_code}",
                )
            logger.warning("%s returned %d (attempt %d)", service, resp.status_code, attempt + 1)
        if attempt < attempts - 1:
            await asyncio.sleep((RETRY_BACKOFF_S if backoff_s is None else backoff_s) * 2**attempt)
    if last_status == 429:
        raise UpstreamError(f"{service} rate limit reached", code=f"{service}_rate_limited")
    raise UpstreamError(f"{service} is unavailable right now", code=f"{service}_unavailable")
