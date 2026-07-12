"""Entry point: run the workflow with a requirement doc, print structured JSON.

Usage: python src/main.py "<requirement doc>"
"""
from __future__ import annotations

import json
import sys

from src.workflows.workflow import run_workflow


def run(inputs):
    return run_workflow(inputs)


def main(argv: list[str] | None = None) -> int:
    argv = argv if argv is not None else sys.argv[1:]
    requirement_doc = argv[0] if argv else "客户希望建设一个智能客服 Demo，两周内上线，预算有限。"
    result = run({"requirement_doc": requirement_doc})
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
