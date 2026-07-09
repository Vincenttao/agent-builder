"""Smoke test for a generated Workflow (PRD FR-006, architecture §13.2).

Generic behaviour test (Phase 12): asserts the workflow runs Start -> ... -> End
in edge order with per-node success and produces an output, without
demo-specific assertions — so a presales Workflow and a real user's contract
review Workflow both pass.
"""
from __future__ import annotations

from src.workflows.workflow import build_workflow


def test_workflow_runs_all_nodes_in_edge_order():
    wf = build_workflow()
    result = wf.run({"requirement_doc": "示例输入"})
    assert result["mock"] is True
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
