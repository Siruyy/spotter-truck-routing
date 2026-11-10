"""HTTP API (Django Ninja, async). Thin layer: validate, rate-limit, delegate."""

from __future__ import annotations

import logging
from typing import Any

from asgiref.sync import sync_to_async
from django.conf import settings
from django.db import connection
from django.http import HttpRequest, HttpResponse
from ninja import NinjaAPI, Query
from ninja.errors import ValidationError as NinjaValidationError

from core.errors import AppError
from core.quota import enforce_rate_limit
from core.redis import get_redis
from geo import search
from plans import service
from plans.checkpoints import ALLOWED_INTERVALS_MI
from plans.schemas import PlanIn, ShareIn

logger = logging.getLogger(__name__)

api = NinjaAPI(title="TruckRoute API", version="1.0", docs_url="/docs", urls_namespace="api")


def _error(request: HttpRequest, status: int, code: str, message: str) -> HttpResponse:
    return api.create_response(
        request, {"error": {"code": code, "message": message}}, status=status
    )


@api.exception_handler(AppError)
def on_app_error(request: HttpRequest, exc: AppError) -> HttpResponse:
    return _error(request, exc.status, exc.code, exc.message)


@api.exception_handler(NinjaValidationError)
def on_validation_error(request: HttpRequest, exc: NinjaValidationError) -> HttpResponse:
    first = exc.errors[0] if exc.errors else {}
    loc = ".".join(str(p) for p in first.get("loc", []) if p not in {"body", "query", "payload"})
    msg = first.get("msg", "Invalid input")
    return _error(request, 422, "invalid_input", f"{loc}: {msg}" if loc else msg)


@api.exception_handler(Exception)
def on_unexpected(request: HttpRequest, exc: Exception) -> HttpResponse:
    logger.exception("unhandled error")
    return _error(request, 500, "internal_error", "Something went wrong. Please try again.")


def _ip(request: HttpRequest) -> str:
    return getattr(request, "client_ip", request.META.get("REMOTE_ADDR", "unknown"))


@api.get("/geocode/suggest")
async def geocode_suggest(
    request: HttpRequest,
    q: str = Query(..., min_length=2, max_length=120),
    lat: float | None = Query(None, ge=-90, le=90),
    lon: float | None = Query(None, ge=-180, le=180),
) -> dict[str, Any]:
    await enforce_rate_limit("suggest", _ip(request), settings.RATE_LIMIT_SUGGEST_PER_MIN)
    near = (lat, lon) if lat is not None and lon is not None else None
    places = await search.suggest(q, near)
    return {"results": [p.to_dict() for p in places]}


@api.get("/geocode/reverse")
async def geocode_reverse(
    request: HttpRequest,
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
) -> dict[str, Any]:
    await enforce_rate_limit("suggest", _ip(request), settings.RATE_LIMIT_SUGGEST_PER_MIN)
    place = await search.reverse(lat, lon)
    return {"result": None if place is None else place.to_dict()}


@api.post("/plans")
async def create_plan(request: HttpRequest, payload: PlanIn) -> dict[str, Any]:
    await enforce_rate_limit("plans", _ip(request), settings.RATE_LIMIT_PLANS_PER_MIN)
    depart = service.validate_departure(payload.departure_at)
    return await service.create_plan(
        service.PlanRequest(
            origin=payload.origin.dict(),
            destination=payload.destination.dict(),
            departure_epoch=depart,
            load_lb=payload.load_lb,
            interval_mi=payload.interval_mi,
        )
    )


@api.get("/plans/{plan_id}")
async def get_plan(request: HttpRequest, plan_id: str, interval_mi: int = 25) -> dict[str, Any]:
    if interval_mi not in ALLOWED_INTERVALS_MI:
        raise AppError("interval_mi must be 10, 25 or 50.", code="invalid_input", status=422)
    return await service.resample_plan(plan_id, interval_mi)


@api.get("/plans/{plan_id}/heatmap")
async def plan_heatmap(request: HttpRequest, plan_id: str) -> dict[str, Any]:
    return await service.plan_heatmap(plan_id)


@api.get("/plans/{plan_id}/alerts")
async def plan_alerts(request: HttpRequest, plan_id: str) -> dict[str, Any]:
    return await service.plan_alerts(plan_id)


@api.post("/plans/{plan_id}/share")
async def share_plan(request: HttpRequest, plan_id: str, payload: ShareIn) -> dict[str, Any]:
    await enforce_rate_limit("share", _ip(request), settings.RATE_LIMIT_PLANS_PER_MIN)
    slug = await service.share_plan(plan_id, payload.interval_mi)
    return {"slug": slug}


@api.get("/shared/{slug}")
async def get_shared(request: HttpRequest, slug: str) -> dict[str, Any]:
    if not slug.replace("-", "").replace("_", "").isalnum() or len(slug) > 16:
        raise AppError("Invalid link.", code="invalid_slug")
    return await service.get_shared(slug)


@api.get("/weather/point")
async def weather_point(
    request: HttpRequest,
    lat: float = Query(..., ge=18, le=72),
    lon: float = Query(..., ge=-180, le=-60),
    hours: int = Query(12, ge=1, le=24),
    load_lb: float | None = Query(None, ge=0, le=50_000),
) -> dict[str, Any]:
    await enforce_rate_limit("suggest", _ip(request), settings.RATE_LIMIT_SUGGEST_PER_MIN)
    return await service.point_conditions(lat, lon, hours, load_lb)


@api.get("/heatmap")
async def viewport_heatmap(
    request: HttpRequest,
    bbox: str = Query(..., description="west,south,east,north"),
    load_lb: float | None = Query(None, ge=0, le=50_000),
) -> dict[str, Any]:
    await enforce_rate_limit("heatmap", _ip(request), settings.RATE_LIMIT_SUGGEST_PER_MIN)
    try:
        w, s, e, n = (float(x) for x in bbox.split(","))
    except ValueError as exc:
        raise AppError(
            "bbox must be four numbers: west,south,east,north", code="invalid_bbox"
        ) from exc
    return await service.viewport_heatmap((w, s, e, n), load_lb)


@sync_to_async
def _db_ok() -> bool:
    try:
        with connection.cursor() as cur:
            cur.execute("SELECT 1")
        return True
    except Exception:
        return False


@api.get("/health")
async def health(request: HttpRequest) -> dict[str, Any]:
    try:
        redis_ok = bool(await get_redis().ping())
    except Exception:
        redis_ok = False
    db_ok = await _db_ok()
    return {"status": "ok" if redis_ok and db_ok else "degraded", "redis": redis_ok, "db": db_ok}
