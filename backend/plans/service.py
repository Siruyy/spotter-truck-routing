"""Plan orchestration: routes -> checkpoints -> forecasts -> risk -> recommendation.

Plan state (routes, geometry, timing) is kept in Redis so re-sampling at a new
checkpoint spacing, the heatmap and alerts never call the routing API again.
"""

from __future__ import annotations

import math
import secrets
import time
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from django.conf import settings

from core.errors import AppError, NotFound
from core.redis import get_json_value, set_json_value
from plans.checkpoints import Checkpoint, sample
from plans.evaluate import (
    DEPARTURE_OFFSETS_H,
    EvaluatedRoute,
    best_departure,
    describe_improvement,
    evaluate_route,
    score_dict,
)
from plans.grid import Grid, corridor_grid, viewport_grid
from plans.models import SharedPlan
from risk.rules import Conditions, assess
from risk.scoring import recommend
from routing.alternatives import three_routes
from routing.geometry import METERS_PER_MILE, LatLon, Polyline, TimeProfile, simplify
from routing.naming import route_names
from routing.tomtom import RawRoute
from weather.alerts import alerts_for_routes
from weather.models import HOUR_S, Cell, CellForecast, snap
from weather.service import ForecastSet, get_forecasts

ROUTE_IDS = ("A", "B", "C")
SAMPLING_TOLERANCE_M = 15.0
DISPLAY_TOLERANCE_M = 35.0
HEATMAP_HOURS = 49  # 0..48 inclusive
DEPARTURE_WINDOW_S = 48 * HOUR_S
PAST_GRACE_S = 15 * 60


@dataclass(frozen=True)
class PlanRequest:
    origin: dict[str, Any]
    destination: dict[str, Any]
    departure_epoch: float
    load_lb: float
    interval_mi: int


def _plan_key(plan_id: str) -> str:
    return f"plan:{plan_id}"


def validate_departure(departure: datetime, now: float | None = None) -> float:
    now = time.time() if now is None else now
    epoch = departure.timestamp()
    if epoch < now - PAST_GRACE_S:
        raise AppError("Departure time is in the past.", code="departure_in_past")
    if epoch > now + DEPARTURE_WINDOW_S:
        raise AppError("Departure must be within the next 48 hours.", code="departure_too_late")
    return max(epoch, now)


def _store_route(rid: str, raw: RawRoute, name: str) -> dict[str, Any]:
    pts = simplify(raw.polyline.points, SAMPLING_TOLERANCE_M)
    simplified = Polyline(tuple(pts))
    scale = simplified.length_m / raw.polyline.length_m
    profile = raw.time_profile
    return {
        "id": rid,
        "name": name,
        "length_m": raw.length_m,
        "duration_s": raw.duration_s,
        "traffic_delay_s": raw.traffic_delay_s,
        "points": [[round(p[0], 6), round(p[1], 6)] for p in pts],
        "profile": {
            "o": [round(o * scale, 1) for o in profile.offsets_m],
            "s": list(profile.seconds),
        },
    }


@dataclass(frozen=True)
class LoadedRoute:
    data: dict[str, Any]
    polyline: Polyline
    profile: TimeProfile


def _load_route(data: dict[str, Any]) -> LoadedRoute:
    poly = Polyline(tuple((p[0], p[1]) for p in data["points"]))
    prof = TimeProfile(tuple(data["profile"]["o"]), tuple(data["profile"]["s"]))
    return LoadedRoute(data, poly, prof)


async def _forecasts_for(
    checkpoints: list[list[Checkpoint]], routes: list[LoadedRoute], depart: float
) -> ForecastSet:
    cells = [snap(*cp.position) for cps in checkpoints for cp in cps]
    longest = max(r.data["duration_s"] for r in routes)
    until = depart + longest + max(DEPARTURE_OFFSETS_H) * HOUR_S + HOUR_S
    return await get_forecasts(cells, until=until)


def _checkpoint_json(ev: Any) -> dict[str, Any]:
    cp = ev.checkpoint
    return {
        "i": cp.index,
        "mile": round(cp.mile, 1),
        "lat": round(cp.position[0], 5),
        "lon": round(cp.position[1], 5),
        "eta": round(ev.eta),
        "tz": ev.timezone,
        "level": None if ev.level is None else int(ev.level),
        "factor": ev.factor,
        "gust_advisory": ev.gust_advisory,
        "weather": None if ev.weather is None else ev.weather.to_dict(),
    }


def _route_json(route: LoadedRoute, ev: EvaluatedRoute, depart: float) -> dict[str, Any]:
    d = route.data
    display = simplify(route.polyline.points, DISPLAY_TOLERANCE_M)
    last = ev.checkpoints[-1]
    return {
        "id": d["id"],
        "name": d["name"],
        "distance_mi": round(d["length_m"] / METERS_PER_MILE, 1),
        "duration_s": round(d["duration_s"]),
        "traffic_delay_s": round(d["traffic_delay_s"]),
        "departure": round(depart),
        "arrival": round(depart + d["duration_s"]),
        "arrival_tz": last.timezone,
        "geometry": [[round(p[1], 5), round(p[0], 5)] for p in display],  # GeoJSON lon,lat
        "score": score_dict(ev.score),
        "checkpoints": [_checkpoint_json(e) for e in ev.checkpoints],
    }


async def _render(state: dict[str, Any], interval_mi: int) -> dict[str, Any]:
    req = state["request"]
    depart = float(req["departure_epoch"])
    load = float(req["load_lb"])
    routes = [_load_route(r) for r in state["routes"]]
    checkpoints = [sample(r.polyline, r.profile, interval_mi) for r in routes]
    forecasts = await _forecasts_for(checkpoints, routes, depart)
    evaluated = [
        evaluate_route(cps, r.data["duration_s"], depart, load, forecasts.cells)
        for cps, r in zip(checkpoints, routes, strict=True)
    ]
    scores = [e.score for e in evaluated]
    rec = recommend(scores)
    suggestion = best_departure(
        [(cps, r.data["duration_s"]) for cps, r in zip(checkpoints, routes, strict=True)],
        depart,
        load,
        forecasts.cells,
        scores[rec.index],
        latest_allowed_epoch=time.time() + DEPARTURE_WINDOW_S,
    )
    notices: list[str] = []
    if len(routes) < len(ROUTE_IDS):
        notices.append(f"Only {len(routes)} distinct truck route(s) found for this trip.")
    if any(s.unknown_mi > 0 for s in scores):
        notices.append("Part of the trip is beyond the available forecast.")
    return {
        "id": state["id"],
        "created_at": state["created_at"],
        "request": {**req, "interval_mi": interval_mi},
        "routes": [_route_json(r, e, depart) for r, e in zip(routes, evaluated, strict=True)],
        "recommendation": {
            "route_id": routes[rec.index].data["id"],
            "reason": rec.reason,
            "runner_up_id": None if rec.runner_up is None else routes[rec.runner_up].data["id"],
        },
        "departure_suggestion": None
        if suggestion is None
        else {
            "offset_h": suggestion.offset_h,
            "departure": round(suggestion.depart_epoch),
            "route_id": routes[suggestion.route_index].data["id"],
            "summary": describe_improvement(suggestion),
            "score": score_dict(suggestion.score),
        },
        "weather": {"provider": forecasts.provider, "stale_as_of": forecasts.stale_as_of},
        "notices": notices,
    }


async def create_plan(req: PlanRequest) -> dict[str, Any]:
    origin = (float(req.origin["lat"]), float(req.origin["lon"]))
    dest = (float(req.destination["lat"]), float(req.destination["lon"]))
    raw_routes = await three_routes(
        origin,
        dest,
        depart_at=datetime.fromtimestamp(req.departure_epoch, tz=UTC),
        load_lb=req.load_lb,
    )
    state = {
        "id": secrets.token_urlsafe(9),
        "created_at": round(time.time()),
        "request": {
            "origin": req.origin,
            "destination": req.destination,
            "departure_epoch": round(req.departure_epoch),
            "load_lb": req.load_lb,
            "interval_mi": req.interval_mi,
        },
        "routes": [
            _store_route(rid, r, name)
            for rid, r, name in zip(
                ROUTE_IDS, raw_routes, route_names([r.roads for r in raw_routes]), strict=False
            )
        ],
    }
    await set_json_value(_plan_key(state["id"]), state, settings.PLAN_TTL_S)
    return await _render(state, req.interval_mi)


async def _state(plan_id: str) -> dict[str, Any]:
    state = await get_json_value(_plan_key(plan_id))
    if state is None:
        raise NotFound("This plan has expired. Please plan the trip again.")
    return dict(state)


async def resample_plan(plan_id: str, interval_mi: int) -> dict[str, Any]:
    return await _render(await _state(plan_id), interval_mi)


# --- Heatmap ---------------------------------------------------------------


def _round_or(v: float | None, nd: int) -> float:
    return -1 if v is None else round(v, nd)


def heatmap_payload(
    grid: Grid, forecasts: dict[Cell, CellForecast], load_lb: float | None, start: int
) -> dict[str, Any]:
    n = len(grid.points)
    risk: list[int] = [-1] * (n * HEATMAP_HOURS)
    wind: list[float] = [-1] * (n * HEATMAP_HOURS)
    rain: list[float] = [-1] * (n * HEATMAP_HOURS)
    snow: list[float] = [-1] * (n * HEATMAP_HOURS)
    for p, point in enumerate(grid.points):
        fc = forecasts.get(snap(*point))
        if fc is None:
            continue
        for h in range(HEATMAP_HOURS):
            k = fc.index_for(start + h * HOUR_S)
            if k is None:
                continue
            v = fc.at_index(k)
            idx = h * n + p
            wind[idx] = _round_or(v.wind_mph, 1)
            rain[idx] = _round_or(v.rain_in_hr, 3)
            snow[idx] = _round_or(v.snow_in_hr, 3)
            if v.complete:
                risk[idx] = int(
                    assess(
                        Conditions(v.wind_mph or 0, v.rain_in_hr or 0, v.snow_in_hr or 0),
                        load_lb or 0,
                    ).level
                )
    return {
        "start": start,
        "hours": HEATMAP_HOURS,
        "spacing": grid.spacing,
        "bbox": list(grid.bbox),
        "points": [[p[0], p[1]] for p in grid.points],
        "layers": {"risk": risk, "wind": wind, "rain": rain, "snow": snow},
        "load_applied": load_lb is not None,
    }


async def _heatmap_for(grid: Grid, load_lb: float | None) -> dict[str, Any]:
    start = math.floor(time.time() / HOUR_S) * HOUR_S
    until = start + (HEATMAP_HOURS - 1) * HOUR_S
    fs = await get_forecasts([snap(*p) for p in grid.points], until=until, allow_nws_fallback=False)
    payload = heatmap_payload(grid, fs.cells, load_lb, start)
    payload["provider"] = fs.provider
    payload["stale_as_of"] = fs.stale_as_of
    return payload


async def plan_heatmap(plan_id: str) -> dict[str, Any]:
    state = await _state(plan_id)
    samples: list[LatLon] = []
    for r in state["routes"]:
        samples.extend(_load_route(r).polyline.densified(15_000))
    return await _heatmap_for(corridor_grid(samples), float(state["request"]["load_lb"]))


async def viewport_heatmap(
    bbox: tuple[float, float, float, float], load_lb: float | None
) -> dict[str, Any]:
    try:
        grid = viewport_grid(bbox)
    except ValueError as exc:
        raise AppError(str(exc), code="invalid_bbox") from exc
    return await _heatmap_for(grid, load_lb)


# --- Alerts ----------------------------------------------------------------


async def plan_alerts(plan_id: str) -> dict[str, Any]:
    state = await _state(plan_id)
    interval = int(state["request"]["interval_mi"])
    routes = []
    for r in state["routes"]:
        loaded = _load_route(r)
        cps = sample(loaded.polyline, loaded.profile, interval)
        routes.append((r["id"], [cp.position for cp in cps]))
    alerts, partial = await alerts_for_routes(routes)
    return {"alerts": [a.to_dict() for a in alerts], "partial": partial}


# --- Sharing ---------------------------------------------------------------


async def share_plan(plan_id: str, interval_mi: int) -> str:
    snapshot = await _render(await _state(plan_id), interval_mi)
    slug = secrets.token_urlsafe(8)[:10]
    await SharedPlan.objects.acreate(slug=slug, payload=snapshot)
    return slug


async def get_shared(slug: str) -> dict[str, Any]:
    try:
        shared = await SharedPlan.objects.aget(slug=slug)
    except SharedPlan.DoesNotExist as exc:
        raise NotFound("This shared trip does not exist.") from exc
    return {"slug": shared.slug, "shared_at": shared.created_at.isoformat(), "plan": shared.payload}
