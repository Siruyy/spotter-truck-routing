from __future__ import annotations


class AppError(Exception):
    """An error with a stable machine code and a user-safe message."""

    status = 400
    code = "bad_request"

    def __init__(self, message: str, *, code: str | None = None, status: int | None = None):
        super().__init__(message)
        self.message = message
        if code is not None:
            self.code = code
        if status is not None:
            self.status = status


class UpstreamError(AppError):
    status = 502
    code = "upstream_error"


class QuotaExceeded(AppError):
    status = 429
    code = "quota_exceeded"


class NotFound(AppError):
    status = 404
    code = "not_found"


class NoRouteFound(AppError):
    status = 422
    code = "no_route"
