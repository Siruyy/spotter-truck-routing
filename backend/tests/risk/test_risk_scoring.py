import pytest

from risk.rules import Level
from risk.scoring import RouteScore, owned_miles, recommend, score_route

L, M, H, S, N = Level.LOW, Level.MODERATE, Level.HIGH, Level.SEVERE, Level.NO_TRAVEL


def test_owned_miles_sum_to_route_length() -> None:
    distances = [0, 25, 50, 75, 90]
    owned = owned_miles(distances)
    assert owned == [12.5, 25, 25, 20, 7.5]
    assert sum(owned) == pytest.approx(90)


def test_owned_miles_edge_cases() -> None:
    assert owned_miles([]) == []
    assert owned_miles([0]) == [0.0]
    assert owned_miles([0, 10]) == [5, 5]


def test_score_route_buckets_and_average() -> None:
    s = score_route([0, 10, 20, 30], [L, S, H, None], duration_s=3600)
    assert s.low_mi == 5
    assert s.severe_mi == 10
    assert s.high_mi == 10
    assert s.unknown_mi == 5
    # weighted over known miles: (0*5 + 3*10 + 2*10) / 25
    assert s.avg_risk == pytest.approx(2.0)


def test_score_route_rejects_mismatch() -> None:
    with pytest.raises(ValueError):
        score_route([0, 10], [L], 1)


def test_score_all_unknown_has_zero_average() -> None:
    assert score_route([0, 10], [None, None], 1).avg_risk == 0


def _score(**kw: float) -> RouteScore:
    base = dict(
        no_travel_mi=0,
        severe_mi=0,
        high_mi=0,
        moderate_mi=0,
        low_mi=100,
        unknown_mi=0,
        avg_risk=0,
        duration_s=36_000,
    )
    base.update(kw)
    return RouteScore(**base)


def test_no_travel_ranks_before_severe() -> None:
    a = _score(no_travel_mi=5)
    b = _score(severe_mi=200)
    rec = recommend([a, b])
    assert rec.index == 1
    assert rec.reason.startswith("Fewest no-travel miles")


def test_ranking_order_severe_high_avg_duration() -> None:
    assert recommend([_score(severe_mi=10), _score(severe_mi=2, high_mi=90)]).index == 1
    rec = recommend([_score(high_mi=20), _score(high_mi=5)])
    assert (rec.index, rec.reason) == (1, "Fewest high-risk miles (5.0 vs 20)")
    rec = recommend([_score(avg_risk=0.9), _score(avg_risk=0.4)])
    assert rec.index == 1 and "average risk" in rec.reason
    rec = recommend([_score(duration_s=40_000), _score(duration_s=36_000)])
    assert rec.index == 1 and rec.reason == "Equal weather risk; fastest (10 h 00 m)"


def test_float_noise_does_not_decide() -> None:
    rec = recommend([_score(severe_mi=10.0, duration_s=1), _score(severe_mi=10.04, duration_s=2)])
    assert rec.index == 0
    assert "fastest" in rec.reason


def test_reason_texts() -> None:
    assert recommend([_score(severe_mi=0), _score(severe_mi=34)]).reason == (
        "Fewest severe-weather miles (0 vs 34)"
    )
    assert recommend([_score()]).reason == "Only route available"
    assert recommend([_score(), _score()]).reason == "Equal on every criterion; first listed"
    assert recommend([_score(high_mi=2.5), _score(high_mi=7.5)]).reason == (
        "Fewest high-risk miles (2.5 vs 7.5)"
    )


def test_recommend_requires_routes() -> None:
    with pytest.raises(ValueError):
        recommend([])


def test_rank_key_without_duration() -> None:
    assert len(_score().rank_key(include_duration=False)) == 4
