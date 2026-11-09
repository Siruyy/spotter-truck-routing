import itertools
from datetime import UTC, datetime

import httpx
import pytest
import respx

from core.errors import NoRouteFound, QuotaExceeded
from routing import alternatives
from routing.geometry import METERS_PER_MILE
from routing.tomtom import BASE_URL, calculate_routes, gross_weight_kg, parse_route
from tests.conftest import load_fixture

DALLAS = (32.7767, -96.7970)
DENVER = (39.7392, -104.9903)
DEPART = datetime(2026, 11, 10, 14, 0, tzinfo=UTC)


@pytest.fixture
def tomtom_payload() -> dict:
    return load_fixture("tomtom_route_dallas_denver.json")


def test_gross_weight_adds_tare(settings) -> None:
    settings.TARE_LB = 35_000
    assert gross_weight_kg(40_000) == round(75_000 * 0.45359237)


def test_parse_route_real_fixture(tomtom_payload: dict) -> None:
    route = parse_route(tomtom_payload["routes"][0])
    assert route.length_m == 1_419_857
    assert route.duration_s == 43_161
    assert route.road_names[0].startswith("I-35")  # leaves Dallas on I-35E
    assert len(route.road_names) == 2
    # Time profile is monotone and ends at the summary duration.
    secs = route.time_profile.seconds
    assert all(b >= a for a, b in itertools.pairwise(secs))
    assert secs[-1] == pytest.approx(43_161)
    assert route.time_profile.seconds_at(route.polyline.length_m / 2) == pytest.approx(
        21_500, rel=0.15
    )
    assert route.polyline.length_m / METERS_PER_MILE == pytest.approx(882, rel=0.01)


@respx.mock
async def test_calculate_routes_sends_truck_params(tomtom_payload: dict) -> None:
    route = respx.get(url__startswith=BASE_URL).mock(
        return_value=httpx.Response(200, json=tomtom_payload)
    )
    routes = await calculate_routes(DALLAS, DENVER, depart_at=DEPART, load_lb=40_000)
    assert len(routes) == 2
    params = route.calls.last.request.url.params
    assert params["travelMode"] == "truck"
    assert params["vehicleCommercial"] == "true"
    assert params["departAt"] == "2026-11-10T14:00:00Z"
    assert params["maxAlternatives"] == "5"
    assert params["traffic"] == "true"


@respx.mock
async def test_bad_request_maps_to_no_route() -> None:
    respx.get(url__startswith=BASE_URL).mock(return_value=httpx.Response(400, json={}))
    with pytest.raises(NoRouteFound):
        await calculate_routes(DALLAS, DENVER, depart_at=DEPART, load_lb=0)


@respx.mock
async def test_daily_quota_enforced(settings, tomtom_payload: dict) -> None:
    settings.TOMTOM_DAILY_LIMIT = 1
    respx.get(url__startswith=BASE_URL).mock(return_value=httpx.Response(200, json=tomtom_payload))
    await calculate_routes(DALLAS, DENVER, depart_at=DEPART, load_lb=0)
    with pytest.raises(QuotaExceeded):
        await calculate_routes(DALLAS, DENVER, depart_at=DEPART, load_lb=0)


@respx.mock
async def test_three_routes_forces_alternative_via_point(tomtom_payload: dict) -> None:
    primary_only = {"routes": tomtom_payload["routes"]}  # 2 distinct routes
    # Forced alternatives: reuse route 0 (duplicate, rejected) and route 1 (dup) to
    # check dedupe, so we end with the 2 originals.
    respx.get(url__regex=rf"{BASE_URL}/[^:]+:[^:]+/json").mock(
        return_value=httpx.Response(200, json=primary_only)
    )
    respx.get(url__regex=rf"{BASE_URL}/[^:]+:[^:]+:[^:]+/json").mock(
        return_value=httpx.Response(200, json={"routes": [tomtom_payload["routes"][0]]})
    )
    routes = await alternatives.three_routes(DALLAS, DENVER, depart_at=DEPART, load_lb=0)
    assert len(routes) == 2
    assert routes[0].duration_s <= routes[1].duration_s


def test_via_points_are_perpendicular_and_bounded(tomtom_payload: dict) -> None:
    primary = parse_route(tomtom_payload["routes"][0])
    left, right = alternatives.via_points(primary, DALLAS, DENVER, 0.15)
    from routing.geometry import haversine_m

    mid = primary.polyline.point_at(primary.polyline.length_m / 2)
    for v in (left, right):
        d = haversine_m(mid, v) / METERS_PER_MILE
        assert 25 <= d <= 120
