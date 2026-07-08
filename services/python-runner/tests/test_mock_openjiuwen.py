"""Mock OpenJiuwen runtime tests (Phase 5 §9.2 #1-3)."""
from python_runner.mock_openjiuwen import (
    MockAgent,
    MockTool,
    MockWorkflow,
    AgentAdapter,
    WorkflowAdapter,
)


def _agent_spec():
    return {
        "agent_id": "test_agent",
        "name": "测试 Agent",
        "system_prompt": "你是一个测试 Agent。",
        "tools": [
            {"name": "test_tool", "description": "a test tool", "input_schema": {}, "output_schema": {}},
        ],
    }


def test_1_mock_agent_receives_message_and_returns_structured_reply():
    agent = AgentAdapter().create_agent(_agent_spec())
    r1 = agent.run("你好")
    assert r1["mock"] is True
    assert r1["reply"]  # turn 1: asks a question
    assert "问题" in r1["reply"]

    r2 = agent.run("我想看看事业")
    assert r2["mock"] is True
    assert r2["reply"]
    # turn 2 calls the tool
    assert len(r2["tool_calls"]) == 1
    assert r2["tool_calls"][0]["name"] == "test_tool"


def test_2_mock_tool_records_input_and_output():
    handler = lambda inputs: {"doubled": inputs.get("n", 0) * 2}  # noqa: E731
    tool = MockTool("dbl", "doubles", handler)
    out = tool.invoke({"n": 3})
    assert out == {"doubled": 6}
    assert len(tool.calls) == 1
    assert tool.calls[0]["input"] == {"n": 3}
    assert tool.calls[0]["output"] == {"doubled": 6}


def test_3_mock_workflow_runs_nodes_in_order():
    spec = {
        "workflow_id": "wf",
        "name": "wf",
        "nodes": [
            {"id": "start", "name": "Start", "type": "start", "description": ""},
            {"id": "n1", "name": "N1", "type": "python", "description": ""},
            {"id": "n2", "name": "N2", "type": "python", "description": ""},
            {"id": "end", "name": "End", "type": "end", "description": ""},
        ],
        "edges": [
            {"from": "start", "to": "n1", "condition": None},
            {"from": "n1", "to": "n2", "condition": None},
            {"from": "n2", "to": "end", "condition": None},
        ],
    }
    wf = WorkflowAdapter().create_workflow(spec)
    result = wf.run({"requirement_doc": "x"})
    assert result["mock"] is True
    assert result["status"] == "success"
    ids = [n["node_id"] for n in result["node_results"]]
    assert ids == ["start", "n1", "n2", "end"]
    for nr in result["node_results"]:
        assert nr["status"] == "success"
