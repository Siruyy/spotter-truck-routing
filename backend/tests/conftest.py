import json
from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any

import fakeredis
import pytest
import pytest_asyncio

from core.redis import set_redis_for_tests

FIXTURES = Path(__file__).parent / "fixtures"


def load_fixture(name: str) -> Any:
    return json.loads((FIXTURES / name).read_text())


@pytest.fixture(autouse=True)
def _test_settings(settings: Any, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("core.http.RETRY_BACKOFF_S", 0.0)
    settings.TOMTOM_API_KEY = "test-key"
    settings.TOMTOM_DAILY_LIMIT = 1000
    settings.OPENMETEO_DAILY_LIMIT = 9000
    settings.FORECAST_PROVIDER = "open-meteo"
    settings.TRUST_CF_CONNECTING_IP = True


@pytest_asyncio.fixture(autouse=True)
async def fake_redis() -> AsyncIterator[fakeredis.FakeAsyncRedis]:
    conn = fakeredis.FakeAsyncRedis()
    set_redis_for_tests(conn)
    yield conn
    await conn.flushall()
    await conn.aclose()
