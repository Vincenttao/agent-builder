"""Agent / Workflow run commands (Phase 5 §9.3).

Loads a generated project's Spec + tool/component handlers and runs it under
the mock OpenJiuwen adapter, returning the structured result
``{status, output, events, mock}`` (architecture Phase 5 §9.3, §11).

Stateless — no main-service memory dependency (P0 plan §9.4 checkpoint #5).
"""
from __future__ import annotations

import json
import os
import sys
from typing import Any, Dict

from .mock_openjiuwen import AgentAdapter, WorkflowAdapter


def _load_spec(project_path: str, kind: str) -> Dict[str, Any]:
    fname = "agent_spec.json" if kind == "agent" else "workflow_spec.json"
    with open(os.path.join(project_path, "config", fname), "r", encoding="utf-8") as f:
        return json.load(f)


def _ensure_project_on_path(project_path: str) -> None:
    abs_path = os.path.abspath(project_path)
    if abs_path not in sys.path:
        sys.path.insert(0, abs_path)


def run_agent(project_path: str, message: str) -> Dict[str, Any]:
    _ensure_project_on_path(project_path)
    spec = _load_spec(project_path, "agent")
    agent = AgentAdapter().create_agent(spec)
    # Two-turn flow per the system prompt: ask, then draw + interpret.
    agent.run("开始占卜")
    result = agent.run(message)
    return {
        "status": "success",
        "output": result,
        "events": result.get("tool_calls", []),
        "mock": True,
    }


def run_workflow(project_path: str, inputs: Dict[str, Any]) -> Dict[str, Any]:
    _ensure_project_on_path(project_path)
    spec = _load_spec(project_path, "workflow")
    workflow = WorkflowAdapter().create_workflow(spec)
    result = workflow.run(inputs)
    return {
        "status": result["status"],
        "output": result.get("output"),
        "events": result.get("node_results", []),
        "mock": True,
    }
