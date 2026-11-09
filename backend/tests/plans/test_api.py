import time
from datetime import UTC, datetime, timedelta

import httpx
import pytest
import respx
from django.test import AsyncClient

from routing.tomtom import BASE_URL as TOMTOM_ROUTE
from tests.conftest import load_fixture
from weather import openmeteo
from weather.alerts import URL as ALERTS_URL


def _om(request: httpx.Request) -> httpx.Response:
    n = len(request.url.params["latitude"].split(","))
    start = int(time.time()) // 3600 * 3600
    hours = int(request.url.params["forecast_hours"])
    times = [start + h * 3600 for h in range(hours)]
    hourly = {
        "time": times,
        "wind_speed_10m": [38.0] * hours,  # High; Severe for loads > 40k
        "wind_gusts_10m": [50.0] * hours,
        "rain": [0.0] * hours,
        "showers": [0.0] * hours,
        "snowfall": [0.0] * hours,
        "temperature_2m": [33.0] * hours,
        "visibility": [52800.0] * hours,
        "weather_code": [3] * hours,
    }
    item = {"timezone": "America/Chicago", "utc_offset_seconds": -21600, "hourly": hourly}
    return httpx.Response(200, json=[item] * n)


def _body(**over):
    body = {
        "origin": {"label": "Dallas, TX", "lat": 32.7767, "lon": -96.797},
        "destination": {"label": "Denver, CO", "lat": 39.7392, "lon": -104.9903},
        "departure_at": (datetime.now(UTC) + timedelta(hours=1)).isoformat(),
        "load_lb": 42_000,
        "interval_mi": 25,
    }
    body.update(over)
    return body


@pytest.fixture
def upstream():
    tt = load_fixture("tomtom_route_dallas_denver.json")
    with respx.mock(assert_all_called=False) as mock:
        mock.get(url__regex=rf"{TOMTOM_ROUTE}/[^:]+:[^:]+/json").mock(
            return_value=httpx.Response(200, json=tt)
        )
        # Forced alternatives return nothing new -> plan keeps TomTom's 2 routes.
        mock.get(url__regex=rf"{TOMTOM_ROUTE}/[^:]+:[^:]+:[^:]+/json").mock(
            return_value=httpx.Response(200, json={"routes": [tt["routes"][0]]})
        )
        mock.get(openmeteo.URL).mock(side_effect=_om)
        mock.get(ALERTS_URL).mock(
            return_value=httpx.Response(
                200,
                json={
                    "features": [
                        {
                            "properties": {
                                "id": "x1",
                                "event": "High Wind Warning",
                                "severity": "Severe",
                                "headline": "High Wind Warning",
                                "areaDesc": "Panhandle",
                            }
                        }
                    ]
                },
            )
        )
        yield mock


@pytest.mark.django_db(transaction=True)
async def test_full_plan_flow(upstream) -> None:
    client = AsyncClient()
    resp = await client.post("/api/plans", _body(), content_type="application/json")
    assert resp.status_code == 200, resp.content
    plan = resp.json()
    assert [r["id"] for r in plan["routes"]] == ["A", "B"]
    assert "Only 2 distinct" in plan["notices"][0]
    route = plan["routes"][0]
    assert route["geometry"][0][0] < -90  # GeoJSON lon first
    assert route["checkpoints"][0]["mile"] == 0
    # 38 mph with a 42k load -> Severe everywhere (load rule).
    assert {c["level"] for c in route["checkpoints"]} == {3}
    assert route["checkpoints"][0]["tz"] == "America/Chicago"
    assert plan["recommendation"]["route_id"] in {"A", "B"}
    assert plan["weather"]["provider"] == "open-meteo"

    resampled = (await client.get(f"/api/plans/{plan['id']}?interval_mi=50")).json()
    assert len(resampled["routes"][0]["checkpoints"]) < len(route["checkpoints"])

    heat = (await client.get(f"/api/plans/{plan['id']}/heatmap")).json()
    n = len(heat["points"])
    assert 0 < n <= 300 and heat["hours"] == 49
    assert len(heat["layers"]["risk"]) == n * 49
    assert set(heat["layers"]["risk"]) <= {3, -1}

    alerts = (await client.get(f"/api/plans/{plan['id']}/alerts")).json()
    assert alerts["alerts"][0]["event"] == "High Wind Warning"
    assert set(alerts["alerts"][0]["hits"]) == {"A", "B"}

    share = await client.post(
        f"/api/plans/{plan['id']}/share", {"interval_mi": 25}, content_type="application/json"
    )
    slug = share.json()["slug"]
    shared = (await client.get(f"/api/shared/{slug}")).json()
    assert shared["plan"]["id"] == plan["id"]


@pytest.mark.django_db
async def test_validation_errors_have_stable_shape() -> None:
    client = AsyncClient()
    resp = await client.post("/api/plans", _body(load_lb=90_000), content_type="application/json")
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "invalid_input"
    past = (datetime.now(UTC) - timedelta(hours=3)).isoformat()
    resp = await client.post(
        "/api/plans", _body(departure_at=past), content_type="application/json"
    )
    assert resp.json()["error"]["code"] == "departure_in_past"
    late = (datetime.now(UTC) + timedelta(hours=60)).isoformat()
    resp = await client.post(
        "/api/plans", _body(departure_at=late), content_type="application/json"
    )
    assert resp.json()["error"]["code"] == "departure_too_late"


@pytest.mark.django_db
async def test_unknown_plan_and_share() -> None:
    client = AsyncClient()
    assert (await client.get("/api/plans/nope")).status_code == 404
    assert (await client.get("/api/shared/nope123")).status_code == 404
    assert (await client.get("/api/shared/bad!slug")).status_code == 400


@pytest.mark.django_db
async def test_rate_limit_uses_cloudflare_ip(settings, upstream) -> None:
    settings.RATE_LIMIT_SUGGEST_PER_MIN = 1
    upstream.get(url__startswith="https://api.tomtom.com/search").mock(
        return_value=httpx.Response(200, json={"results": []})
    )
    client = AsyncClient()
    ok = await client.get(
        "/api/geocode/suggest?q=amarillo", headers={"CF-Connecting-IP": "1.1.1.1"}
    )
    assert ok.status_code == 200
    limited = await client.get(
        "/api/geocode/suggest?q=amarill", headers={"CF-Connecting-IP": "1.1.1.1"}
    )
    assert limited.status_code == 429
    other = await client.get("/api/geocode/suggest?q=amar", headers={"CF-Connecting-IP": "2.2.2.2"})
    assert other.status_code == 200


@pytest.mark.django_db
async def test_viewport_heatmap_and_bad_bbox(upstream) -> None:
    client = AsyncClient()
    ok = await client.get("/api/heatmap?bbox=-100,35,-98,37")
    assert ok.status_code == 200 and ok.json()["load_applied"] is False
    bad = await client.get("/api/heatmap?bbox=a,b")
    assert bad.status_code == 400


@pytest.mark.django_db
async def test_health(fake_redis) -> None:
    body = (await AsyncClient().get("/api/health")).json()
    assert body["redis"] is True
