import pytest

from plans.grid import MAX_POINTS, area_grid, viewport_grid
from routing.geometry import Polyline
from weather.models import snap


def _samples():
    return Polyline(((32.78, -96.8), (35.2, -101.8), (39.74, -104.99))).densified(15_000)


def test_area_grid_covers_whole_padded_area_without_gaps() -> None:
    samples = _samples()
    grid = area_grid(samples)
    assert 0 < len(grid.points) <= MAX_POINTS
    w, s, e, n = grid.bbox
    assert w < -104.99 - 0.9 and e > -96.8 + 0.9 and s < 32.78 - 0.9 and n > 39.74 + 0.9
    # A regular lattice: every row has the same number of points (no corridor holes).
    rows: dict[float, int] = {}
    for lat, _ in grid.points:
        rows[lat] = rows.get(lat, 0) + 1
    assert len(set(rows.values())) == 1
    assert all(snap(*p) == p for p in grid.points)


def test_area_grid_adds_route_cells_without_duplicates() -> None:
    samples = _samples()
    coarse = area_grid(samples)
    on_lattice = coarse.points[0]
    fine = [(33.1, -97.2), (33.1, -97.2), on_lattice]
    grid = area_grid(samples, fine)
    assert grid.fine == ((33.1, -97.2),)


def test_area_grid_requires_samples() -> None:
    with pytest.raises(ValueError):
        area_grid([])


def test_viewport_grid_validation_and_cap() -> None:
    grid = viewport_grid((-105.0, 35.0, -95.0, 42.0))
    assert len(grid.points) <= MAX_POINTS and grid.fine == ()
    with pytest.raises(ValueError):
        viewport_grid((-95.0, 35.0, -105.0, 42.0))
    with pytest.raises(ValueError):
        viewport_grid((-130.0, 10.0, -60.0, 60.0))
