"""Weather risk classification, implementing the assessment's risk and load rules.

Boundary convention (documented in README "Assumptions"):
each band includes its lower bound and excludes its upper bound, except the
top Severe band of rain and snow, which the brief writes as inclusive ranges
("0.50–1.00", "2.0–3.0") followed by strict "> 1.00" / "> 3.0" for No Travel.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import IntEnum


class Level(IntEnum):
    LOW = 0
    MODERATE = 1
    HIGH = 2
    SEVERE = 3
    NO_TRAVEL = 4


class Factor:
    WIND = "wind"
    RAIN = "rain"
    SNOW = "snow"


# Wind bands (mph), half-open [lo, hi).
WIND_MODERATE = 25.0
WIND_HIGH = 35.0
WIND_SEVERE = 45.0
WIND_NO_TRAVEL = 55.0

# Rain bands (in/hr).
RAIN_MODERATE = 0.10
RAIN_HIGH = 0.25
RAIN_SEVERE = 0.50
RAIN_SEVERE_MAX = 1.00  # inclusive; strictly above is No Travel

# Snow bands (in/hr).
SNOW_MODERATE = 0.5
SNOW_HIGH = 1.0
SNOW_SEVERE = 2.0
SNOW_SEVERE_MAX = 3.0  # inclusive; strictly above is No Travel

# Load rules (lb), strict "greater than".
LOAD_NO_TRAVEL_IN_SEVERE_WIND = 30_000
LOAD_SEVERE_IN_HIGH_WIND = 40_000

GUST_ADVISORY_MPH = 55.0

# Tie-break order when two conditions produce the same level.
_FACTOR_PRIORITY = (Factor.WIND, Factor.SNOW, Factor.RAIN)


def classify_wind(mph: float) -> Level:
    if mph >= WIND_NO_TRAVEL:
        return Level.NO_TRAVEL
    if mph >= WIND_SEVERE:
        return Level.SEVERE
    if mph >= WIND_HIGH:
        return Level.HIGH
    if mph >= WIND_MODERATE:
        return Level.MODERATE
    return Level.LOW


def apply_load_rules(wind_level: Level, load_lb: float) -> Level:
    """Escalate the wind level for heavy loads (rules apply to wind only)."""
    if wind_level == Level.SEVERE and load_lb > LOAD_NO_TRAVEL_IN_SEVERE_WIND:
        return Level.NO_TRAVEL
    if wind_level == Level.HIGH and load_lb > LOAD_SEVERE_IN_HIGH_WIND:
        return Level.SEVERE
    return wind_level


def classify_rain(in_per_hr: float) -> Level:
    if in_per_hr > RAIN_SEVERE_MAX:
        return Level.NO_TRAVEL
    if in_per_hr >= RAIN_SEVERE:
        return Level.SEVERE
    if in_per_hr >= RAIN_HIGH:
        return Level.HIGH
    if in_per_hr >= RAIN_MODERATE:
        return Level.MODERATE
    return Level.LOW


def classify_snow(in_per_hr: float) -> Level:
    if in_per_hr > SNOW_SEVERE_MAX:
        return Level.NO_TRAVEL
    if in_per_hr >= SNOW_SEVERE:
        return Level.SEVERE
    if in_per_hr >= SNOW_HIGH:
        return Level.HIGH
    if in_per_hr >= SNOW_MODERATE:
        return Level.MODERATE
    return Level.LOW


@dataclass(frozen=True, slots=True)
class Conditions:
    wind_mph: float
    rain_in_hr: float
    snow_in_hr: float
    gust_mph: float | None = None


@dataclass(frozen=True, slots=True)
class Assessment:
    level: Level
    factor: str
    wind_level: Level
    rain_level: Level
    snow_level: Level
    gust_advisory: bool


def assess(conditions: Conditions, load_lb: float) -> Assessment:
    """Overall level = worst of (load-adjusted wind, rain, snow)."""
    wind = apply_load_rules(classify_wind(conditions.wind_mph), load_lb)
    rain = classify_rain(conditions.rain_in_hr)
    snow = classify_snow(conditions.snow_in_hr)
    by_factor = {Factor.WIND: wind, Factor.SNOW: snow, Factor.RAIN: rain}
    level = max(by_factor.values())
    factor = next(f for f in _FACTOR_PRIORITY if by_factor[f] == level)
    gust = conditions.gust_mph
    return Assessment(
        level=level,
        factor=factor,
        wind_level=wind,
        rain_level=rain,
        snow_level=snow,
        gust_advisory=gust is not None and gust >= GUST_ADVISORY_MPH,
    )
