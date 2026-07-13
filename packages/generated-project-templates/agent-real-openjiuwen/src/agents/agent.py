"""Generated ReActAgent — real openjiuwen 0.1.15.

This skeleton has been pre-verified against openjiuwen 0.1.15.
Do NOT change imports, Runner setup, or the @tool wrapping pattern.
Only fill in the tool implementations and SYSTEM_PROMPT.
"""
from __future__ import annotations

import asyncio
import os
from typing import Any, Dict, List

# Must be BEFORE any openjiuwen import to prevent log noise in stdout JSON.
os.environ.setdefault("LOGURU_LEVEL", "WARNING")

from openjiuwen.core.single_agent import AgentCard, ReActAgent, ReActAgentConfig
from openjiuwen.core.foundation.tool import tool
from openjiuwen.core.runner import Runner

# ═══════════════════════════════════════════════════════════════════════
# System Prompt
# ═══════════════════════════════════════════════════════════════════════
# TODO: Replace with the Spec's system_prompt.

SYSTEM_PROMPT = """\
TODO: Copy system_prompt from the Spec JSON below.
Describe the agent's role, available tools, and expected behavior.
"""

# ═══════════════════════════════════════════════════════════════════════
# Tool implementations (plain functions — directly callable from tests)
# ═══════════════════════════════════════════════════════════════════════
# Pattern: implement as `def _tool_name(...)` then wrap with `tool(...)(_tool_name)`
# This ensures tests can import the plain function without LocalFunction issues.
# TODO: Add one implementation function per Spec tool below.
# TODO: Then wrap each with `tool_name = tool(...)(_implementation)` at the bottom.

# ═══════════════════════════════════════════════════════════════════════
# @tool wrappers
# ═══════════════════════════════════════════════════════════════════════
# TODO: For each tool in the Spec, add:
#   tool_name = tool(name="...", description="...")(_impl_function)

TOOLS: List[Any] = []  # TODO: list all tool variables here

# ═══════════════════════════════════════════════════════════════════════
# Agent initialization
# ═══════════════════════════════════════════════════════════════════════

card = AgentCard(
    name="TODO",         # TODO: Spec.name
    description="TODO",  # TODO: Spec.description
)
agent = ReActAgent(card=card)

config = (
    ReActAgentConfig()
    .configure_model_client(
        provider="deepseek",
        api_key=os.getenv("DEEPSEEK_API_KEY", ""),
        api_base=os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1"),
        model_name=os.getenv("AGENT_BUILDER_MODEL", "deepseek-v4-flash"),
    )
    .configure_prompt_template([{"role": "system", "content": SYSTEM_PROMPT}])
    .configure_max_iterations(5)  # TODO: adjust based on Spec.tools.length
)
agent.configure(config)

# Register tools
for t in TOOLS:
    Runner.resource_mgr.add_tool(t)
    agent.ability_manager.add(t.card)

# ═══════════════════════════════════════════════════════════════════════
# Platform entry point
# ═══════════════════════════════════════════════════════════════════════


def run_agent(message: str) -> Dict[str, Any]:
    """Platform entry point. Runs the ReAct loop and returns reply + trace."""
    return asyncio.run(_run(message))


async def _run(message: str) -> Dict[str, Any]:
    trace: List[Dict[str, Any]] = []
    result = await agent.invoke({"query": message})
    trace.append({
        "iteration": 1,
        "type": "final",
        "message": str(result.get("output", ""))[:500],
    })
    return {
        "reply": result.get("output", ""),
        "tool_calls": [],
        "trace": trace,
    }
