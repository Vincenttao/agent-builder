"""Smoke test for the generated tarot Agent (PRD FR-006, architecture §13.2).

Asserts the agent calls the draw_tarot tool and returns an interpretation —
this is a behaviour test, not a snapshot (P0 plan §1.3 ban #2).
"""
from __future__ import annotations

from src.agents.agent import build_agent


def test_agent_first_turn_asks_for_the_question():
    agent = build_agent()
    result = agent.run("你好")
    assert result["mock"] is True
    assert "问题" in result["reply"]


def test_agent_calls_tool_and_interprets_on_second_turn():
    agent = build_agent()
    agent.run("开始占卜")  # turn 1: ask
    result = agent.run("我想看看最近职业发展的趋势")  # turn 2: draw + interpret
    assert result["mock"] is True
    assert result["reply"]
    assert len(result["tool_calls"]) >= 1
    call = result["tool_calls"][0]
    assert call["name"] == "draw_tarot"
    assert "cards" in call["output"]
    # Interpretation references the drawn cards.
    assert "牌" in result["reply"]


def test_tool_calls_are_recorded_for_run_log():
    agent = build_agent()
    agent.run("开始占卜")
    agent.run("我的事业")
    # The mock tool records every invocation.
    tool = agent.tools["draw_tarot"]
    assert len(tool.calls) == 1
    assert tool.calls[0]["output"]["cards"]
