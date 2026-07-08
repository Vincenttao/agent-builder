"""Command-line entry for the Python Runner.

Phase 0: ``python-runner health`` prints the health payload.
Phase 5 extends this with ``agent run`` / ``workflow run`` subcommands.
"""
from __future__ import annotations

import argparse
import json
import sys
from typing import Sequence

from .health import health


def _cmd_health(_args: argparse.Namespace) -> int:
    print(json.dumps(health(), ensure_ascii=False))
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="python-runner")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("health", help="Print health payload as JSON").set_defaults(func=_cmd_health)
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
