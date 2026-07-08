"""Smoke test for the generated presales Workflow (PRD FR-006, architecture §13.2).

Asserts the workflow runs Start -> 4 business nodes -> End in order, records
per-node status, and produces a Markdown report. Behaviour test, not snapshot.
"""
from __future__ import annotations

from src.workflows.workflow import build_workflow


def test_workflow_runs_all_nodes_in_edge_order():
    wf = build_workflow()
    result = wf.run({"requirement_doc": "客户希望智能客服 Demo，两周内上线。"})
    assert result["mock"] is True
    assert result["status"] == "success"

    ids = [n["node_id"] for n in result["node_results"]]
    assert ids[0] == "start"
    assert ids[-1] == "end"
    # Four business nodes, in edge order.
    assert ids.index("extract_requirement") < ids.index("match_solution")
    assert ids.index("match_solution") < ids.index("generate_demo_plan")
    assert ids.index("generate_demo_plan") < ids.index("export_report")


def test_workflow_produces_markdown_report():
    wf = build_workflow()
    result = wf.run({"requirement_doc": "x"})
    assert result["output"]["report"].startswith("# 售前需求分析报告")
    assert "Demo 清单" in result["output"]["report"]


def test_every_node_succeeded_with_duration():
    wf = build_workflow()
    result = wf.run({"requirement_doc": "x"})
    for node in result["node_results"]:
        assert node["status"] == "success"
        assert node["duration_ms"] >= 0
