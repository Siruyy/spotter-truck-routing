"""Route scoring and recommendation.

Mileage ownership: each checkpoint owns half of the segment before it and half
of the segment after it, so owned miles always sum to the route length.

Ranking key (ascending): No Travel miles, Severe miles, High miles,
distance-weighted average risk, duration. The brief lists Severe first; No
Travel is strictly worse than Severe so it is ranked ahead of it.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

from risk.rules import Level

MILES_PRECISION = 1  # compare miles at 0.1 mi
AVG_PRECISION = 2  # compare average risk at 0.01


def owned_miles(distances_mi: Sequence[float]) -> list[float]:
    """Miles each checkpoint represents, given sorted checkpoint distances."""
    n = len(distances_mi)
    if n == 0:
        return []
    if n == 1:
        return [0.0]
    owned = [0.0] * n
    for i in range(n - 1):
        half = (distances_mi[i + 1] - distances_mi[i]) / 2
        owned[i] += half
        owned[i + 1] += half
    return owned


@dataclass(frozen=True, slots=True)
class RouteScore:
    no_travel_mi: float
    severe_mi: float
    high_mi: float
    moderate_mi: float
    low_mi: float
    unknown_mi: float
    avg_risk: float
    duration_s: float

    def rank_key(self, include_duration: bool = True) -> tuple[float, ...]:
        key = (
            round(self.no_travel_mi, MILES_PRECISION),
            round(self.severe_mi, MILES_PRECISION),
            round(self.high_mi, MILES_PRECISION),
            round(self.avg_risk, AVG_PRECISION),
        )
        return (*key, round(self.duration_s)) if include_duration else key


def score_route(
    distances_mi: Sequence[float], levels: Sequence[Level | None], duration_s: float
) -> RouteScore:
    if len(distances_mi) != len(levels):
        raise ValueError("distances and levels must have equal length")
    totals = {lvl: 0.0 for lvl in Level}
    unknown = 0.0
    for miles, level in zip(owned_miles(distances_mi), levels, strict=True):
        if level is None:
            unknown += miles
        else:
            totals[level] += miles
    known = sum(totals.values())
    weighted = sum(int(lvl) * mi for lvl, mi in totals.items())
    return RouteScore(
        no_travel_mi=totals[Level.NO_TRAVEL],
        severe_mi=totals[Level.SEVERE],
        high_mi=totals[Level.HIGH],
        moderate_mi=totals[Level.MODERATE],
        low_mi=totals[Level.LOW],
        unknown_mi=unknown,
        avg_risk=weighted / known if known > 0 else 0.0,
        duration_s=duration_s,
    )


@dataclass(frozen=True, slots=True)
class Recommendation:
    index: int
    reason: str
    runner_up: int | None


def _fmt_mi(value: float) -> str:
    return f"{value:.0f}" if value >= 10 or value == 0 else f"{value:.1f}"


def _fmt_duration(seconds: float) -> str:
    minutes = round(seconds / 60)
    hours, mins = divmod(minutes, 60)
    return f"{hours} h {mins:02d} m" if hours else f"{mins} m"


def _cmp(label: str, best: float, other: float) -> str:
    return f"{label} ({_fmt_mi(best)} vs {_fmt_mi(other)})"


def _reason(best: RouteScore, other: RouteScore | None) -> str:
    if other is None:
        return "Only route available"
    b, o = best.rank_key(), other.rank_key()
    if b[0] != o[0]:
        return _cmp("Fewest no-travel miles", best.no_travel_mi, other.no_travel_mi)
    if b[1] != o[1]:
        return (
            f"Fewest severe-weather miles ({_fmt_mi(best.severe_mi)} vs {_fmt_mi(other.severe_mi)})"
        )
    if b[2] != o[2]:
        return _cmp("Fewest high-risk miles", best.high_mi, other.high_mi)
    if b[3] != o[3]:
        return f"Lowest average risk ({best.avg_risk:.2f} vs {other.avg_risk:.2f})"
    if b[4] != o[4]:
        return f"Equal weather risk; fastest ({_fmt_duration(best.duration_s)})"
    return "Equal on every criterion; first listed"


def recommend(scores: Sequence[RouteScore]) -> Recommendation:
    if not scores:
        raise ValueError("no routes to recommend")
    order = sorted(range(len(scores)), key=lambda i: (scores[i].rank_key(), i))
    best = order[0]
    runner = order[1] if len(order) > 1 else None
    return Recommendation(
        index=best,
        reason=_reason(scores[best], scores[runner] if runner is not None else None),
        runner_up=runner,
    )
