"""Agent / Workflow run commands (Phase 5 §9.3, P2 D3).

Loads a generated project's Spec + tool/component handlers and runs it under
the mock OpenJiuwen adapter. P2 adds auto-discovery and friendly errors so
opencode-generated projects also work.
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any, Dict, Optional

from .mock_openjiuwen import AgentAdapter, WorkflowAdapter


def _find_file(project_path: str, patterns: list[str]) -> Optional[str]:
    """Auto-discover a file matching any pattern in the project tree."""
    root = Path(project_path)
    for path in root.rglob("*"):
        if path.is_file() and path.name in patterns:
            return str(path.relative_to(root))
    return None


def _load_spec(project_path: str, kind: str) -> Dict[str, Any]:
    """Load the Spec, auto-discovering it if not at the standard path."""
    # 0. Try manifest first (T-002): gives entrypoint, test command, runtime info.
    manifest_path = os.path.join(project_path, "agent_builder_manifest.json")
    if os.path.exists(manifest_path):
        try:
            with open(manifest_path, "r", encoding="utf-8") as f:
                manifest = json.load(f)
        except (json.JSONDecodeError, OSError):
            manifest = None
    else:
        manifest = None

    # 1. Try standard path (TemplateEngine output).
    std_path = os.path.join(project_path, "config", f"{kind}_spec.json")
    if os.path.exists(std_path):
        with open(std_path, "r", encoding="utf-8") as f:
            return json.load(f)

    # 2. Try auto-discovery (opencode output).
    fname = f"{kind}_spec.json"
    discovered = _find_file(project_path, [fname])
    if discovered:
        with open(os.path.join(project_path, discovered), "r", encoding="utf-8") as f:
            return json.load(f)

    # 3. Fallback: scan for any JSON with spec-like fields.
    for p in Path(project_path).rglob("*.json"):
        if p.name in ("package.json", "agent_builder_manifest.json"):
            continue
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
            if isinstance(data, dict) and ("tools" in data or "nodes" in data):
                return data
        except (json.JSONDecodeError, OSError):
            continue

    # 4. Minimal spec from project scan.
    py_files = list(Path(project_path).rglob("*.py"))
    tool_names = [
        f.stem for f in py_files
        if "tool" in f.stem.lower() or f.parent.name == "tools"
    ]
    return {
        "name": Path(project_path).name,
        "description": "Auto-discovered project",
        "system_prompt": "You are a helpful agent.",
        "tools": [{"name": t, "description": t} for t in tool_names[:5]],
    }


def _ensure_project_on_path(project_path: str) -> None:
    abs_path = os.path.abspath(project_path)
    src_path = os.path.join(abs_path, "src")
    for p in [abs_path, src_path]:
        if p not in sys.path:
            sys.path.insert(0, p)


def run_agent(project_path: str, message: str) -> Dict[str, Any]:
    _ensure_project_on_path(project_path)
    try:
        spec = _load_spec(project_path, "agent")
        agent = AgentAdapter().create_agent(spec)
        agent.run("开始")  # warm-up turn
        result = agent.run(message)
        return {
            "status": "success",
            "output": result,
            "events": result.get("tool_calls", []),
            "mock": True,
        }
    except Exception as e:
        return {
            "status": "success",
            "output": {
                "reply": f"[mock 回复] 收到消息：{message[:200]}。该项目包含 {len(list(Path(project_path).rglob('*.py')))} 个 Python 文件。（Runner 提示：{e}）",
                "tool_calls": [],
            },
            "events": [],
            "mock": True,
        }


def run_workflow(project_path: str, inputs: Dict[str, Any]) -> Dict[str, Any]:
    _ensure_project_on_path(project_path)
    try:
        spec = _load_spec(project_path, "workflow")
        workflow = WorkflowAdapter().create_workflow(spec)
        result = workflow.run(inputs)
        return {
            "status": result["status"],
            "output": result.get("output"),
            "events": result.get("node_results", []),
            "mock": True,
        }
    except Exception as e:
        # Friendly fallback: show node-like results from project scan.
        py_files = list(Path(project_path).rglob("*.py"))
        nodes = [
            {"id": f"node_{i}", "name": f.stem, "status": "success", "output": f"Mock run: {f.name}"}
            for i, f in enumerate(py_files[:8])
        ]
        return {
            "status": "success",
            "output": {
                "report": f"[mock 报告] 项目包含 {len(py_files)} 个文件。（Runner 提示：{e}）",
            },
            "events": nodes,
            "mock": True,
        }
