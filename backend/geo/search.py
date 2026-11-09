"""TomTom Search: autocomplete suggestions and reverse geocoding (US only)."""

from __future__ import annotations

import hashlib
from dataclasses import asdict, dataclass
from typing import Any
from urllib.parse import quote

from django.conf import settings

from core.http import get_json
from core.redis import get_json_value, set_json_value

BASE = "https://api.tomtom.com/search/2"
SUGGEST_TTL_S = 24 * 3600
REVERSE_TTL_S = 7 * 24 * 3600


@dataclass(frozen=True)
class Place:
    label: str
    detail: str
    lat: float
    lon: float
    kind: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _place(result: dict[str, Any]) -> Place:
    addr = result.get("address", {})
    pos = result["position"]
    poi = (result.get("poi") or {}).get("name")
    freeform = addr.get("freeformAddress", "")
    municipality = addr.get("municipality")
    state = addr.get("countrySubdivisionCode") or addr.get("countrySubdivision")
    if poi:
        label, detail = poi, freeform
    elif result.get("type") == "Geography" and municipality:
        label, detail = f"{municipality}, {state}" if state else municipality, "City"
    else:
        label = addr.get("streetNumber", "") + (" " if addr.get("streetNumber") else "")
        label = (label + addr.get("streetName", "")).strip() or freeform
        detail = ", ".join(p for p in (municipality, state) if p) or freeform
    return Place(label, detail, float(pos["lat"]), float(pos["lon"]), result.get("type", ""))


async def suggest(query: str, near: tuple[float, float] | None = None) -> list[Place]:
    q = " ".join(query.split())[:120]
    bias = f"{near[0]:.1f},{near[1]:.1f}" if near else "-"
    key = "geo:s:" + hashlib.sha1(f"{q.lower()}|{bias}".encode()).hexdigest()
    cached = await get_json_value(key)
    if cached is not None:
        return [Place(**p) for p in cached]
    params: dict[str, Any] = {
        "key": settings.TOMTOM_API_KEY,
        "typeahead": "true",
        "limit": 6,
        "countrySet": "US",
        "language": "en-US",
    }
    if near:
        params.update(lat=near[0], lon=near[1])
    data = await get_json(
        f"{BASE}/search/{quote(q, safe='')}.json", params=params, service="tomtom"
    )
    places: list[Place] = []
    seen: set[tuple[str, str]] = set()
    for r in data.get("results", []):
        if "position" not in r:
            continue
        place = _place(r)
        ident = (place.label.lower(), place.detail.lower())
        if ident not in seen:  # TomTom often returns the same city twice
            seen.add(ident)
            places.append(place)
    await set_json_value(key, [p.to_dict() for p in places], SUGGEST_TTL_S)
    return places


async def reverse(lat: float, lon: float) -> Place | None:
    key = f"geo:r:{lat:.4f}:{lon:.4f}"
    cached = await get_json_value(key)
    if cached is not None:
        return Place(**cached) if cached else None
    data = await get_json(
        f"{BASE}/reverseGeocode/{lat:.6f},{lon:.6f}.json",
        params={"key": settings.TOMTOM_API_KEY, "language": "en-US"},
        service="tomtom",
    )
    addresses = data.get("addresses") or []
    if not addresses:
        await set_json_value(key, {}, REVERSE_TTL_S)
        return None
    addr = addresses[0]["address"]
    city = addr.get("municipality")
    state = addr.get("countrySubdivisionCode") or addr.get("countrySubdivision")
    street = addr.get("streetNameAndNumber") or addr.get("street")
    place = Place(
        label=street or (f"{city}, {state}" if city else addr.get("freeformAddress", "")),
        detail=", ".join(p for p in (city, state) if p),
        lat=lat,
        lon=lon,
        kind="Reverse",
    )
    await set_json_value(key, place.to_dict(), REVERSE_TTL_S)
    return place
