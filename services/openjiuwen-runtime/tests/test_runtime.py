"""Tests for the openjiuwen_runtime package — no real LLM keys needed."""

from __future__ import annotations

import json
from unittest.mock import MagicMock, patch

import pytest

from openjiuwen_runtime import ReActAgent, ToolCard, tool


# ── Tool helpers ────────────────────────────────────────────────────────


class TestToolCard:
    def test_basic(self):
        t = ToolCard(name="test", description="a test tool")
        assert t.name == "test"
        assert t.description == "a test tool"
        assert t.parameters == {}
        assert t.func is None

    def test_with_func(self):
        def f():
            return 42

        t = ToolCard(name="f", func=f)
        assert t.func is not None
        assert t.func() == 42  # type: ignore[union-attr]


class TestToolDecorator:
    def test_minimal(self):
        @tool(name="hello")
        def hello():
            """Say hello."""
            return "hi"

        assert isinstance(hello, ToolCard)
        assert hello.name == "hello"
        assert hello.func is not None
        assert hello.func() == "hi"  # type: ignore[union-attr]

    def test_full_parameters(self):
        schema = {
            "type": "object",
            "properties": {"text": {"type": "string"}},
            "required": ["text"],
        }

        @tool(name="echo", description="Echoes text", parameters=schema)
        def echo(text: str) -> str:
            return text

        assert echo.name == "echo"
        assert echo.parameters == schema
        assert echo.func is not None
        assert echo.func(text="hello") == "hello"  # type: ignore[union-attr]


# ── ReActAgent ───────────────────────────────────────────────────────────


def _fake_completion(*, content: str = "", tool_calls=None):
    """Build a MagicMock that looks like an OpenAI chat completion."""
    msg = MagicMock()
    msg.content = content
    msg.tool_calls = tool_calls or []

    choice = MagicMock()
    choice.message = msg

    resp = MagicMock()
    resp.choices = [choice]
    return resp


def _fake_tool_call(idx: str, name: str, args: dict) -> MagicMock:
    tc = MagicMock()
    tc.id = f"call_{idx}"
    tc.function.name = name
    tc.function.arguments = json.dumps(args)
    return tc


class TestReActAgentBasic:
    """Tests that don't need a mocked LLM."""

    def test_construction_defaults(self):
        agent = ReActAgent()
        assert agent.system_prompt == ""
        assert agent.max_iterations == 5
        assert agent._tools == {}

    def test_construction_with_args(self):
        tools = [ToolCard(name="t1")]
        agent = ReActAgent(
            system_prompt="You are helpful.",
            tools=tools,
            max_iterations=3,
        )
        assert "You are helpful" in agent.system_prompt
        assert agent.max_iterations == 3
        assert "t1" in agent._tools

    def test_build_openai_tools_empty(self):
        agent = ReActAgent(tools=[])
        assert agent._build_openai_tools() is None

    def test_build_openai_tools(self):
        agent = ReActAgent(tools=[
            ToolCard(
                name="search",
                description="Search the web",
                parameters={"type": "object", "properties": {}},
            )
        ])
        schemas = agent._build_openai_tools()
        assert schemas is not None
        assert len(schemas) == 1
        assert schemas[0]["type"] == "function"
        assert schemas[0]["function"]["name"] == "search"


class TestReActAgentLoop:
    """Tests that mock the OpenAI client to exercise the loop."""

    def test_direct_reply_no_tools(self):
        """LLM returns content immediately → loop stops."""
        agent = ReActAgent(system_prompt="Be brief.")

        with patch.object(agent.client.chat.completions, "create") as mock:
            mock.return_value = _fake_completion(content="Hello!")

            result = agent.run("hi")

        assert result["reply"] == "Hello!"
        assert result["tool_calls"] == []

        # Verify the messages sent to the LLM
        call_messages = mock.call_args.kwargs["messages"]
        assert call_messages[0]["role"] == "system"
        assert call_messages[1]["role"] == "user"
        assert call_messages[1]["content"] == "hi"

    def test_single_tool_call(self):
        """LLM calls one tool → execute → LLM replies → done."""

        @tool(
            name="weather",
            description="Get weather",
            parameters={
                "type": "object",
                "properties": {"city": {"type": "string"}},
                "required": ["city"],
            },
        )
        def weather(city: str) -> dict:
            return {"city": city, "temp": 22}

        agent = ReActAgent(
            system_prompt="Use weather tool.",
            tools=[weather],
        )

        with patch.object(agent.client.chat.completions, "create") as mock:
            # First call: LLM wants to call the tool
            mock.side_effect = [
                _fake_completion(
                    content=None,
                    tool_calls=[_fake_tool_call("1", "weather", {"city": "Beijing"})],
                ),
                # Second call: LLM sees tool result and replies
                _fake_completion(content="Beijing is 22°C today."),
            ]

            result = agent.run("What's the weather?")

        assert result["reply"] == "Beijing is 22°C today."
        assert len(result["tool_calls"]) == 1
        assert result["tool_calls"][0]["tool"] == "weather"
        assert result["tool_calls"][0]["args"] == {"city": "Beijing"}
        assert result["tool_calls"][0]["result"] == {"city": "Beijing", "temp": 22}

    def test_multiple_tool_calls_in_one_turn(self):
        """LLM requests two tools in one response."""
        calls = []

        @tool(name="a", description="Tool A")
        def a():
            calls.append("a")
            return "A"

        @tool(name="b", description="Tool B")
        def b():
            calls.append("b")
            return "B"

        agent = ReActAgent(tools=[a, b])

        with patch.object(agent.client.chat.completions, "create") as mock:
            mock.side_effect = [
                _fake_completion(
                    content=None,
                    tool_calls=[
                        _fake_tool_call("1", "a", {}),
                        _fake_tool_call("2", "b", {}),
                    ],
                ),
                _fake_completion(content="Done."),
            ]

            result = agent.run("go")

        assert calls == ["a", "b"]
        assert len(result["tool_calls"]) == 2

    def test_multi_turn_tool_loop(self):
        """LLM calls tool A in turn 1, then tool B in turn 2, then replies."""
        calls = []

        @tool(name="step1", description="First step")
        def step1():
            calls.append("step1")
            return "result1"

        @tool(name="step2", description="Second step")
        def step2():
            calls.append("step2")
            return "result2"

        agent = ReActAgent(tools=[step1, step2])

        with patch.object(agent.client.chat.completions, "create") as mock:
            mock.side_effect = [
                # Turn 1: call step1
                _fake_completion(
                    content=None,
                    tool_calls=[_fake_tool_call("1", "step1", {})],
                ),
                # Turn 2: call step2
                _fake_completion(
                    content=None,
                    tool_calls=[_fake_tool_call("2", "step2", {})],
                ),
                # Turn 3: final reply
                _fake_completion(content="All steps done."),
            ]

            result = agent.run("do it")

        assert calls == ["step1", "step2"]
        assert result["reply"] == "All steps done."
        assert len(result["tool_calls"]) == 2

    def test_max_iterations_safety_net(self):
        """If the LLM keeps calling tools forever, max_iterations caps it."""
        calls = []

        @tool(name="loop", description="Infinite loop tool")
        def loop():
            calls.append(1)
            return "ok"

        agent = ReActAgent(tools=[loop], max_iterations=3)

        with patch.object(agent.client.chat.completions, "create") as mock:
            # Always return a tool call — the loop must stop at max_iterations
            mock.return_value = _fake_completion(
                content=None,
                tool_calls=[_fake_tool_call("x", "loop", {})],
            )

            result = agent.run("loop")

        assert len(calls) == 3  # exactly max_iterations calls
        assert "已达到最大推理步数" in result["reply"]

    def test_tool_error_is_captured(self):
        """When a tool raises, the error is returned as tool result."""

        @tool(name="broken", description="Always fails")
        def broken() -> str:
            raise ValueError("boom")

        agent = ReActAgent(tools=[broken])

        with patch.object(agent.client.chat.completions, "create") as mock:
            mock.side_effect = [
                _fake_completion(
                    content=None,
                    tool_calls=[_fake_tool_call("1", "broken", {})],
                ),
                _fake_completion(content="The tool failed, let me help..."),
            ]

            result = agent.run("test")

        assert len(result["tool_calls"]) == 1
        assert "Tool error" in str(result["tool_calls"][0]["result"])

    def test_missing_tool(self):
        """LLM calls a tool that wasn't registered."""
        agent = ReActAgent(tools=[])

        with patch.object(agent.client.chat.completions, "create") as mock:
            mock.side_effect = [
                _fake_completion(
                    content=None,
                    tool_calls=[_fake_tool_call("1", "ghost", {})],
                ),
                _fake_completion(content="I can't find that tool."),
            ]

            result = agent.run("test")

        assert "not found" in str(result["tool_calls"][0]["result"])

    def test_run_without_system_prompt(self):
        """Agent works fine with an empty system prompt."""
        agent = ReActAgent()
        with patch.object(agent.client.chat.completions, "create") as mock:
            mock.return_value = _fake_completion(content="Hi")
            result = agent.run("hello")
        assert result["reply"] == "Hi"

    def test_message_accumulation(self):
        """Verify that multi-turn messages include history correctly."""
        agent = ReActAgent(system_prompt="SYS")

        with patch.object(agent.client.chat.completions, "create") as mock:
            mock.side_effect = [
                _fake_completion(
                    content=None,
                    tool_calls=[_fake_tool_call("1", "echo", {"x": 1})],
                ),
                _fake_completion(content="final"),
            ]

            # Register a simple tool on the fly
            agent._tools["echo"] = ToolCard(
                name="echo",
                func=lambda **kw: kw,
            )

            agent.run("start")

            # Check the second call's messages include history
            second_call_msgs = mock.call_args_list[1].kwargs["messages"]
            roles = [m["role"] for m in second_call_msgs]
            assert roles == ["system", "user", "assistant", "tool"]
