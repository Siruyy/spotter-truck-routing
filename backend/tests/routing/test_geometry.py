import pytest

from routing.geometry import (
    Polyline,
    TimeProfile,
    destination_point,
    haversine_m,
    initial_bearing_deg,
    overlap_fraction,
    simplify,
)

DALLAS = (32.7767, -96.7970)
DENVER = (39.7392, -104.9903)


def test_haversine_known_distance() -> None:
    # Dallas -> Denver great-circle is ~1065 km.
    assert haversine_m(DALLAS, DENVER) == pytest.approx(1_065_000, rel=0.01)


def test_bearing_and_destination_roundtrip() -> None:
    brg = initial_bearing_deg(DALLAS, DENVER)
    end = destination_point(DALLAS, brg, haversine_m(DALLAS, DENVER))
    assert haversine_m(end, DENVER) < 50


def test_polyline_point_at_and_bounds() -> None:
    line = Polyline(((0.0, 0.0), (0.0, 1.0), (0.0, 2.0)))
    assert line.point_at(-5) == (0.0, 0.0)
    assert line.point_at(line.length_m * 2) == (0.0, 2.0)
    mid = line.point_at(line.length_m / 2)
    assert mid[1] == pytest.approx(1.0, abs=1e-6)
    quarter = line.point_at(line.length_m / 4)
    assert quarter[1] == pytest.approx(0.5, abs=1e-6)


def test_polyline_requires_two_points() -> None:
    with pytest.raises(ValueError):
        Polyline(((0.0, 0.0),))


def test_densified_spacing() -> None:
    line = Polyline(((0.0, 0.0), (0.0, 1.0)))
    pts = line.densified(10_000)
    assert pts[0] == (0.0, 0.0) and pts[-1] == (0.0, 1.0)
    assert len(pts) == 13  # ~111 km / 10 km -> 12 steps


def test_time_profile_interpolation_and_clamping() -> None:
    tp = TimeProfile((0.0, 100.0, 300.0), (0.0, 10.0, 50.0))
    assert tp.seconds_at(-1) == 0
    assert tp.seconds_at(50) == 5
    assert tp.seconds_at(200) == 30
    assert tp.seconds_at(1000) == 50
    with pytest.raises(ValueError):
        TimeProfile((0.0,), (0.0,))


def test_simplify_keeps_corners_drops_collinear() -> None:
    pts = [(0.0, 0.0), (0.0, 0.5), (0.0, 1.0), (1.0, 1.0)]
    assert simplify(pts, 10) == [(0.0, 0.0), (0.0, 1.0), (1.0, 1.0)]
    assert simplify(pts[:2], 10) == pts[:2]
    loop = [(0.0, 0.0), (0.0, 0.0), (0.0, 0.0)]
    assert simplify(loop, 1) == [(0.0, 0.0), (0.0, 0.0)]


def test_overlap_fraction() -> None:
    a = Polyline(((30.0, -100.0), (30.0, -99.0)))
    same = Polyline(((30.0, -100.0), (30.0, -99.0)))
    half = Polyline(((30.0, -100.0), (30.0, -99.5), (31.0, -99.0)))
    far = Polyline(((35.0, -100.0), (35.0, -99.0)))
    assert overlap_fraction(a, same) == 1.0
    assert 0.4 < overlap_fraction(a, half) < 0.6
    assert overlap_fraction(a, far) == 0.0
