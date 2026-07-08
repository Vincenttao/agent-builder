"""Extract customer goals + constraints from the requirement doc (mock)."""
from __future__ import annotations

from typing import Any, Dict


def handle(context: Dict[str, Any]) -> Dict[str, Any]:
    doc = str(context.get("requirement_doc", "") or "")
    goals = ["提升客户服务效率", "快速演示能力"]
    constraints = ["预算有限", "需要两周内上线"]
    if doc:
        goals.append("满足客户文档中的核心诉求")
    return {"goals": goals, "constraints": constraints}
