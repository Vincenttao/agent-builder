import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { GenerationWorkspace } from './GenerationWorkspace';

// Fetch routes: GET generation, GET files, POST export.
function makeFetchMock() {
  return vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    if (url.endsWith('/exports') && method === 'POST') {
      return { ok: true, json: async () => ({ export_id: 'exp_123', download_url: '/api/exports/exp_123/download' }) };
    }
    if (url.match(/\/api\/generations\/[^/]+$/) && method === 'GET') {
      return {
        ok: true,
        json: async () => ({
          generation_id: 'gen_1',
          type: 'agent',
          title: '塔罗牌占卜 Agent',
          status: 'completed',
          active_version_id: 'ver_1',
          project_path: 'generated/gen_1/ver_1',
          error_code: null,
          error_message: null,
          created_at: '',
          updated_at: '',
          selected_model: 'default',
        }),
      };
    }
    if (url.match(/\/files$/) && method === 'GET') {
      return { ok: true, json: async () => [{ name: 'src', path: 'src', type: 'directory', children: [{ name: 'agent.py', path: 'src/agents/agent.py', type: 'file' }] }] };
    }
    return { ok: false, json: async () => ({}) };
  });
}

describe('GenerationWorkspace (Phase 7 §11.2 #4/#6)', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('shows the Agent test panel + export button when completed', async () => {
    vi.stubGlobal('fetch', makeFetchMock());
    render(<GenerationWorkspace id="gen_1" />);

    // completed -> test panel + export enabled
    expect(await screen.findByTestId('agent-test-panel')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('export-button')).not.toBeDisabled());
    expect(screen.getByTestId('status-badge')).toHaveTextContent('已完成');
    vi.unstubAllGlobals();
  });

  it('#6 export button calls the export API', async () => {
    const fetchMock = makeFetchMock();
    vi.stubGlobal('fetch', fetchMock);
    render(<GenerationWorkspace id="gen_1" />);
    const exportBtn = await screen.findByTestId('export-button');
    await waitFor(() => expect(exportBtn).not.toBeDisabled());
    fireEvent.click(exportBtn);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/generations/gen_1/exports',
        expect.objectContaining({ method: 'POST' }),
      );
    });
    vi.unstubAllGlobals();
  });

  it('switches to the source tab and shows the file tree', async () => {
    vi.stubGlobal('fetch', makeFetchMock());
    render(<GenerationWorkspace id="gen_1" />);
    await screen.findByTestId('agent-test-panel');
    fireEvent.click(screen.getByTestId('tab-source'));
    expect(await screen.findByTestId('filetree')).toBeInTheDocument();
    vi.unstubAllGlobals();
  });
});
