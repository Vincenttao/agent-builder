"""OpenJiuwen agent adapter.

This adapter executes generated tool handlers only. It does not synthesize
agent replies or provide placeholder tool output.
"""
from __future__ import annotations

import importlib
import json
from typing import Any, Dict, List


class ToolRunner:
    """A tool wrapper that records every call."""

    def __init__(self, name: str, description: str, handler):
        self.name = name
        self.description = description
        self._handler = handler
        self.calls: List[Dict[str, Any]] = []

    def invoke(self, inputs: Dict[str, Any]) -> Dict[str, Any]:
        output = self._handler(inputs) or {}
        self.calls.append({"name": self.name, "input": inputs, "output": output})
        return output


def _load_tool_handler(tool_name: str):
    try:
        module = importlib.import_module(f"src.tools.{tool_name}")
        return getattr(module, "handle", None)
    except Exception:
        return None


class GeneratedAgent:
    def __init__(self, spec: Dict[str, Any]):
        self.spec = spec
        self.name = spec.get("name", "Agent")
        self.tools: Dict[str, ToolRunner] = {}
        for tool_spec in spec.get("tools", []):
            name = tool_spec["name"]
            handler = _load_tool_handler(name)
            if handler is None:
                raise RuntimeError(f"Tool '{name}' has no implementation in src/tools/{name}.py")
            self.tools[name] = ToolRunner(name, tool_spec.get("description", ""), handler)

    def run(self, message: str) -> Dict[str, Any]:
        tool_calls: List[Dict[str, Any]] = []
        for tool in self.tools.values():
            output = tool.invoke({"input": message})
            tool_calls.append({"name": tool.name, "input": {"input": message}, "output": output})
        return {
            "reply": json.dumps({"agent": self.name, "tool_calls": tool_calls}, ensure_ascii=False),
            "tool_calls": tool_calls,
        }


class AgentAdapter:
    """OpenJiuwen Agent adapter."""

    def create_agent(self, spec: Dict[str, Any]) -> GeneratedAgent:
        return GeneratedAgent(spec)

    def run(self, handle: GeneratedAgent, message: str, context: Dict[str, Any] | None = None) -> Dict[str, Any]:
        return handle.run(message)
