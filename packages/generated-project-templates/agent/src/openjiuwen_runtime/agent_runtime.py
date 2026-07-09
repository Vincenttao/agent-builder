"""Mock OpenJiuwen agent runtime (P0 + Phase 12).

P0 has no real OpenJiuwen SDK / LLM (API inventory incomplete — architecture
§6.3). This module provides a mock that demonstrates the Agent flow. Phase 12
makes it generic/spec-driven: the opening and reply are derived from the Spec
(name / system_prompt / tools) and tool output is stitched into the reply, so
a non-tarot Agent never leaks tarot/presales demo language (plan §12 §1 #6).
Real OpenJiuwen binds here later; the generated agent.py / main.py only depend
on this adapter, so swapping mock -> real is localized (PRD §8.1, §8.4).
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
    """Generic two-turn mock agent: opening -> call first tool -> stitch reply.

    Replies are derived from the Spec (name / system_prompt / tools) so any
    Agent runs without leaking demo-specific language. Turn 1 is an opening;
    turn 2 invokes the first tool (or a conversational reply when the Spec has
    no tools) and composes a reply from the tool output.
    """

    def __init__(self, spec: Dict[str, Any]):
        self.spec = spec
        self.name = spec.get("name", "Agent")
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
            reply = self._opening()
            self.history.append({"role": "agent", "content": reply})
            return {"reply": reply, "tool_calls": [], "mock": True}

        tool_calls: List[Dict[str, Any]] = []
        tool = next(iter(self.tools.values()), None)
        if tool is not None:
            output = tool.invoke({"input": message})
            tool_calls.append({"name": tool.name, "input": {"input": message}, "output": output})
            reply = self._compose(message, tool.name, output)
        else:
            reply = self._conversational(message)
        self.history.append({"role": "agent", "content": reply})
        return {"reply": reply, "tool_calls": tool_calls, "mock": True}

    def _prompt_hint(self) -> str:
        first_line = (self.system_prompt or "").strip().splitlines()[0:1]
        return first_line[0][:60] if first_line else ""

    def _opening(self) -> str:
        hint = self._prompt_hint()
        return f"你好，我是{self.name}。{hint} 请告诉我你的具体需求。".strip()

    def _compose(self, message: str, tool_name: str, output: Dict[str, Any]) -> str:
        return (
            f"已调用工具 {tool_name}，返回：{json.dumps(output, ensure_ascii=False)}。"
            f"结合你的输入「{message}」与 {self.name} 的能力，给出以上结果。"
        )

    def _conversational(self, message: str) -> str:
        hint = self._prompt_hint()
        return f"{self.name}：{hint} 已收到你的输入：{message}。".strip()


class AgentAdapter:
    """OpenJiuwen Agent adapter (mock). Stable interface — real SDK binds later."""

    def create_agent(self, spec: Dict[str, Any]) -> MockAgent:
        return MockAgent(spec)

    def run(self, handle: MockAgent, message: str, context: Dict[str, Any] | None = None) -> Dict[str, Any]:
        return handle.run(message)
