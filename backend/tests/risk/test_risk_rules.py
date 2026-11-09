import pytest

from risk.rules import (
    Conditions,
    Factor,
    Level,
    apply_load_rules,
    assess,
    classify_rain,
    classify_snow,
    classify_wind,
)

L, M, H, S, N = Level.LOW, Level.MODERATE, Level.HIGH, Level.SEVERE, Level.NO_TRAVEL


@pytest.mark.parametrize(
    ("mph", "expected"),
    [
        (0, L),
        (24.99, L),
        (25, M),
        (34, M),
        (34.99, M),
        (35, H),
        (44.99, H),
        (45, S),
        (54.99, S),
        (55, N),
        (80, N),
    ],
)
def test_wind_bands(mph: float, expected: Level) -> None:
    assert classify_wind(mph) == expected


@pytest.mark.parametrize(
    ("rate", "expected"),
    [
        (0, L),
        (0.0999, L),
        (0.10, M),
        (0.2499, M),
        (0.25, H),
        (0.4999, H),
        (0.50, S),
        (1.00, S),
        (1.0001, N),
        (2.5, N),
    ],
)
def test_rain_bands(rate: float, expected: Level) -> None:
    assert classify_rain(rate) == expected


@pytest.mark.parametrize(
    ("rate", "expected"),
    [
        (0, L),
        (0.499, L),
        (0.5, M),
        (0.999, M),
        (1.0, H),
        (1.999, H),
        (2.0, S),
        (3.0, S),
        (3.0001, N),
        (5, N),
    ],
)
def test_snow_bands(rate: float, expected: Level) -> None:
    assert classify_snow(rate) == expected


@pytest.mark.parametrize(
    ("wind_level", "load", "expected"),
    [
        # 45–54 mph + >30,000 lb -> No Travel (strict >)
        (S, 30_000, S),
        (S, 30_001, N),
        # 35–44 mph + >40,000 lb -> Severe (strict >)
        (H, 40_000, H),
        (H, 40_001, S),
        (H, 35_000, H),
        # Rules never touch other levels
        (M, 50_000, M),
        (L, 50_000, L),
        (N, 0, N),
    ],
)
def test_load_rules(wind_level: Level, load: float, expected: Level) -> None:
    assert apply_load_rules(wind_level, load) == expected


def test_wind_55_is_no_travel_for_any_load() -> None:
    assert assess(Conditions(55, 0, 0), load_lb=0).level == N


def test_load_rules_end_to_end_at_wind_boundaries() -> None:
    assert assess(Conditions(44.99, 0, 0), 45_000).level == S
    assert assess(Conditions(45, 0, 0), 30_000).level == S
    assert assess(Conditions(45, 0, 0), 30_000.5).level == N
    assert assess(Conditions(34.99, 0, 0), 50_000).level == M


def test_overall_is_worst_condition_and_factor_reported() -> None:
    a = assess(Conditions(wind_mph=10, rain_in_hr=0.3, snow_in_hr=1.5), 10_000)
    assert a.level == H
    assert a.factor == Factor.SNOW  # snow beats rain on a tie
    assert (a.wind_level, a.rain_level, a.snow_level) == (L, H, H)


def test_tie_prefers_wind() -> None:
    a = assess(Conditions(wind_mph=36, rain_in_hr=0.3, snow_in_hr=0), 0)
    assert a.factor == Factor.WIND


def test_gust_advisory_does_not_change_level() -> None:
    a = assess(Conditions(wind_mph=10, rain_in_hr=0, snow_in_hr=0, gust_mph=60), 45_000)
    assert a.level == L
    assert a.gust_advisory is True
    assert assess(Conditions(10, 0, 0, gust_mph=54.9), 0).gust_advisory is False
    assert assess(Conditions(10, 0, 0), 0).gust_advisory is False
