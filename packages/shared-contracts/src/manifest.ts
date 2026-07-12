/**
 * Agent Builder Manifest (P2 T-002).
 *
 * Generated as `agent_builder_manifest.json` in every project root.  The runner
 * reads it first to avoid auto-discovery; the UI surfaces entrypoint / test /
 * example data from it; exports include it for downstream tooling.
 */

export interface AgentBuilderManifest {
  schema_version: '1.0';
  /** 'agent' | 'workflow' */
  project_type: 'agent' | 'workflow';
  /** Relative path to the main entrypoint file. */
  entrypoint: string;
  /** Command to run tests, e.g. "pytest tests/test_agent_smoke.py". */
  test_command: string;
  /** Command / module to run the project, e.g. "python -m src.main". */
  run_command: string;
  /** A sample input that exercises the project. */
  example_input: string | Record<string, unknown>;
  /** Runtime metadata. */
  runtime: {
    framework: 'openjiuwen';
    mode: 'real';
  };
}
