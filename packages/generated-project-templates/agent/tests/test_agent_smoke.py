"""Smoke test for a generated Agent."""
from __future__ import annotations

from src.agents.agent import build_agent, run_agent


def test_agent_builds_from_spec():
    agent = build_agent()
    assert agent.name


def test_platform_entrypoint_exists():
    assert callable(run_agent)
