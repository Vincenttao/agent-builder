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


def _load_manifest(project_path: str) -> Optional[Dict[str, Any]]:
    """Load agent_builder_manifest.json if present (T-002 / P3-005)."""
    manifest_path = os.path.join(project_path, "agent_builder_manifest.json")
    if not os.path.exists(manifest_path):
        return None
    try:
        with open(manifest_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        return None


def _find_file(project_path: str, patterns: list[str]) -> Optional[str]:
    """Auto-discover a file matching any pattern in the project tree."""
    root = Path(project_path)
    for path in root.rglob("*"):
        if path.is_file() and path.name in patterns:
            return str(path.relative_to(root))
    return None


def _load_spec(project_path: str, kind: str) -> Dict[str, Any]:
    """Load the Spec, auto-discovering it if not at the standard path."""
    manifest = _load_manifest(project_path)

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

    # 3. P3-005: if the manifest names an entrypoint, search its directory tree
    # for a spec file (opencode projects may co-locate spec + entrypoint).
    if manifest and isinstance(manifest.get("entrypoint"), str):
        entry_abs = os.path.join(project_path, manifest["entrypoint"])
        entry_dir = os.path.dirname(entry_abs)
        if os.path.isdir(entry_dir):
            for root, _, files in os.walk(entry_dir):
                if fname in files:
                    with open(os.path.join(root, fname), "r", encoding="utf-8") as f:
                        return json.load(f)

    # 4. Fallback: scan for any JSON with spec-like fields.
    for p in Path(project_path).rglob("*.json"):
        if p.name in ("package.json", "agent_builder_manifest.json"):
            continue
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
            if isinstance(data, dict) and ("tools" in data or "nodes" in data):
                return data
        except (json.JSONDecodeError, OSError):
            continue

    # 5. Minimal spec from project scan.
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
    # P3-005: fall back to the manifest's example_input when no message given.
    if not message or not message.strip():
        manifest = _load_manifest(project_path)
        if manifest and isinstance(manifest.get("example_input"), str):
            message = manifest["example_input"]
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
            "mode": "mock",
        }
    except Exception as e:
        # T-006: distinguish intentional mock from fallback after real failure.
        return {
            "status": "fallback",
            "output": {
                "reply": f"[mock 回复] 收到消息：{message[:200]}。该项目包含 {len(list(Path(project_path).rglob('*.py')))} 个 Python 文件。（Runner 提示：{e}）",
                "tool_calls": [],
            },
            "events": [],
            "mock": True,
            "mode": "mock_fallback",
            "fallback_reason": str(e)[:500],
        }


def run_workflow(project_path: str, inputs: Dict[str, Any]) -> Dict[str, Any]:
    _ensure_project_on_path(project_path)
    # P3-005: fall back to the manifest's example_input when inputs are empty.
    if not inputs:
        manifest = _load_manifest(project_path)
        if manifest and isinstance(manifest.get("example_input"), dict):
            inputs = manifest["example_input"]
    try:
        spec = _load_spec(project_path, "workflow")
        workflow = WorkflowAdapter().create_workflow(spec)
        result = workflow.run(inputs)
        return {
            "status": result["status"],
            "output": result.get("output"),
            "events": result.get("node_results", []),
            "mock": True,
            "mode": "mock",
        }
    except Exception as e:
        # T-006: friendly fallback with explicit status.
        py_files = list(Path(project_path).rglob("*.py"))
        nodes = [
            {"id": f"node_{i}", "name": f.stem, "status": "success", "output": f"Mock run: {f.name}"}
            for i, f in enumerate(py_files[:8])
        ]
        return {
            "status": "fallback",
            "output": {
                "report": f"[mock 报告] 项目包含 {len(py_files)} 个文件。（Runner 提示：{e}）",
            },
            "events": nodes,
            "mock": True,
            "mode": "mock_fallback",
            "fallback_reason": str(e)[:500],
        }
