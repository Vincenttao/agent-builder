"""Smoke test for a generated Agent (PRD FR-006, architecture §13.2).

Generic behaviour test (Phase 12): asserts the agent returns structured mock
replies and records tool calls, without depending on any demo-specific
language — so a tarot Agent and a real user's weather Agent both pass.
"""
from __future__ import annotations

from src.agents.agent import build_agent


def test_agent_first_turn_returns_opening_reply():
    agent = build_agent()
    result = agent.run("你好")
    assert result["mock"] is True
    assert result["reply"]
    assert result["tool_calls"] == []


def test_agent_second_turn_calls_tool_and_replies():
    agent = build_agent()
    agent.run("开始")  # turn 1: opening
    result = agent.run("我的具体需求")  # turn 2: call tool + stitch reply
    assert result["mock"] is True
    assert result["reply"]
    assert len(result["tool_calls"]) >= 1


def test_tool_calls_are_recorded_for_run_log():
    agent = build_agent()
    agent.run("开始")
    agent.run("我的需求")
    first_tool = next(iter(agent.tools.values()))
    assert len(first_tool.calls) >= 1
    assert first_tool.calls[0]["output"]
