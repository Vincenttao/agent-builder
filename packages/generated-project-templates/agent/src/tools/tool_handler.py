"""{{TOOL_NAME}} tool — generated from Agent Spec.

The mock runtime loads tools by name from src/tools/<name>.py; this module
exposes `handle(inputs) -> output` which the mock runtime calls.
"""
from __future__ import annotations

from typing import Any, Dict


def handle(inputs: Dict[str, Any] | None) -> Dict[str, Any]:
    """Mock handler for {{TOOL_NAME}} — returns a sensible placeholder result."""
    inputs = inputs or {}
    return {"result": "mock tool output", "received": inputs}
