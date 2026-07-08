"""Health check for the Python Runner service."""
from __future__ import annotations

import platform

SERVICE_NAME = "python-runner"
VERSION = "0.1.0"


def health() -> dict:
    """Return a JSON-serializable health payload.

    ``mock=True`` advertises that the runner defaults to the mock OpenJiuwen
    runtime — no real SDK key is required for P0 (PRD §10.1, runtime_and_sandbox §14.4).
    """
    return {
        "status": "ok",
        "service": SERVICE_NAME,
        "version": VERSION,
        "mock": True,
        "python": platform.python_version(),
    }
