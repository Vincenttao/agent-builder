"""Health check for the Python Runner service."""
from __future__ import annotations

import platform

SERVICE_NAME = "python-runner"
VERSION = "0.1.0"


def health() -> dict:
    """Return a JSON-serializable health payload."""
    return {
        "status": "ok",
        "service": SERVICE_NAME,
        "version": VERSION,
        "python": platform.python_version(),
    }
