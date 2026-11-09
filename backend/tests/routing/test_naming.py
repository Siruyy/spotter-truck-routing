from routing.geometry import METERS_PER_MILE
from routing.naming import route_names

MI = METERS_PER_MILE


def test_names_prefer_distinctive_roads() -> None:
    a = [("I-35E", 300 * MI), ("US-287", 250 * MI), ("I-25", 100 * MI)]
    c = [("I-35E", 300 * MI), ("US-81", 200 * MI), ("I-25", 110 * MI)]
    names = route_names([a, c])
    assert names == ["US-287", "US-81"]


def test_names_fall_back_to_longest_and_mark_duplicates() -> None:
    same = [("I-35E", 300 * MI), ("I-70", 280 * MI)]
    assert route_names([same, same]) == ["I-35E & I-70", "I-35E & I-70 (alt)"]
    assert route_names([[]]) == [""]
