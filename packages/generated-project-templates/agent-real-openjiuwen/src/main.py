"""CLI entry point for the generated Agent."""
import sys
from agents.agent import run_agent

def main():
    # Read from argv or stdin.
    if len(sys.argv) > 1:
        message = " ".join(sys.argv[1:])
    elif not sys.stdin.isatty():
        message = sys.stdin.read().strip()
    else:
        print("Usage: python src/main.py <message>")
        sys.exit(1)

    result = run_agent(message)
    print(f"Reply: {result.get('reply', '')}")

if __name__ == "__main__":
    main()
