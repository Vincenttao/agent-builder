"""Smoke tests for the generated ReActAgent — uses mock to avoid real LLM calls."""
from __future__ import annotations

import json
import os
from unittest.mock import patch

# Import the plain implementation functions (not @tool wrappers — those are LocalFunction).
# Tests should import and call the _impl functions directly.
from agents.agent import run_agent, agent, TOOLS

# ═══════════════════════════════════════════════════════════════════════
# Manifest validation
# ═══════════════════════════════════════════════════════════════════════


def test_manifest_exists():
    assert os.path.exists("agent_builder_manifest.json")


def test_manifest_is_real_openjiuwen():
    with open("agent_builder_manifest.json") as f:
        m = json.load(f)
    assert m["project_type"] == "agent"
    assert m["runtime"]["mode"] == "real_openjiuwen"
    assert m.get("engine") == "opencode"


# ═══════════════════════════════════════════════════════════════════════
# Agent structure
# ═══════════════════════════════════════════════════════════════════════


def test_agent_has_card():
    assert agent.card is not None
    assert len(agent.card.name) > 0


def test_tools_registered():
    """Verify tools are registered in the agent's ability manager."""
    tool_names = list(agent.ability_manager._tools.keys())
    assert len(tool_names) >= len(TOOLS), f"Expected >= {len(TOOLS)} tools, got {tool_names}"


# ═══════════════════════════════════════════════════════════════════════
# run_agent (mocked LLM)
# ═══════════════════════════════════════════════════════════════════════


def test_run_agent_returns_reply():
    with patch.object(agent, "invoke") as mock_invoke:
        mock_invoke.return_value = {"output": "Mock reply", "result_type": "answer"}
        result = run_agent("hello")
        assert "reply" in result
        assert result["reply"] == "Mock reply"


def test_run_agent_returns_trace():
    with patch.object(agent, "invoke") as mock_invoke:
        mock_invoke.return_value = {"output": "ok", "result_type": "answer"}
        result = run_agent("test")
        assert "trace" in result
        assert len(result["trace"]) >= 1
        assert result["trace"][0]["type"] == "final"


def test_run_agent_handles_empty_output():
    with patch.object(agent, "invoke") as mock_invoke:
        mock_invoke.return_value = {"output": "", "result_type": "answer"}
        result = run_agent("test")
        assert result["reply"] == ""


# ═══════════════════════════════════════════════════════════════════════
# Tool implementation tests (call _impl functions directly)
# ═══════════════════════════════════════════════════════════════════════
# TODO: Add one test per tool _impl function from the Spec.
