"""Agent / Workflow run commands.

The runner executes the generated project's own manifest entrypoint. It does
not synthesize mock replies, execute a generic spec adapter, or fall back to
placeholder output. If the generated project does not expose the required
entrypoint function, the run fails loudly.
"""
from __future__ import annotations

import importlib.util
import inspect
import json
import os
import sys
from typing import Any, Dict


def _load_manifest(project_path: str) -> Dict[str, Any]:
    manifest_path = os.path.join(project_path, "agent_builder_manifest.json")
    if not os.path.exists(manifest_path):
        raise RuntimeError("项目缺少 agent_builder_manifest.json")
    with open(manifest_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, dict):
        raise RuntimeError("agent_builder_manifest.json 必须是 JSON object")
    return data


def _ensure_project_on_path(project_path: str) -> None:
    abs_path = os.path.abspath(project_path)
    src_path = os.path.join(abs_path, "src")
    for p in [abs_path, src_path]:
        if p not in sys.path:
            sys.path.insert(0, p)


def _manifest_entrypoint(project_path: str, kind: str) -> str:
    manifest = _load_manifest(project_path)
    if manifest.get("project_type") != kind:
        raise RuntimeError(f"manifest project_type 必须是 {kind}")
    entrypoint = manifest.get("entrypoint")
    if not isinstance(entrypoint, str) or not entrypoint.endswith(".py"):
        raise RuntimeError("manifest entrypoint 必须指向 Python 文件")

    path = os.path.abspath(os.path.join(project_path, entrypoint))
    root = os.path.abspath(project_path)
    if os.path.commonpath([root, path]) != root:
        raise RuntimeError("manifest entrypoint 不能指向项目目录外")
    if not os.path.exists(path):
        raise RuntimeError(f"manifest entrypoint 不存在：{entrypoint}")
    return path


def _load_entrypoint_module(project_path: str, kind: str):
    entrypoint = _manifest_entrypoint(project_path, kind)
    module_name = f"_agent_builder_{kind}_{abs(hash(entrypoint))}"
    spec = importlib.util.spec_from_file_location(module_name, entrypoint)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"无法加载入口文件：{entrypoint}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _jsonable(value: Any) -> Any:
    if hasattr(value, "data"):
        return _jsonable(getattr(value, "data"))
    if isinstance(value, dict):
        return {str(k): _jsonable(v) for k, v in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [_jsonable(v) for v in value]
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    return repr(value)


def _call_function(func, arg: Any) -> Any:
    sig = inspect.signature(func)
    if not sig.parameters:
        return func()
    return func(arg)


def _normalise_agent_output(raw: Any) -> Dict[str, Any]:
    # Unwrap openjiuwen invoke() shape: {"output": ..., "result_type": ...}
    if isinstance(raw, dict) and isinstance(raw.get("output"), dict) and "status" in raw:
        return _normalise_agent_output(raw["output"])

    # P4 M6: agent returns {"reply": str, "tool_calls": list, "trace": list}
    if isinstance(raw, dict) and ("reply" in raw or "tool_calls" in raw or "trace" in raw):
        tool_calls = _jsonable(raw.get("tool_calls", []))
        trace = raw.get("trace")
        if trace is None and tool_calls:
            # Convert legacy tool_calls to trace format
            trace = _tool_calls_to_trace(tool_calls)
        return {
            "reply": str(raw.get("reply", "")),
            "tool_calls": tool_calls,
            "trace": _jsonable(trace) if trace else [],
        }

    if isinstance(raw, str):
        return {"reply": raw, "tool_calls": [], "trace": []}
    return {
        "reply": json.dumps(_jsonable(raw), ensure_ascii=False, indent=2),
        "tool_calls": [],
        "trace": [],
    }


def _tool_calls_to_trace(tool_calls: list) -> list:
    """Convert legacy [{tool, args, result}] to P4 trace format."""
    trace = []
    for i, tc in enumerate(tool_calls):
        if not isinstance(tc, dict):
            continue
        trace.append({
            "iteration": i + 1,
            "type": "tool_call",
            "tool": str(tc.get("tool", "")),
            "input": tc.get("args"),
        })
        trace.append({
            "iteration": i + 1,
            "type": "tool_result",
            "tool": str(tc.get("tool", "")),
            "output": tc.get("result"),
        })
    return trace


def _normalise_workflow_output(raw: Any) -> Dict[str, Any]:
    if isinstance(raw, dict) and "output" in raw and "status" in raw:
        output = raw.get("output")
        return _jsonable(output) if isinstance(output, dict) else {"result": _jsonable(output)}
    if isinstance(raw, dict):
        return _jsonable(raw)
    return {"result": _jsonable(raw)}


def run_agent(project_path: str, message: str) -> Dict[str, Any]:
    _ensure_project_on_path(project_path)
    if not message or not message.strip():
        manifest = _load_manifest(project_path)
        if isinstance(manifest.get("example_input"), str):
            message = manifest["example_input"]

    try:
        module = _load_entrypoint_module(project_path, "agent")
        func = getattr(module, "run_agent", None)
        if not callable(func):
            raise RuntimeError("Agent 入口必须暴露 run_agent(message: str)")
        output = _normalise_agent_output(_call_function(func, message))
        return {
            "status": "success",
            "output": output,
            "events": output.get("tool_calls", []),
        }
    except Exception as e:
        return {
            "status": "failed",
            "output": {"error": str(e)[:1000]},
            "events": [],
        }


def run_workflow(project_path: str, inputs: Dict[str, Any]) -> Dict[str, Any]:
    _ensure_project_on_path(project_path)
    if not inputs:
        manifest = _load_manifest(project_path)
        if isinstance(manifest.get("example_input"), dict):
            inputs = manifest["example_input"]

    try:
        module = _load_entrypoint_module(project_path, "workflow")
        func = getattr(module, "run_workflow", None)
        if not callable(func):
            raise RuntimeError("Workflow 入口必须暴露 run_workflow(inputs: dict)")
        raw = _call_function(func, inputs)
        output = _normalise_workflow_output(raw)
        events = []
        if isinstance(raw, dict) and isinstance(raw.get("events"), list):
            events = _jsonable(raw["events"])
        elif isinstance(raw, dict) and isinstance(raw.get("node_results"), list):
            events = _jsonable(raw["node_results"])
        return {
            "status": "success",
            "output": output,
            "events": events,
        }
    except Exception as e:
        return {
            "status": "failed",
            "output": {"error": str(e)[:1000]},
            "events": [],
        }
