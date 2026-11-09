"""Request schemas (validated at the API boundary)."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from ninja import Schema
from pydantic import Field, field_validator


class PlaceIn(Schema):
    label: str = Field(min_length=1, max_length=200)
    detail: str = Field(default="", max_length=200)
    lat: float = Field(ge=18.0, le=72.0)  # US incl. Alaska/Hawaii latitudes
    lon: float = Field(ge=-180.0, le=-60.0)


class PlanIn(Schema):
    origin: PlaceIn
    destination: PlaceIn
    departure_at: datetime
    load_lb: float = Field(ge=0, le=50_000)
    interval_mi: Literal[10, 25, 50] = 25

    @field_validator("departure_at")
    @classmethod
    def must_be_aware(cls, v: datetime) -> datetime:
        if v.tzinfo is None:
            raise ValueError("departure_at must include a timezone offset")
        return v


class ShareIn(Schema):
    interval_mi: Literal[10, 25, 50] = 25
