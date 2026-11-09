"""Django settings. All configuration comes from environment variables."""

from __future__ import annotations

import os
from pathlib import Path

import dj_database_url

BASE_DIR = Path(__file__).resolve().parent.parent


def env(name: str, default: str | None = None) -> str:
    value = os.environ.get(name, default)
    if value is None:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def env_bool(name: str, default: bool = False) -> bool:
    return env(name, str(default)).lower() in {"1", "true", "yes", "on"}


def env_int(name: str, default: int) -> int:
    return int(env(name, str(default)))


DEBUG = env_bool("DJANGO_DEBUG", False)
SECRET_KEY = env("DJANGO_SECRET_KEY", "dev-insecure-key-change-me" if DEBUG else None)
ALLOWED_HOSTS = [h.strip() for h in env("ALLOWED_HOSTS", "localhost,127.0.0.1").split(",")]
CSRF_TRUSTED_ORIGINS = [o.strip() for o in env("CSRF_TRUSTED_ORIGINS", "").split(",") if o.strip()]

INSTALLED_APPS = [
    "django.contrib.contenttypes",
    "django.contrib.staticfiles",
    "plans",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.middleware.common.CommonMiddleware",
    "core.middleware.ClientIPMiddleware",
]

ROOT_URLCONF = "config.urls"
ASGI_APPLICATION = "config.asgi.application"
WSGI_APPLICATION = "config.wsgi.application"

DATABASES = {
    "default": dj_database_url.parse(
        env("DATABASE_URL", f"sqlite:///{BASE_DIR / 'db.sqlite3'}"), conn_max_age=60
    )
}
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = False
USE_TZ = True
STATIC_URL = "static/"

# Behind Traefik/Cloudflare TLS termination.
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "strict-origin-when-cross-origin"
X_FRAME_OPTIONS = "DENY"
TRUST_CF_CONNECTING_IP = env_bool("TRUST_CF_CONNECTING_IP", not DEBUG)

# --- Integrations -----------------------------------------------------------
REDIS_URL = env("REDIS_URL", "redis://localhost:6379/0")
TOMTOM_API_KEY = env("TOMTOM_API_KEY", "")
TOMTOM_DAILY_LIMIT = env_int("TOMTOM_DAILY_LIMIT", 2000)
OPENMETEO_DAILY_LIMIT = env_int("OPENMETEO_DAILY_LIMIT", 9000)
FORECAST_PROVIDER = env("FORECAST_PROVIDER", "open-meteo")  # "open-meteo" | "nws"
FORECAST_TTL_S = env_int("FORECAST_TTL_S", 120 * 60)
NWS_USER_AGENT = env(
    "NWS_USER_AGENT", "TruckRoute/1.0 (+https://github.com/Siruyy/spotter-truck-routing)"
)
TARE_LB = env_int("TARE_LB", 35_000)
PLAN_TTL_S = env_int("PLAN_TTL_S", 6 * 3600)
RATE_LIMIT_PLANS_PER_MIN = env_int("RATE_LIMIT_PLANS_PER_MIN", 10)
RATE_LIMIT_SUGGEST_PER_MIN = env_int("RATE_LIMIT_SUGGEST_PER_MIN", 60)

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {"plain": {"format": "%(asctime)s %(levelname)s %(name)s %(message)s"}},
    "handlers": {"console": {"class": "logging.StreamHandler", "formatter": "plain"}},
    "root": {"handlers": ["console"], "level": env("LOG_LEVEL", "INFO")},
}
