"""Mock OpenJiuwen workflow runtime (P0).

Executes the Workflow node graph in edge-defined order, threading a context
dict through each node, recording per-node status/input/output/duration, and
producing the final output. Real OpenJiuwen Workflow/Component/Runner APIs bind
here after the API inventory (architecture §6.3) — the generated workflow.py
only depends on this adapter.
"""
from __future__ import annotations

import importlib
import time
from typing import Any, Dict, List


def _load_component(node_id: str):
    """Load a node's `handle(context) -> output` from src/components/<id>.py."""
    try:
        module = importlib.import_module(f"src.components.{node_id}")
        return getattr(module, "handle", None)
    except Exception:
        return None


def _default_handler(context: Dict[str, Any]) -> Dict[str, Any]:
    return {}


class MockWorkflow:
    def __init__(self, spec: Dict[str, Any]):
        self.spec = spec
        self.nodes = {n["id"]: n for n in spec.get("nodes", [])}
        self.edges = spec.get("edges", [])

    def _execution_order(self) -> List[str]:
        start = next((n["id"] for n in self.spec.get("nodes", []) if n["type"] == "start"), None)
        order: List[str] = []
        seen: set[str] = set()
        current = start
        while current and current not in seen:
            seen.add(current)
            order.append(current)
            nxt = next((e["to"] for e in self.edges if e["from"] == current), None)
            current = nxt
        return order

    def run(self, inputs: Dict[str, Any]) -> Dict[str, Any]:
        order = self._execution_order()
        context: Dict[str, Any] = dict(inputs)
        node_results: List[Dict[str, Any]] = []

        for node_id in order:
            node = self.nodes[node_id]
            started = time.time()
            entry: Dict[str, Any] = {"node_id": node_id, "name": node.get("name", node_id), "status": "running"}
            try:
                if node["type"] in ("start", "end"):
                    output: Dict[str, Any] = dict(context)
                else:
                    handler = _load_component(node_id) or _default_handler
                    output = handler(context) or {}
                context.update(output)
                entry["status"] = "success"
                entry["output"] = output
            except Exception as e:  # node failure -> workflow failed, fail-fast
                entry["status"] = "failed"
                entry["error"] = str(e)
                entry["duration_ms"] = int((time.time() - started) * 1000)
                node_results.append(entry)
                return {
                    "status": "failed",
                    "node_results": node_results,
                    "output": None,
                    "mock": True,
                }
            entry["duration_ms"] = int((time.time() - started) * 1000)
            node_results.append(entry)

        return {
            "status": "success",
            "node_results": node_results,
            "output": context,
            "mock": True,
        }


class WorkflowAdapter:
    """OpenJiuwen Workflow adapter (mock). Stable interface — real SDK binds later."""

    def create_workflow(self, spec: Dict[str, Any]) -> MockWorkflow:
        return MockWorkflow(spec)

    def run(self, handle: MockWorkflow, inputs: Dict[str, Any], context: Dict[str, Any] | None = None) -> Dict[str, Any]:
        return handle.run(inputs)
