"""Health check tests for the Python Runner (P0 Phase 0)."""
from python_runner.health import health


def test_health_returns_ok():
    result = health()
    assert result["status"] == "ok"
    assert result["service"] == "python-runner"
    assert isinstance(result["version"], str)
    assert result["version"] != ""


def test_health_reports_mock_runtime():
    # P0 runs under a mock OpenJiuwen runtime by default (architecture §6.3,
    # runtime_and_sandbox §14.4) — the health endpoint must make that visible.
    result = health()
    assert result["mock"] is True


def test_health_is_json_serializable():
    import json

    payload = json.dumps(health())
    assert "status" in json.loads(payload)
