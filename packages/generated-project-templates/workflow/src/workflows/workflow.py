"""Generated Workflow entry. Loads the Workflow Spec and builds the workflow
via the OpenJiuwen adapter (mock in P0)."""
from __future__ import annotations

import json
import os
from typing import Any, Dict

from src.openjiuwen_runtime.workflow_runtime import WorkflowAdapter
from src.openjiuwen_runtime.model_config import load_model_config


def load_spec() -> Dict[str, Any]:
    here = os.path.dirname(__file__)
    spec_path = os.path.join(here, "..", "..", "config", "workflow_spec.json")
    with open(spec_path, "r", encoding="utf-8") as f:
        return json.load(f)


def build_workflow():
    spec = load_spec()
    spec["model"] = {**spec.get("model", {}), **load_model_config()}
    adapter = WorkflowAdapter()
    return adapter.create_workflow(spec)


__all__ = ["build_workflow", "load_spec"]
