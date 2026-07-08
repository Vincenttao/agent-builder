import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WorkflowRunPanel } from './WorkflowRunPanel';

describe('WorkflowRunPanel (Phase 7 §11.2 #4)', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('runs the workflow and shows node statuses + Markdown report', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 'success',
        output: { report: '# 售前需求分析报告\n\n## Demo 清单\n- Demo 1' },
        events: [
          { node_id: 'start', name: 'Start', status: 'success' },
          { node_id: 'end', name: 'End', status: 'success' },
        ],
        mock: true,
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<WorkflowRunPanel generationId="gen_1" />);
    fireEvent.change(screen.getByTestId('workflow-input'), {
      target: { value: '客户希望智能客服 Demo。' },
    });
    fireEvent.click(screen.getByTestId('workflow-run'));

    expect(await screen.findByTestId('workflow-report')).toHaveTextContent('# 售前需求分析报告');
    expect(screen.getByTestId('node-status-start')).toHaveTextContent('success');
    expect(screen.getByTestId('node-status-end')).toHaveTextContent('success');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/generations/gen_1/workflow/runs',
      expect.objectContaining({ method: 'POST' }),
    );
    vi.unstubAllGlobals();
  });
});
