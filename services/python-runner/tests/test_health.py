"""Health check tests for the Python Runner (P0 Phase 0)."""
from python_runner.health import health


def test_health_returns_ok():
    result = health()
    assert result["status"] == "ok"
    assert result["service"] == "python-runner"
    assert isinstance(result["version"], str)
    assert result["version"] != ""


def test_health_does_not_report_mock_runtime():
    result = health()
    assert "mock" not in result


def test_health_is_json_serializable():
    import json

    payload = json.dumps(health())
    assert "status" in json.loads(payload)
