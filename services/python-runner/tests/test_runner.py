"""Runner command tests (Phase 5 §9.2 #6 — runs without real keys)."""
from __future__ import annotations

import json
import os
import sys
import tempfile

import pytest

from python_runner import runner


TAROT_TOOL = '''"""Tarot draw tool fixture."""
import random
DECK = [("愚者", "新的开始"), ("魔术师", "创造"), ("女祭司", "直觉"),
        ("皇后", "丰饶"), ("皇帝", "权威")]
def handle(inputs):
    n = max(1, min(int(inputs.get("count", 3)), 5))
    drawn = random.sample(DECK, n)
    return {"cards": [{"name": d[0], "reversed": random.choice([True, False]), "meaning": d[1]} for d in drawn]}
'''

AGENT_SPEC = {
    "agent_id": "tarot_divination_agent",
    "name": "塔罗牌占卜 Agent",
    "description": "tarot",
    "scenario": "占卜",
    "openjiuwen_agent_type": "react_agent",
    "system_prompt": "你是一个塔罗占卜师。",
    "model": {"provider": "openjiuwen", "model_name": "default", "temperature": 0.7},
    "tools": [{"name": "draw_tarot", "description": "抽牌", "input_schema": {}, "output_schema": {}}],
    "memory": {"enabled": True, "type": "short_term"},
    "examples": [],
    "acceptance_checks": [],
}


def _write_agent_project(root: str) -> None:
    os.makedirs(os.path.join(root, "config"), exist_ok=True)
    os.makedirs(os.path.join(root, "src", "tools"), exist_ok=True)
    with open(os.path.join(root, "config", "agent_spec.json"), "w", encoding="utf-8") as f:
        json.dump(AGENT_SPEC, f, ensure_ascii=False)
    with open(os.path.join(root, "src", "tools", "draw_tarot.py"), "w", encoding="utf-8") as f:
        f.write(TAROT_TOOL)
    with open(os.path.join(root, "src", "tools", "__init__.py"), "w", encoding="utf-8") as f:
        f.write("")


def test_6_agent_run_without_real_key_returns_mock_result(tmp_path):
    project = str(tmp_path)
    _write_agent_project(project)
    # Ensure no key in the environment (mock mode).
    os.environ.pop("OPENJIUWEN_API_KEY", None)
    os.environ["MOCK_OPENJIUWEN"] = "true"

    result = runner.run_agent(project, "我想看看最近职业发展")

    assert result["status"] == "success"
    assert result["mock"] is True
    assert result["output"]["reply"]
    assert len(result["output"]["tool_calls"]) >= 1
    assert result["output"]["tool_calls"][0]["name"] == "draw_tarot"
    # The structured envelope carries events (tool calls) for the run log.
    assert result["events"] == result["output"]["tool_calls"]


WORKFLOW_SPEC = {
    "workflow_id": "presales",
    "name": "售前 Workflow",
    "description": "presales",
    "openjiuwen_workflow_type": "workflow",
    "inputs": [{"name": "requirement_doc", "type": "string", "required": True}],
    "outputs": [{"name": "report", "type": "markdown"}],
    "nodes": [
        {"id": "start", "name": "Start", "type": "start", "description": "", "config": {}},
        {"id": "extract_requirement", "name": "需求抽取", "type": "python", "description": "", "config": {}},
        {"id": "match_solution", "name": "方案匹配", "type": "python", "description": "", "config": {}},
        {"id": "export_report", "name": "报告输出", "type": "export", "description": "", "config": {}},
        {"id": "end", "name": "End", "type": "end", "description": "", "config": {}},
    ],
    "edges": [
        {"from": "start", "to": "extract_requirement", "condition": None},
        {"from": "extract_requirement", "to": "match_solution", "condition": None},
        {"from": "match_solution", "to": "export_report", "condition": None},
        {"from": "export_report", "to": "end", "condition": None},
    ],
}

EXTRACT = 'def handle(c):\n  return {"goals": ["g1"], "constraints": ["c1"]}\n'
MATCH = 'def handle(c):\n  return {"solutions": ["s1", "s2"]}\n'
EXPORT = (
    "def handle(c):\n"
    "  return {\"report\": \"# 报告\\n\\n- \" + \", \".join(c.get('solutions', []))}\n"
)


def _write_workflow_project(root: str) -> None:
    os.makedirs(os.path.join(root, "config"), exist_ok=True)
    os.makedirs(os.path.join(root, "src", "components"), exist_ok=True)
    with open(os.path.join(root, "config", "workflow_spec.json"), "w", encoding="utf-8") as f:
        json.dump(WORKFLOW_SPEC, f, ensure_ascii=False)
    for name, src in [("extract_requirement", EXTRACT), ("match_solution", MATCH), ("export_report", EXPORT)]:
        with open(os.path.join(root, "src", "components", f"{name}.py"), "w", encoding="utf-8") as f:
            f.write(src)
    with open(os.path.join(root, "src", "components", "__init__.py"), "w", encoding="utf-8") as f:
        f.write("")


def test_6_workflow_run_without_real_key_returns_markdown(tmp_path):
    project = str(tmp_path)
    _write_workflow_project(project)
    os.environ.pop("OPENJIUWEN_API_KEY", None)
    os.environ["MOCK_OPENJIUWEN"] = "true"

    result = runner.run_workflow(project, {"requirement_doc": "客户希望智能客服 Demo。"})

    assert result["status"] == "success"
    assert result["mock"] is True
    assert result["output"]["report"].startswith("# 报告")
    ids = [n["node_id"] for n in result["events"]]
    assert ids == ["start", "extract_requirement", "match_solution", "export_report", "end"]
