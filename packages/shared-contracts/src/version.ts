/** Test status for a project version (PRD §7.4, architecture §7.3). */
export enum TestStatus {
  Passed = 'passed',
  Failed = 'failed',
  Skipped = 'skipped',
}

/** A snapshot of generated files for one generation (architecture §7.3). */
export interface ProjectVersion {
  id: string;
  generation_id: string;
  version_label: string;
  summary: string;
  project_path: string;
  file_count: number;
  test_status: TestStatus;
  mock_mode: boolean;
  created_at: string; // ISO 8601
}
