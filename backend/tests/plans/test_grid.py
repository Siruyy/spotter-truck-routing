import pytest

from plans.grid import MAX_POINTS, corridor_grid, viewport_grid
from routing.geometry import METERS_PER_MILE, Polyline, haversine_m
from weather.models import snap


def test_corridor_grid_caps_points_and_stays_near_route() -> None:
    route = Polyline(((32.78, -96.8), (35.2, -101.8), (39.74, -104.99)))
    samples = route.densified(15_000)
    grid = corridor_grid(samples)
    assert 0 < len(grid.points) <= MAX_POINTS
    for p in grid.points:
        assert snap(*p) == p  # on the shared forecast lattice
        assert min(haversine_m(p, s) for s in samples) <= 60 * METERS_PER_MILE + 1


def test_corridor_grid_short_route_uses_fine_spacing() -> None:
    grid = corridor_grid(Polyline(((40.0, -100.0), (40.0, -99.9))).densified(5_000))
    assert grid.spacing >= 0.1 and len(grid.points) <= MAX_POINTS


def test_corridor_requires_samples() -> None:
    with pytest.raises(ValueError):
        corridor_grid([])


def test_viewport_grid_validation_and_cap() -> None:
    grid = viewport_grid((-105.0, 35.0, -95.0, 42.0))
    assert len(grid.points) <= MAX_POINTS
    with pytest.raises(ValueError):
        viewport_grid((-95.0, 35.0, -105.0, 42.0))
    with pytest.raises(ValueError):
        viewport_grid((-130.0, 10.0, -60.0, 60.0))
