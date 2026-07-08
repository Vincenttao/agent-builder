"""Entry point: run the agent with a message and print structured JSON.

Usage: python src/main.py "<message>"
P0 runs in mock mode (MOCK_OPENJIUWEN=true) so no key is required.
"""
from __future__ import annotations

import json
import sys

from src.agents.agent import build_agent


def run(message: str):
    agent = build_agent()
    # Two-turn flow per the system prompt: ask question, then draw + interpret.
    agent.run("开始占卜")
    return agent.run(message)


def main(argv: list[str] | None = None) -> int:
    argv = argv if argv is not None else sys.argv[1:]
    message = argv[0] if argv else "我想看看最近职业发展的趋势"
    result = run(message)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
