"""Match demonstrable solutions against goals + constraints (mock)."""
from __future__ import annotations

from typing import Any, Dict


def handle(context: Dict[str, Any]) -> Dict[str, Any]:
    # P0 mock: deterministic solution catalogue. Real impl would score goals.
    return {
        "solutions": [
            "智能客服 Agent Demo",
            "售前需求分析 Workflow Demo",
            "知识库检索 Demo",
        ]
    }
