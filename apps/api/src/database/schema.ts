/**
 * SQLite DDL for the Agent Builder metadata store (architecture §7, §10).
 * `payload_json` / `*_json` columns keep extensible structured data out of the
 * column set so new event/run shapes don't require migrations (architecture §5.5).
 */
export const SCHEMA_SQL = [
  `CREATE TABLE IF NOT EXISTS generations (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    user_prompt TEXT NOT NULL,
    status TEXT NOT NULL,
    selected_model TEXT NOT NULL,
    mode TEXT NOT NULL,
    active_version_id TEXT,
    project_root TEXT,
    error_code TEXT,
    error_message TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_generations_status ON generations(status)`,

  `CREATE TABLE IF NOT EXISTS generation_events (
    id TEXT PRIMARY KEY,
    generation_id TEXT NOT NULL,
    run_id TEXT,
    type TEXT NOT NULL,
    message TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    sequence INTEGER NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_events_gen_seq ON generation_events(generation_id, sequence)`,

  `CREATE TABLE IF NOT EXISTS project_versions (
    id TEXT PRIMARY KEY,
    generation_id TEXT NOT NULL,
    version_label TEXT NOT NULL,
    summary TEXT NOT NULL,
    project_path TEXT NOT NULL,
    file_count INTEGER NOT NULL,
    test_status TEXT NOT NULL,
    mock_mode INTEGER NOT NULL,
    retry_of_version_id TEXT,
    retry_index INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_versions_gen ON project_versions(generation_id)`,

  `CREATE TABLE IF NOT EXISTS generation_drafts (
    id TEXT PRIMARY KEY,
    user_prompt TEXT NOT NULL,
    type TEXT NOT NULL,
    spec_json TEXT,
    parser_mode TEXT,
    provider TEXT,
    model TEXT,
    validation_status TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    error_message TEXT,
    created_at TEXT NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS generation_specs (
    id TEXT PRIMARY KEY,
    generation_id TEXT NOT NULL UNIQUE,
    draft_id TEXT,
    spec_json TEXT NOT NULL,
    parser_mode TEXT NOT NULL,
    provider TEXT,
    model TEXT,
    prompt_hash TEXT,
    validation_status TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_specs_gen ON generation_specs(generation_id)`,

  `CREATE TABLE IF NOT EXISTS run_records (
    id TEXT PRIMARY KEY,
    generation_id TEXT NOT NULL,
    version_id TEXT,
    run_type TEXT NOT NULL,
    status TEXT NOT NULL,
    input_json TEXT,
    output_json TEXT,
    stdout_path TEXT,
    stderr_path TEXT,
    duration_ms INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_runs_gen ON run_records(generation_id)`,

  `CREATE TABLE IF NOT EXISTS sandbox_jobs (
    id TEXT PRIMARY KEY,
    generation_id TEXT NOT NULL,
    version_id TEXT,
    job_type TEXT NOT NULL,
    runtime TEXT NOT NULL,
    image TEXT NOT NULL,
    command_json TEXT NOT NULL,
    network_policy TEXT NOT NULL,
    cpus REAL NOT NULL,
    memory TEXT NOT NULL,
    pids_limit INTEGER NOT NULL,
    status TEXT NOT NULL,
    started_at TEXT,
    finished_at TEXT,
    exit_code INTEGER,
    stdout_path TEXT,
    stderr_path TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_sandbox_gen ON sandbox_jobs(generation_id)`,

  // ─── Phase 14 migration: add retry columns to existing project_versions ───
  `ALTER TABLE project_versions ADD COLUMN retry_of_version_id TEXT`,
  `ALTER TABLE project_versions ADD COLUMN retry_index INTEGER NOT NULL DEFAULT 0`,
] as const;
