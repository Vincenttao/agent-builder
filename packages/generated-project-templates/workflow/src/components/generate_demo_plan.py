"""Generate a Demo list from the matched solutions (mock)."""
from __future__ import annotations

from typing import Any, Dict


def handle(context: Dict[str, Any]) -> Dict[str, Any]:
    solutions = context.get("solutions", [])
    return {"demo_list": [f"Demo {i + 1}: {s}" for i, s in enumerate(solutions)]}
