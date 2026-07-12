"""
OpenJiuwen Runtime — lightweight ReAct Agent adapter.

Implements the Think → Act → Observe → Repeat loop on top of the
OpenAI-compatible chat completions API.  Designed for the Agent Builder
sandbox: reads model credentials from environment variables, requires
only the ``openai`` SDK.

Public API
----------
.. class:: ToolCard

    Describes a tool: name, description, JSON Schema parameters, and the
    Python callable.

.. function:: tool(*, name, description, parameters)

    Decorator that wraps a callable into a :class:`ToolCard`.

.. class:: ReActAgent

    The agent loop.  Call :meth:`ReActAgent.run` with a user message and
    get back ``{"reply": str, "tool_calls": list}``.
"""

from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional

from openai import OpenAI

logger = logging.getLogger("openjiuwen_runtime")

# ── Tool definition ────────────────────────────────────────────────────


@dataclass
class ToolCard:
    """A tool that can be called by the LLM during the ReAct loop."""

    name: str
    description: str = ""
    parameters: dict = field(default_factory=dict)  # JSON Schema dict
    func: Optional[Callable[..., Any]] = field(default=None, repr=False)


def tool(
    *,
    name: str,
    description: str = "",
    parameters: Optional[dict] = None,
) -> Callable[[Callable[..., Any]], ToolCard]:
    """Decorator: turn a function into a :class:`ToolCard`.

    ``parameters`` must be a JSON Schema dict describing the function's
    arguments, e.g.::

        {
            "type": "object",
            "properties": {"text": {"type": "string"}},
            "required": ["text"],
        }
    """
    def decorator(func: Callable[..., Any]) -> ToolCard:
        return ToolCard(
            name=name,
            description=description or (func.__doc__ or "").strip(),
            parameters=parameters or {},
            func=func,
        )

    return decorator


# ── ReAct Agent loop ───────────────────────────────────────────────────


class ReActAgent:
    """A single-agent ReAct loop backed by an OpenAI-compatible LLM.

    The loop:

    1. Send ``system`` + ``user`` message + tool schemas to the LLM.
    2. If the LLM returns ``tool_calls`` → execute them, feed results
       back as ``tool`` role messages, go to 1.
    3. If the LLM returns plain content → stop; return the reply.
    4. If ``max_iterations`` is reached → stop; return a fallback reply.

    Parameters
    ----------
    system_prompt:
        The system message that sets the agent's role and behaviour.
    tools:
        Tools available to the LLM.  An empty list means no tools.
    max_iterations:
        Safety cap on the number of LLM round-trips (default 5).
    """

    def __init__(
        self,
        system_prompt: str = "",
        tools: Optional[List[ToolCard]] = None,
        max_iterations: int = 5,
    ) -> None:
        self.system_prompt = system_prompt
        self._tools: Dict[str, ToolCard] = {
            t.name: t for t in (tools or [])
        }
        self.max_iterations = max_iterations

        # ── read credentials from environment ─────────────────────────
        api_key = os.getenv("DEEPSEEK_API_KEY", "")
        base_url = os.getenv(
            "DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1"
        )
        self.model = os.getenv("AGENT_BUILDER_MODEL", "deepseek-v4-flash")

        if not api_key:
            logger.warning(
                "DEEPSEEK_API_KEY is not set — LLM calls will fail"
            )

        self.client = OpenAI(api_key=api_key, base_url=base_url)

    # ── public API ────────────────────────────────────────────────────

    def run(self, user_message: str) -> Dict[str, Any]:
        """Execute the ReAct loop for a single user message.

        Returns
        -------
        dict
            ``{"reply": str, "tool_calls": list[dict]}`` where each
            tool-call entry has ``tool``, ``args``, and ``result`` keys.
        """
        messages: List[Dict[str, Any]] = []

        if self.system_prompt:
            messages.append({"role": "system", "content": self.system_prompt})
        messages.append({"role": "user", "content": user_message})

        tool_schemas = self._build_openai_tools()
        tool_calls_made: List[Dict[str, Any]] = []

        for iteration in range(self.max_iterations):
            logger.debug(
                "ReAct iteration %d/%d (messages=%d)",
                iteration + 1,
                self.max_iterations,
                len(messages),
            )

            response = self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                tools=tool_schemas or None,
            )
            choice = response.choices[0]
            msg = choice.message

            if not msg.tool_calls:
                # ── Think complete: LLM produced final answer ─────────
                return {
                    "reply": msg.content or "",
                    "tool_calls": tool_calls_made,
                }

            # ── Act: execute tool calls ───────────────────────────────
            assistant_msg = _serialize_assistant(msg)
            messages.append(assistant_msg)

            for tc in msg.tool_calls:
                tool_name = tc.function.name
                tool = self._tools.get(tool_name)
                try:
                    args = json.loads(tc.function.arguments)
                except (json.JSONDecodeError, TypeError):
                    args = {}

                if tool is None or tool.func is None:
                    result = f"Tool '{tool_name}' not found"
                else:
                    try:
                        result = tool.func(**args)
                    except Exception as exc:
                        result = f"Tool error: {exc}"

                tool_calls_made.append({
                    "tool": tool_name,
                    "args": args,
                    "result": result,
                })

                messages.append({
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "content": (
                        json.dumps(result, ensure_ascii=False)
                        if isinstance(result, (dict, list))
                        else str(result)
                    ),
                })

            # ── loop back to top — LLM sees tool results and re-thinks ─

        # ── Safety net: max iterations exhausted ───────────────────────
        return {
            "reply": (
                f"Agent 已达到最大推理步数（{self.max_iterations}），"
                f"已执行 {len(tool_calls_made)} 次工具调用。"
                "请简化问题后重试。"
            ),
            "tool_calls": tool_calls_made,
        }

    # ── helpers ───────────────────────────────────────────────────────

    def _build_openai_tools(self) -> Optional[List[dict]]:
        """Convert :class:`ToolCard` list to OpenAI tool schema."""
        if not self._tools:
            return None
        return [
            {
                "type": "function",
                "function": {
                    "name": t.name,
                    "description": t.description,
                    "parameters": t.parameters,
                },
            }
            for t in self._tools.values()
        ]


# ── utilities ──────────────────────────────────────────────────────────


def _serialize_assistant(msg: Any) -> Dict[str, Any]:
    """Serialize an OpenAI assistant message with tool_calls.

    The OpenAI SDK message object carries rich attributes; we need plain
    dicts for the subsequent requests that include the tool results.
    """
    tc_list = []
    for tc in (msg.tool_calls or []):
        tc_list.append({
            "id": tc.id,
            "type": "function",
            "function": {
                "name": tc.function.name,
                "arguments": tc.function.arguments,
            },
        })
    return {
        "role": "assistant",
        "content": msg.content or "",
        "tool_calls": tc_list,
    }
