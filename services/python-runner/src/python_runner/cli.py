"""Command-line entry for the Python Runner.

Subcommands:
  health              — print health payload as JSON
  agent run           — run a generated Agent project with a message
  workflow run        — run a generated Workflow project with inputs

The API's RunService invokes these via the Sandbox Service (P0 plan §9.3 task 6).
"""
from __future__ import annotations

import argparse
import json
import sys
from typing import Sequence

from .health import health
from . import runner


def _cmd_health(_args: argparse.Namespace) -> int:
    print(json.dumps(health(), ensure_ascii=False))
    return 0


def _suppress_init_logs() -> None:
    """Redirect openjiuwen / loguru init logs to stderr so stdout stays clean JSON."""
    try:
        from loguru import logger as loguru_logger
        loguru_logger.remove()  # drop default stdout sink
        loguru_logger.add(sys.stderr, level="WARNING",
                          format="{time} | {level} | {message}")
    except Exception:
        pass  # loguru not installed — nothing to suppress


def _cmd_agent_run(args: argparse.Namespace) -> int:
    _suppress_init_logs()
    message = args.message
    if not message:
        # Read from stdin so user text is never a CLI arg (sandbox allowlist).
        message = sys.stdin.read().strip() if not sys.stdin.isatty() else ""
    result = runner.run_agent(args.project, message)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["status"] == "success" else 1


def _cmd_workflow_run(args: argparse.Namespace) -> int:
    _suppress_init_logs()
    raw = args.input
    if not raw:
        raw = sys.stdin.read().strip() if not sys.stdin.isatty() else "{}"
    inputs = json.loads(raw) if raw else {}
    result = runner.run_workflow(args.project, inputs)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["status"] == "success" else 1


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="python-runner")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("health", help="Print health payload as JSON").set_defaults(func=_cmd_health)

    agent = sub.add_parser("agent", help="Run a generated Agent project")
    agent_sub = agent.add_subparsers(dest="agent_command", required=True)
    agent_run = agent_sub.add_parser("run", help="Run the agent with a message")
    agent_run.add_argument("--project", required=True, help="Path to the generated project root")
    agent_run.add_argument(
        "--message",
        required=False,
        default=None,
        help="User message (if omitted, read from stdin)",
    )
    agent_run.set_defaults(func=_cmd_agent_run)

    workflow = sub.add_parser("workflow", help="Run a generated Workflow project")
    wf_sub = workflow.add_subparsers(dest="workflow_command", required=True)
    wf_run = wf_sub.add_parser("run", help="Run the workflow with inputs JSON")
    wf_run.add_argument("--project", required=True, help="Path to the generated project root")
    wf_run.add_argument("--input", required=False, default="{}", help='Inputs JSON, e.g. \'{"requirement_doc":"..."}\'')
    wf_run.set_defaults(func=_cmd_workflow_run)

    return parser


def main(argv: Sequence[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
