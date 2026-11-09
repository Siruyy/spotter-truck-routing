"""Weather data shapes shared by providers."""

from __future__ import annotations

import math
from dataclasses import asdict, dataclass
from typing import Any

CELL_DEG = 0.1
HOUR_S = 3600

Cell = tuple[float, float]


def snap(lat: float, lon: float) -> Cell:
    """Snap a coordinate to the shared 0.1-degree forecast lattice."""
    return (round(round(lat / CELL_DEG) * CELL_DEG, 1), round(round(lon / CELL_DEG) * CELL_DEG, 1))


@dataclass(frozen=True)
class HourValues:
    wind_mph: float | None
    gust_mph: float | None
    rain_in_hr: float | None
    snow_in_hr: float | None
    temp_f: float | None
    visibility_mi: float | None
    weather_code: int | None

    @property
    def complete(self) -> bool:
        return None not in (self.wind_mph, self.rain_in_hr, self.snow_in_hr)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class CellForecast:
    """Hourly series for one lattice cell.

    `times[k]` is a UTC epoch hour; rate values at `times[k]` cover the hour
    ending at that instant (Open-Meteo "preceding hour" semantics).
    """

    provider: str
    fetched_at: int
    times: tuple[int, ...]
    wind_mph: tuple[float | None, ...]
    gust_mph: tuple[float | None, ...]
    rain_in_hr: tuple[float | None, ...]
    snow_in_hr: tuple[float | None, ...]
    temp_f: tuple[float | None, ...]
    visibility_mi: tuple[float | None, ...]
    weather_code: tuple[int | None, ...]
    utc_offset_s: int = 0
    timezone: str = "UTC"

    @property
    def end(self) -> int:
        return self.times[-1] if self.times else 0

    def index_for(self, epoch_s: float) -> int | None:
        """Row whose preceding hour contains `epoch_s` (ceil to the hour)."""
        if not self.times:
            return None
        k = math.ceil((epoch_s - self.times[0]) / HOUR_S)
        return k if 0 <= k < len(self.times) else None

    def at_index(self, k: int) -> HourValues:
        return HourValues(
            wind_mph=self.wind_mph[k],
            gust_mph=self.gust_mph[k],
            rain_in_hr=self.rain_in_hr[k],
            snow_in_hr=self.snow_in_hr[k],
            temp_f=self.temp_f[k],
            visibility_mi=self.visibility_mi[k],
            weather_code=self.weather_code[k],
        )

    def at(self, epoch_s: float) -> HourValues | None:
        k = self.index_for(epoch_s)
        return None if k is None else self.at_index(k)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> CellForecast:
        fields = {k: tuple(v) if isinstance(v, list) else v for k, v in data.items()}
        return cls(**fields)
