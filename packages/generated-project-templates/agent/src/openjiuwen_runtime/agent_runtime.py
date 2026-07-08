"""Mock OpenJiuwen agent runtime (P0).

P0 has no real OpenJiuwen SDK / LLM (API inventory incomplete — architecture
§6.3). This module provides a deterministic mock that still demonstrates the
Agent flow: ask a question -> call a tool -> interpret. Real OpenJiuwen binds
here later; the generated agent.py / main.py only depend on this adapter, so
swapping mock -> real is localized (PRD §8.1, §8.4).
"""
from __future__ import annotations

import importlib
import json
import os
from typing import Any, Dict, List


class MockTool:
    """A tool wrapper that records every call (input + output)."""

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


def _load_tool_handler(tool_name: str):
    """Load a tool's `handle(inputs)` from src/tools/<tool_name>.py if present."""
    try:
        module = importlib.import_module(f"src.tools.{tool_name}")
        return getattr(module, "handle", None)
    except Exception:
        return None


class MockAgent:
    """Deterministic mock agent following the tarot system-prompt flow.

    Turn 1 (no history): ask the user for their question.
    Turn 2+: call the first declared tool, then interpret the result.
    """

    def __init__(self, spec: Dict[str, Any]):
        self.spec = spec
        self.system_prompt = spec.get("system_prompt", "")
        self.tools: Dict[str, MockTool] = {}
        for tool_spec in spec.get("tools", []):
            name = tool_spec["name"]
            handler = _load_tool_handler(name) or _default_tool_handler
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
    """OpenJiuwen Agent adapter (mock). Stable interface — real SDK binds later."""

    def create_agent(self, spec: Dict[str, Any]) -> MockAgent:
        return MockAgent(spec)

    def run(self, handle: MockAgent, message: str, context: Dict[str, Any] | None = None) -> Dict[str, Any]:
        return handle.run(message)
