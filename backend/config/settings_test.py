"""Settings for the test suite: safe defaults, no external services required."""

import os

os.environ.setdefault("DJANGO_SECRET_KEY", "test-only-secret")
os.environ.setdefault("DATABASE_URL", "sqlite://:memory:")

from config.settings import *  # noqa: E402,F403
