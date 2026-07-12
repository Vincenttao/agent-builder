"""Smoke test for a generated Workflow."""
from __future__ import annotations

from src.workflows.workflow import build_workflow


def test_workflow_runs_all_nodes_in_edge_order():
    wf = build_workflow()
    result = wf.run({"requirement_doc": "示例输入"})
    assert result["status"] == "success"
    ids = [n["node_id"] for n in result["node_results"]]
    assert ids[0] == "start"
    assert ids[-1] == "end"


def test_every_node_succeeded_with_duration():
    wf = build_workflow()
    result = wf.run({"requirement_doc": "示例输入"})
    for node in result["node_results"]:
        assert node["status"] == "success"
        assert node["duration_ms"] >= 0


def test_workflow_produces_output():
    wf = build_workflow()
    result = wf.run({"requirement_doc": "示例输入"})
    assert result["output"] is not None
