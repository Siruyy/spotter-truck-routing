"""Resolve the real client IP behind Cloudflare and Traefik."""

from __future__ import annotations

from collections.abc import Awaitable, Callable

from asgiref.sync import iscoroutinefunction, markcoroutinefunction
from django.conf import settings
from django.http import HttpRequest, HttpResponse


def client_ip(request: HttpRequest) -> str:
    meta = request.META
    if settings.TRUST_CF_CONNECTING_IP:
        cf = meta.get("HTTP_CF_CONNECTING_IP")
        if cf:
            return cf.strip()
        forwarded = meta.get("HTTP_X_FORWARDED_FOR")
        if forwarded:
            return forwarded.split(",")[0].strip()
    return meta.get("REMOTE_ADDR", "unknown")


class ClientIPMiddleware:
    async_capable = True
    sync_capable = False

    def __init__(self, get_response: Callable[[HttpRequest], Awaitable[HttpResponse]]):
        self.get_response = get_response
        if iscoroutinefunction(self.get_response):
            markcoroutinefunction(self)

    async def __call__(self, request: HttpRequest) -> HttpResponse:
        request.client_ip = client_ip(request)  # type: ignore[attr-defined]
        return await self.get_response(request)
