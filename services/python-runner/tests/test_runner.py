"""Runner command tests."""
from __future__ import annotations

import json
import os

from python_runner import runner


def _write_manifest(root: str, kind: str, entrypoint: str, example_input):
    with open(os.path.join(root, "agent_builder_manifest.json"), "w", encoding="utf-8") as f:
        json.dump(
            {
                "schema_version": "1.0",
                "project_type": kind,
                "entrypoint": entrypoint,
                "test_command": "pytest tests/ -q",
                "run_command": "python src/main.py",
                "example_input": example_input,
                "runtime": {"framework": "openjiuwen", "mode": "real"},
            },
            f,
        )


def test_agent_run_calls_generated_run_agent_entrypoint(tmp_path):
    project = str(tmp_path)
    os.makedirs(os.path.join(project, "src", "agents"), exist_ok=True)
    _write_manifest(project, "agent", "src/agents/agent.py", "hello")
    with open(os.path.join(project, "src", "agents", "agent.py"), "w", encoding="utf-8") as f:
        f.write(
            "def run_agent(message):\n"
            "    return {'reply': 'generated:' + message, 'tool_calls': [{'name': 'entry', 'input': {'message': message}, 'output': {'ok': True}}]}\n"
        )

    result = runner.run_agent(project, "平台测试")

    assert result["status"] == "success"
    assert result["output"]["reply"] == "generated:平台测试"
    assert result["events"][0]["name"] == "entry"
    assert "mock" not in result


def test_agent_run_fails_when_entrypoint_has_no_run_agent(tmp_path):
    project = str(tmp_path)
    os.makedirs(os.path.join(project, "src", "agents"), exist_ok=True)
    _write_manifest(project, "agent", "src/agents/agent.py", "hello")
    with open(os.path.join(project, "src", "agents", "agent.py"), "w", encoding="utf-8") as f:
        f.write("def build_agent():\n    return object()\n")

    result = runner.run_agent(project, "hi")

    assert result["status"] == "failed"
    assert "run_agent" in result["output"]["error"]
    assert result["events"] == []


def test_agent_run_fails_for_spec_only_project(tmp_path):
    project = str(tmp_path)
    os.makedirs(os.path.join(project, "config"), exist_ok=True)
    with open(os.path.join(project, "config", "agent_spec.json"), "w", encoding="utf-8") as f:
        json.dump({"name": "Spec Only", "tools": []}, f)

    result = runner.run_agent(project, "hi")

    assert result["status"] == "failed"
    assert "agent_builder_manifest.json" in result["output"]["error"]


def test_workflow_run_calls_generated_run_workflow_entrypoint(tmp_path):
    project = str(tmp_path)
    os.makedirs(os.path.join(project, "src", "workflows"), exist_ok=True)
    _write_manifest(project, "workflow", "src/workflows/workflow.py", {"requirement_doc": "示例"})
    with open(os.path.join(project, "src", "workflows", "workflow.py"), "w", encoding="utf-8") as f:
        f.write(
            "def run_workflow(inputs):\n"
            "    return {'output': {'report': '# 报告 ' + inputs['requirement_doc']}, 'events': [{'node_id': 'end', 'status': 'success'}], 'status': 'success'}\n"
        )

    result = runner.run_workflow(project, {"requirement_doc": "客户需求"})

    assert result["status"] == "success"
    assert result["output"]["report"] == "# 报告 客户需求"
    assert result["events"] == [{"node_id": "end", "status": "success"}]


def test_workflow_run_fails_when_entrypoint_has_no_run_workflow(tmp_path):
    project = str(tmp_path)
    os.makedirs(os.path.join(project, "src", "workflows"), exist_ok=True)
    _write_manifest(project, "workflow", "src/workflows/workflow.py", {"requirement_doc": "示例"})
    with open(os.path.join(project, "src", "workflows", "workflow.py"), "w", encoding="utf-8") as f:
        f.write("def build_workflow():\n    return object()\n")

    result = runner.run_workflow(project, {"requirement_doc": "客户需求"})

    assert result["status"] == "failed"
    assert "run_workflow" in result["output"]["error"]
