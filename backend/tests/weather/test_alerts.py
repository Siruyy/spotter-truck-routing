import httpx
import respx

from weather.alerts import URL, alert_cell, alerts_for_routes


def _feature(alert_id: str, severity: str, event: str) -> dict:
    return {
        "properties": {
            "id": alert_id,
            "event": event,
            "severity": severity,
            "headline": f"{event} in effect",
            "description": "Details",
            "instruction": None,
            "onset": "2026-11-10T12:00:00-06:00",
            "ends": "2026-11-11T12:00:00-06:00",
            "areaDesc": "Somewhere",
        }
    }


def test_alert_cell_snaps_to_quarter_degree() -> None:
    assert alert_cell(32.13, -96.88) == (32.25, -97.0)


@respx.mock
async def test_alerts_merge_filter_and_map_hits() -> None:
    def respond(req: httpx.Request) -> httpx.Response:
        point = req.url.params["point"]
        if point.startswith("32.75"):
            feats = [
                _feature("a1", "Severe", "High Wind Warning"),
                _feature("a2", "Minor", "Frost Advisory"),
            ]
        else:
            feats = [_feature("a1", "Severe", "High Wind Warning")]
        return httpx.Response(200, json={"features": feats})

    respx.get(URL).mock(side_effect=respond)
    alerts, partial = await alerts_for_routes(
        [("A", [(32.77, -96.8), (35.0, -98.0)]), ("B", [(32.76, -96.79)])]
    )
    assert not partial
    assert [a.id for a in alerts] == ["a1"]  # Minor filtered out, duplicates merged
    assert alerts[0].hits == {"A": [0, 1], "B": [0]}


@respx.mock
async def test_alerts_partial_on_upstream_error() -> None:
    respx.get(URL).mock(return_value=httpx.Response(500))
    alerts, partial = await alerts_for_routes([("A", [(40.0, -100.0)])])
    assert alerts == [] and partial
