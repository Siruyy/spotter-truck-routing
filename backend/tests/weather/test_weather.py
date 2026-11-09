import time

import httpx
import pytest
import respx

from core.errors import UpstreamError
from tests.conftest import load_fixture
from weather import nws, openmeteo
from weather.models import CellForecast, snap
from weather.service import WeatherUnavailable, get_forecasts, horizon_hours


def test_snap_lattice() -> None:
    assert snap(32.7767, -96.797) == (32.8, -96.8)
    assert snap(-0.04, 0.05) in {(-0.0, 0.1), (0.0, 0.1), (-0.0, 0.0), (0.0, 0.0)}


def _fc(times: list[int], **over) -> CellForecast:
    n = len(times)
    base = dict(
        provider="open-meteo",
        fetched_at=int(time.time()),
        times=tuple(times),
        wind_mph=tuple([10.0] * n),
        gust_mph=tuple([15.0] * n),
        rain_in_hr=tuple([0.0] * n),
        snow_in_hr=tuple([0.0] * n),
        temp_f=tuple([50.0] * n),
        visibility_mi=tuple([10.0] * n),
        weather_code=tuple([0] * n),
        timezone="America/Chicago",
    )
    base.update(over)
    return CellForecast(**base)


def test_index_uses_preceding_hour_semantics() -> None:
    fc = _fc([3600, 7200, 10800])
    assert fc.index_for(3600) == 0  # exactly on the hour -> that row
    assert fc.index_for(3601) == 1  # inside (1h, 2h] -> row stamped 2h
    assert fc.index_for(7200) == 1
    assert fc.index_for(10_801) is None  # beyond coverage
    assert fc.index_for(0) is None  # before the first covered hour
    assert fc.at(99_999) is None
    assert _fc([]).index_for(5) is None


def test_roundtrip_dict() -> None:
    fc = _fc([3600, 7200])
    assert CellForecast.from_dict(fc.to_dict()) == fc


def test_parse_openmeteo_fixture() -> None:
    items = load_fixture("openmeteo_two.json")
    fc = openmeteo.parse_location(items[0], fetched_at=1)
    assert fc.timezone == "America/Chicago"
    assert len(fc.times) == 4
    assert fc.wind_mph[0] == 2.1
    assert fc.visibility_mi[0] == pytest.approx(71850.392 / 5280)
    assert fc.rain_in_hr[0] == 0.0


def test_openmeteo_rain_adds_showers() -> None:
    item = {
        "hourly": {
            "time": [1, 2],
            "wind_speed_10m": [1, 1],
            "wind_gusts_10m": [1, 1],
            "rain": [0.1, None],
            "showers": [0.05, None],
            "snowfall": [0, 0],
            "temperature_2m": [1, 1],
            "visibility": [None, None],
            "weather_code": [1, 1],
        }
    }
    fc = openmeteo.parse_location(item, 0)
    assert fc.rain_in_hr == (pytest.approx(0.15), None)
    assert fc.visibility_mi == (None, None)


def test_nws_duration_and_expand() -> None:
    assert nws.duration_hours("PT1H") == 1
    assert nws.duration_hours("PT6H") == 6
    assert nws.duration_hours("P1DT19H") == 43
    with pytest.raises(ValueError):
        nws.duration_hours("bogus")
    series = {"values": [{"validTime": "2026-11-09T12:00:00+00:00/PT6H", "value": 6.0}]}
    spread = nws.expand(series, spread=True)
    assert len(spread) == 6 and set(spread.values()) == {1.0}
    first = min(spread)
    assert first % 3600 == 0  # hour-ending stamps


def test_nws_parse_grid_fixture_units() -> None:
    props = load_fixture("nws_grid.json")["properties"]
    fc = nws.parse_grid(props, "America/Denver", 1)
    assert fc.provider == "nws"
    assert len(fc.times) > 24
    first_wind_kmh = props["windSpeed"]["values"][0]["value"]
    assert fc.wind_mph[0] == pytest.approx(first_wind_kmh * nws.KMH_TO_MPH)
    assert all(v is None or v >= 0 for v in fc.rain_in_hr)


def _om_payload(n_locations: int, hours: int = 80) -> list[dict]:
    now = int(time.time()) // 3600 * 3600
    times = [now + h * 3600 for h in range(hours)]
    hourly = {
        "time": times,
        "wind_speed_10m": [12.0] * hours,
        "wind_gusts_10m": [20.0] * hours,
        "rain": [0.0] * hours,
        "showers": [0.0] * hours,
        "snowfall": [0.0] * hours,
        "temperature_2m": [40.0] * hours,
        "visibility": [52800.0] * hours,
        "weather_code": [1] * hours,
    }
    return [
        {"utc_offset_seconds": -21600, "timezone": "America/Chicago", "hourly": hourly}
        for _ in range(n_locations)
    ]


@respx.mock
async def test_get_forecasts_caches_results() -> None:
    route = respx.get(openmeteo.URL).mock(
        side_effect=lambda req: httpx.Response(
            200, json=_om_payload(len(req.url.params["latitude"].split(",")))
        )
    )
    cells = [(32.8, -96.8), (33.0, -97.0)]
    until = time.time() + 3600 * 10
    first = await get_forecasts(cells, until=until)
    assert set(first.cells) == set(cells)
    assert first.provider == "open-meteo"
    second = await get_forecasts(cells, until=until)
    assert second.cells.keys() == first.cells.keys()
    assert route.call_count == 1  # served from cache the second time


@respx.mock
async def test_stale_cache_served_on_upstream_failure(settings) -> None:
    respx.get(openmeteo.URL).mock(side_effect=lambda req: httpx.Response(200, json=_om_payload(1)))
    until = time.time() + 3600
    await get_forecasts([(30.0, -90.0)], until=until)
    settings.FORECAST_TTL_S = 0  # everything is now stale
    respx.get(openmeteo.URL).mock(return_value=httpx.Response(503))
    respx.get(url__startswith=nws.BASE).mock(return_value=httpx.Response(503))
    result = await get_forecasts([(30.0, -90.0)], until=until)
    assert result.stale_as_of is not None


@respx.mock
async def test_unavailable_without_cache() -> None:
    respx.get(openmeteo.URL).mock(return_value=httpx.Response(503))
    respx.get(url__startswith=nws.BASE).mock(return_value=httpx.Response(503))
    with pytest.raises(WeatherUnavailable):
        await get_forecasts([(31.0, -91.0)], until=time.time() + 60)


@respx.mock
async def test_budget_exhausted_without_fallback_raises(settings) -> None:
    settings.OPENMETEO_DAILY_LIMIT = 0
    with pytest.raises(UpstreamError):
        await get_forecasts([(31.0, -91.0)], until=time.time() + 60, allow_nws_fallback=False)


def test_horizon_hours_minimum() -> None:
    assert horizon_hours(until=100, now=0) == 72
    assert horizon_hours(until=100 * 3600, now=0) == 102
