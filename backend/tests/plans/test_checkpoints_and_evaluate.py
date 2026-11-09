import pytest

from plans.checkpoints import checkpoint_miles, sample
from plans.evaluate import best_departure, describe_improvement, evaluate_route
from risk.rules import Level
from routing.geometry import METERS_PER_MILE, Polyline, TimeProfile, destination_point
from weather.models import CellForecast, snap


def test_checkpoint_miles_regular_and_tail_rule() -> None:
    assert checkpoint_miles(100, 25) == [0, 25, 50, 75, 100]
    # 60 mi at 25: 50 is 10 mi (< 12.5) from the end -> dropped.
    assert checkpoint_miles(60, 25) == [0, 25, 60]
    # 64 mi at 25: 50 is 14 mi from the end -> kept.
    assert checkpoint_miles(64, 25) == [0, 25, 50, 64]
    assert checkpoint_miles(5, 25) == [0, 5]
    with pytest.raises(ValueError):
        checkpoint_miles(10, 0)


def _line_east(miles: float) -> Polyline:
    end = destination_point((0.0, 0.0), 90.0, miles * METERS_PER_MILE)
    return Polyline(((0.0, 0.0), end))


def test_sample_positions_and_elapsed_time() -> None:
    line = _line_east(100)
    profile = TimeProfile((0.0, line.length_m), (0.0, 7200.0))
    cps = sample(line, profile, 25)
    assert [round(c.mile) for c in cps] == [0, 25, 50, 75, 100]
    assert cps[2].elapsed_s == pytest.approx(3600, rel=1e-3)
    assert cps[-1].position == line.points[-1]


HOUR = 3600


def _forecast(
    cell: tuple[float, float], winds: list[float], snow: list[float] | None = None
) -> CellForecast:
    n = len(winds)
    return CellForecast(
        provider="open-meteo",
        fetched_at=0,
        times=tuple(h * HOUR for h in range(n)),
        wind_mph=tuple(winds),
        gust_mph=tuple(w + 10 for w in winds),
        rain_in_hr=tuple([0.0] * n),
        snow_in_hr=tuple(snow or [0.0] * n),
        temp_f=tuple([30.0] * n),
        visibility_mi=tuple([10.0] * n),
        weather_code=tuple([0] * n),
        timezone="America/Denver",
    )


def _route():
    line = _line_east(50)
    profile = TimeProfile((0.0, line.length_m), (0.0, 2 * HOUR))
    return sample(line, profile, 25), line


def test_evaluate_route_uses_eta_hour_and_load_rules() -> None:
    cps, _ = _route()
    # every checkpoint shares wind profile: 40 mph during first 3h, calm after.
    forecasts = {
        snap(*cp.position): _forecast(
            snap(*cp.position), [40, 40, 40, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5]
        )
        for cp in cps
    }
    light = evaluate_route(cps, 2 * HOUR, 0, 10_000, forecasts)
    heavy = evaluate_route(cps, 2 * HOUR, 0, 45_000, forecasts)
    assert {c.level for c in light.checkpoints} == {Level.HIGH}
    assert {c.level for c in heavy.checkpoints} == {Level.SEVERE}
    assert heavy.score.severe_mi == pytest.approx(50, rel=0.01)
    assert heavy.checkpoints[0].timezone == "America/Denver"
    assert heavy.checkpoints[1].eta == pytest.approx(HOUR, rel=1e-3)


def test_missing_forecast_is_unknown() -> None:
    cps, _ = _route()
    ev = evaluate_route(cps, 2 * HOUR, 0, 0, {})
    assert all(c.level is None for c in ev.checkpoints)
    assert ev.score.unknown_mi == pytest.approx(50, rel=0.01)


def test_best_departure_finds_earliest_safer_offset() -> None:
    cps, _ = _route()
    winds = [40] * 4 + [5] * 30  # windy for first 4 hours
    forecasts = {snap(*cp.position): _forecast(snap(*cp.position), winds) for cp in cps}
    current = evaluate_route(cps, 2 * HOUR, 0, 45_000, forecasts).score
    s = best_departure([(cps, 2 * HOUR)], 0, 45_000, forecasts, current, latest_allowed_epoch=10**9)
    assert s is not None
    assert s.offset_h == 4  # +1/+2 still reach windy hours
    assert s.score.severe_mi == 0
    assert "severe miles" in describe_improvement(s)


def test_best_departure_none_when_not_better_or_window_exceeded() -> None:
    cps, _ = _route()
    calm = {snap(*cp.position): _forecast(snap(*cp.position), [5] * 30) for cp in cps}
    current = evaluate_route(cps, 2 * HOUR, 0, 0, calm).score
    assert best_departure([(cps, 2 * HOUR)], 0, 0, calm, current, 10**9) is None
    windy = {snap(*cp.position): _forecast(snap(*cp.position), [40] * 3 + [5] * 30) for cp in cps}
    cur = evaluate_route(cps, 2 * HOUR, 0, 45_000, windy).score
    assert (
        best_departure([(cps, 2 * HOUR)], 0, 45_000, windy, cur, latest_allowed_epoch=HOUR - 1)
        is None
    )
