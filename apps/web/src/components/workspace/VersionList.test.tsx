import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { VersionList } from './VersionList';
import { TestStatus } from '@agent-builder/shared-contracts';
import type { ProjectVersion } from '@agent-builder/shared-contracts';

const baseVersion = (overrides: Partial<ProjectVersion>): ProjectVersion => ({
  id: 'ver_1',
  generation_id: 'gen_1',
  version_label: 'v1',
  summary: 'feat',
  project_path: '/w/gen/ver_1',
  file_count: 8,
  test_status: TestStatus.Passed,
  mock_mode: false,
  retry_of_version_id: null,
  retry_index: 0,
  created_at: '2026-07-12T00:00:00Z',
  ...overrides,
});

describe('VersionList (P3-009)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the active version with an active tag and no activate button', () => {
    const v1 = baseVersion({ id: 'ver_1', version_label: 'v1' });
    const v2 = baseVersion({ id: 'ver_2', version_label: 'v2' });
    render(
      <VersionList generationId="gen_1" versions={[v2, v1]} activeVersionId="ver_1" />,
    );
    expect(screen.getByTestId('version-v1')).toBeInTheDocument();
    expect(screen.getByTestId('active-tag')).toHaveTextContent('active');
    // Active version has no activate button.
    expect(screen.queryByTestId('activate-v1')).toBeNull();
    // Non-active passed version has an activate button.
    expect(screen.getByTestId('activate-v2')).toBeInTheDocument();
  });

  it('shows the diff when toggling against the active version', async () => {
    const v1 = baseVersion({ id: 'ver_1', version_label: 'v1' });
    const v2 = baseVersion({ id: 'ver_2', version_label: 'v2' });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ path: 'src/agents/agent.py', status: 'modified', diff: '-old\n+new' }],
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <VersionList generationId="gen_1" versions={[v2, v1]} activeVersionId="ver_1" />,
    );
    fireEvent.click(screen.getByTestId('diff-toggle-v2'));
    expect(await screen.findByTestId('diff-view')).toBeInTheDocument();
    expect(screen.getByText('src/agents/agent.py')).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it('hides the activate button for a failed (non-passed) version', () => {
    const v1 = baseVersion({ id: 'ver_1', version_label: 'v1' });
    const failed = baseVersion({ id: 'ver_2', version_label: 'v2', test_status: TestStatus.Failed });
    render(
      <VersionList generationId="gen_1" versions={[failed, v1]} activeVersionId="ver_1" />,
    );
    expect(screen.queryByTestId('activate-v2')).toBeNull();
    // Diff toggle still available for non-active versions.
    expect(screen.getByTestId('diff-toggle-v2')).toBeInTheDocument();
  });

  it('renders nothing when there are no versions', () => {
    const { container } = render(
      <VersionList generationId="gen_1" versions={[]} activeVersionId={null} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
