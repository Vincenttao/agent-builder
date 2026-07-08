"""Generated Agent entry. Loads the Agent Spec and builds the agent via the
OpenJiuwen adapter (mock in P0). The agent only depends on the adapter, not on
any specific framework (PRD §8.4 — no LangGraph/CrewAI/Dify)."""
from __future__ import annotations

import json
import os
from typing import Any, Dict

from src.openjiuwen_runtime.agent_runtime import AgentAdapter
from src.openjiuwen_runtime.model_config import load_model_config


def load_spec() -> Dict[str, Any]:
    here = os.path.dirname(__file__)
    spec_path = os.path.join(here, "..", "..", "config", "agent_spec.json")
    with open(spec_path, "r", encoding="utf-8") as f:
        return json.load(f)


def build_agent():
    spec = load_spec()
    spec["model"] = {**spec.get("model", {}), **load_model_config()}
    adapter = AgentAdapter()
    return adapter.create_agent(spec)


__all__ = ["build_agent", "load_spec"]
