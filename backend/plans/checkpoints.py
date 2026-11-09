"""Checkpoint sampling along a route."""

from __future__ import annotations

from dataclasses import dataclass

from routing.geometry import METERS_PER_MILE, LatLon, Polyline, TimeProfile

ALLOWED_INTERVALS_MI = (10, 25, 50)


@dataclass(frozen=True)
class Checkpoint:
    index: int
    mile: float
    position: LatLon
    elapsed_s: float


def checkpoint_miles(length_mi: float, interval_mi: float) -> list[float]:
    """0, N, 2N, ... and the destination; drop a regular point closer than N/2 to the end."""
    if interval_mi <= 0:
        raise ValueError("interval must be positive")
    miles: list[float] = []
    m = 0.0
    while m < length_mi:
        miles.append(m)
        m += interval_mi
    if len(miles) > 1 and length_mi - miles[-1] < interval_mi / 2:
        miles.pop()
    miles.append(length_mi)
    return miles


def sample(polyline: Polyline, profile: TimeProfile, interval_mi: float) -> list[Checkpoint]:
    length_mi = polyline.length_m / METERS_PER_MILE
    out: list[Checkpoint] = []
    for i, mile in enumerate(checkpoint_miles(length_mi, interval_mi)):
        d = mile * METERS_PER_MILE
        out.append(
            Checkpoint(
                index=i,
                mile=mile,
                position=polyline.point_at(d),
                elapsed_s=profile.seconds_at(d),
            )
        )
    return out
