"""Export a Markdown report aggregating goals/constraints/solutions/demo list."""
from __future__ import annotations

from typing import Any, Dict


def handle(context: Dict[str, Any]) -> Dict[str, Any]:
    goals = context.get("goals", [])
    constraints = context.get("constraints", [])
    solutions = context.get("solutions", [])
    demos = context.get("demo_list", [])

    lines: list[str] = ["# 售前需求分析报告", ""]
    lines += ["## 客户目标"] + [f"- {g}" for g in goals] + [""]
    lines += ["## 限制条件"] + [f"- {c}" for c in constraints] + [""]
    lines += ["## 匹配方案"] + [f"- {s}" for s in solutions] + [""]
    lines += ["## Demo 清单"] + [f"- {d}" for d in demos]

    return {"report": "\n".join(lines)}
