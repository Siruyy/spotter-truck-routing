import httpx
import respx

from geo import search

RESULTS = {
    "results": [
        {
            "type": "POI",
            "poi": {"name": "Love's Travel Stop"},
            "address": {"freeformAddress": "1 Main St, Amarillo, TX 79101"},
            "position": {"lat": 35.2, "lon": -101.8},
        },
        {
            "type": "Geography",
            "address": {
                "municipality": "Amarillo",
                "countrySubdivisionCode": "TX",
                "freeformAddress": "Amarillo, TX",
            },
            "position": {"lat": 35.22, "lon": -101.83},
        },
        {
            "type": "Point Address",
            "address": {
                "streetNumber": "500",
                "streetName": "S Polk St",
                "municipality": "Amarillo",
                "countrySubdivisionCode": "TX",
                "freeformAddress": "500 S Polk St, Amarillo, TX",
            },
            "position": {"lat": 35.21, "lon": -101.84},
        },
        {"type": "Street", "address": {}},  # no position -> skipped
    ]
}


@respx.mock
async def test_suggest_labels_and_caches() -> None:
    route = respx.get(url__startswith=f"{search.BASE}/search/").mock(
        return_value=httpx.Response(200, json=RESULTS)
    )
    places = await search.suggest("  amarillo  tx ", near=(35.0, -101.0))
    assert [(p.label, p.detail) for p in places] == [
        ("Love's Travel Stop", "1 Main St, Amarillo, TX 79101"),
        ("Amarillo, TX", "City"),
        ("500 S Polk St", "Amarillo, TX"),
    ]
    assert route.calls.last.request.url.params["countrySet"] == "US"
    again = await search.suggest("amarillo tx", near=(35.0, -101.0))
    assert again == places
    assert route.call_count == 1


@respx.mock
async def test_reverse_geocode_and_empty() -> None:
    respx.get(url__startswith=f"{search.BASE}/reverseGeocode/35.000000").mock(
        return_value=httpx.Response(
            200,
            json={
                "addresses": [
                    {
                        "address": {
                            "streetNameAndNumber": "100 Route 66",
                            "municipality": "Amarillo",
                            "countrySubdivisionCode": "TX",
                        }
                    }
                ]
            },
        )
    )
    respx.get(url__startswith=f"{search.BASE}/reverseGeocode/0.000000").mock(
        return_value=httpx.Response(200, json={"addresses": []})
    )
    place = await search.reverse(35.0, -101.0)
    assert place is not None and place.label == "100 Route 66" and place.detail == "Amarillo, TX"
    assert await search.reverse(0.0, 0.0) is None
    assert await search.reverse(0.0, 0.0) is None  # cached negative
