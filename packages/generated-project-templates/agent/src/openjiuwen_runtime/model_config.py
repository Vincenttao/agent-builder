"""Model configuration loader (P0 mock mode).

Real OpenJiuwen model config binds here after the API inventory. P0 reads
config/agent_llm_config.json and honours MOCK_OPENJIUWEN so no key is needed.
"""
from __future__ import annotations

import json
import os
from typing import Any, Dict


def load_model_config(config_path: str | None = None) -> Dict[str, Any]:
    if config_path is None:
        here = os.path.dirname(__file__)
        config_path = os.path.join(here, "..", "..", "config", "agent_llm_config.json")
    with open(config_path, "r", encoding="utf-8") as f:
        config = json.load(f)
    # Env overrides (never bake keys into source — PRD §10.3).
    if os.environ.get("OPENJIUWEN_API_KEY"):
        config["api_key"] = os.environ["OPENJIUWEN_API_KEY"]
    if os.environ.get("OPENJIUWEN_BASE_URL"):
        config["base_url"] = os.environ["OPENJIUWEN_BASE_URL"]
    config["mock"] = os.environ.get("MOCK_OPENJIUWEN", "true").lower() != "false"
    return config
