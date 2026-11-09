"""Pure evaluation of routes against forecasts: checkpoint risk, scores, recommendation,
and better-departure search. No I/O here."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any

from plans.checkpoints import Checkpoint
from risk.rules import Conditions, Level, assess
from risk.scoring import Recommendation, RouteScore, recommend, score_route
from weather.models import Cell, CellForecast, HourValues, snap

DEPARTURE_OFFSETS_H = (1, 2, 4, 6, 12)


@dataclass(frozen=True)
class EvaluatedCheckpoint:
    checkpoint: Checkpoint
    eta: float
    level: Level | None
    factor: str | None
    gust_advisory: bool
    weather: HourValues | None
    timezone: str


@dataclass(frozen=True)
class EvaluatedRoute:
    checkpoints: tuple[EvaluatedCheckpoint, ...]
    score: RouteScore


def evaluate_checkpoint(
    cp: Checkpoint, depart_epoch: float, load_lb: float, forecasts: Mapping[Cell, CellForecast]
) -> EvaluatedCheckpoint:
    eta = depart_epoch + cp.elapsed_s
    fc = forecasts.get(snap(*cp.position))
    values = fc.at(eta) if fc else None
    tz = fc.timezone if fc else "UTC"
    if values is None or not values.complete:
        return EvaluatedCheckpoint(cp, eta, None, None, False, values, tz)
    a = assess(
        Conditions(
            wind_mph=values.wind_mph or 0.0,
            rain_in_hr=values.rain_in_hr or 0.0,
            snow_in_hr=values.snow_in_hr or 0.0,
            gust_mph=values.gust_mph,
        ),
        load_lb,
    )
    return EvaluatedCheckpoint(cp, eta, a.level, a.factor, a.gust_advisory, values, tz)


def evaluate_route(
    checkpoints: Sequence[Checkpoint],
    duration_s: float,
    depart_epoch: float,
    load_lb: float,
    forecasts: Mapping[Cell, CellForecast],
) -> EvaluatedRoute:
    evaluated = tuple(
        evaluate_checkpoint(cp, depart_epoch, load_lb, forecasts) for cp in checkpoints
    )
    score = score_route(
        [e.checkpoint.mile for e in evaluated], [e.level for e in evaluated], duration_s
    )
    return EvaluatedRoute(evaluated, score)


@dataclass(frozen=True)
class DepartureSuggestion:
    offset_h: int
    depart_epoch: float
    route_index: int
    score: RouteScore
    current: RouteScore


def best_departure(
    routes: Sequence[tuple[Sequence[Checkpoint], float]],
    depart_epoch: float,
    load_lb: float,
    forecasts: Mapping[Cell, CellForecast],
    current: RouteScore,
    latest_allowed_epoch: float,
) -> DepartureSuggestion | None:
    """Safest offset (risk-only key, earliest on ties) that beats the current plan."""
    target = current.rank_key(include_duration=False)
    best: DepartureSuggestion | None = None
    best_key = target
    for offset in DEPARTURE_OFFSETS_H:
        start = depart_epoch + offset * 3600
        if start > latest_allowed_epoch:
            break
        scores = [evaluate_route(cps, dur, start, load_lb, forecasts).score for cps, dur in routes]
        if any(s.unknown_mi > 0 for s in scores):
            continue
        rec: Recommendation = recommend(scores)
        key = scores[rec.index].rank_key(include_duration=False)
        if key < best_key:
            best_key = key
            best = DepartureSuggestion(offset, start, rec.index, scores[rec.index], current)
    return best


def describe_improvement(s: DepartureSuggestion) -> str:
    cur, new = s.current, s.score
    if round(new.no_travel_mi, 1) < round(cur.no_travel_mi, 1):
        return f"{new.no_travel_mi:.0f} no-travel miles (now {cur.no_travel_mi:.0f})"
    if round(new.severe_mi, 1) < round(cur.severe_mi, 1):
        return f"{new.severe_mi:.0f} severe miles (now {cur.severe_mi:.0f})"
    if round(new.high_mi, 1) < round(cur.high_mi, 1):
        return f"{new.high_mi:.0f} high-risk miles (now {cur.high_mi:.0f})"
    return f"lower average risk ({new.avg_risk:.2f} vs {cur.avg_risk:.2f})"


def score_dict(s: RouteScore) -> dict[str, Any]:
    return {
        "no_travel_mi": round(s.no_travel_mi, 1),
        "severe_mi": round(s.severe_mi, 1),
        "high_mi": round(s.high_mi, 1),
        "moderate_mi": round(s.moderate_mi, 1),
        "low_mi": round(s.low_mi, 1),
        "unknown_mi": round(s.unknown_mi, 1),
        "avg_risk": round(s.avg_risk, 2),
        "duration_s": round(s.duration_s),
    }
