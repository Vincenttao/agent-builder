"""Mock OpenJiuwen runtime (canonical, P0).

The Agent Builder Python Runner uses this mock adapter to run generated
Agent/Workflow projects without a real OpenJiuwen SDK or model key (PRD §10.1,
architecture §6.3). The same logic is copied into each generated project's
``src/openjiuwen_runtime`` so exported projects run standalone; this module is
the runner-side canonical copy (P0 plan §9.5 note 2 — mock is config-switched,
not hard-coded into generated business logic).

Real OpenJiuwen binds behind the same ``AgentAdapter`` / ``WorkflowAdapter``
interfaces after the API inventory (architecture §6.1).
"""
from __future__ import annotations

import importlib
import time
from typing import Any, Dict, List


# --------------------------------------------------------------------------- #
# Agent
# --------------------------------------------------------------------------- #
class MockTool:
    """Records every invocation (input + output) for the run log (FR-007)."""

    def __init__(self, name: str, description: str, handler):
        self.name = name
        self.description = description
        self._handler = handler
        self.calls: List[Dict[str, Any]] = []

    def invoke(self, inputs: Dict[str, Any]) -> Dict[str, Any]:
        output = self._handler(inputs) or {}
        self.calls.append({"name": self.name, "input": inputs, "output": output})
        return output


def _default_tool_handler(inputs: Dict[str, Any]) -> Dict[str, Any]:
    return {"result": "mock tool output", "received": inputs}


def load_tool_handler(tool_name: str):
    """Load ``handle(inputs)`` from ``src.tools.<tool_name>`` on sys.path."""
    try:
        module = importlib.import_module(f"src.tools.{tool_name}")
        return getattr(module, "handle", None)
    except Exception:
        return None


class MockAgent:
    """Deterministic two-turn mock agent (ask -> tool -> interpret)."""

    def __init__(self, spec: Dict[str, Any]):
        self.spec = spec
        self.system_prompt = spec.get("system_prompt", "")
        self.tools: Dict[str, MockTool] = {}
        for tool_spec in spec.get("tools", []):
            name = tool_spec["name"]
            handler = load_tool_handler(name) or _default_tool_handler
            self.tools[name] = MockTool(name, tool_spec.get("description", ""), handler)
        self.history: List[Dict[str, str]] = []

    def run(self, message: str) -> Dict[str, Any]:
        self.history.append({"role": "user", "content": message})
        if len(self.history) == 1:
            reply = "请问你想占卜什么问题？"
            self.history.append({"role": "agent", "content": reply})
            return {"reply": reply, "tool_calls": [], "mock": True}

        tool = next(iter(self.tools.values()), None)
        tool_calls: List[Dict[str, Any]] = []
        if tool is not None:
            output = tool.invoke({"count": 3})
            tool_calls.append({"name": tool.name, "input": {"count": 3}, "output": output})
            reply = self._interpret(message, output)
        else:
            reply = "(mock) 已收到你的问题。"
        self.history.append({"role": "agent", "content": reply})
        return {"reply": reply, "tool_calls": tool_calls, "mock": True}

    def _interpret(self, question: str, draw: Dict[str, Any]) -> str:
        cards = draw.get("cards", []) if isinstance(draw, dict) else []
        lines = [f"你问的是：{question}", "抽到的牌："]
        for card in cards:
            reversed_ = "逆位" if card.get("reversed") else "正位"
            lines.append(f"- {card.get('name', '?')}（{reversed_}）：{card.get('meaning', '')}")
        lines.append("综合建议：保持积极心态，顺势而为。")
        return "\n".join(lines)


class AgentAdapter:
    def create_agent(self, spec: Dict[str, Any]) -> MockAgent:
        return MockAgent(spec)

    def run(self, handle: MockAgent, message: str, context: Dict[str, Any] | None = None) -> Dict[str, Any]:
        return handle.run(message)


# --------------------------------------------------------------------------- #
# Workflow
# --------------------------------------------------------------------------- #
def load_component(node_id: str):
    try:
        module = importlib.import_module(f"src.components.{node_id}")
        return getattr(module, "handle", None)
    except Exception:
        return None


def _default_component(context: Dict[str, Any]) -> Dict[str, Any]:
    return {}


class MockWorkflow:
    """Executes the node graph in edge order, threading a context dict."""

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
                    handler = load_component(node_id) or _default_component
                    output = handler(context) or {}
                context.update(output)
                entry["status"] = "success"
                entry["output"] = output
            except Exception as e:
                entry["status"] = "failed"
                entry["error"] = str(e)
                entry["duration_ms"] = int((time.time() - started) * 1000)
                node_results.append(entry)
                return {"status": "failed", "node_results": node_results, "output": None, "mock": True}
            entry["duration_ms"] = int((time.time() - started) * 1000)
            node_results.append(entry)
        return {"status": "success", "node_results": node_results, "output": context, "mock": True}


class WorkflowAdapter:
    def create_workflow(self, spec: Dict[str, Any]) -> MockWorkflow:
        return MockWorkflow(spec)

    def run(self, handle: MockWorkflow, inputs: Dict[str, Any], context: Dict[str, Any] | None = None) -> Dict[str, Any]:
        return handle.run(inputs)
