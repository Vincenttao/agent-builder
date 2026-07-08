import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AgentTestPanel } from './AgentTestPanel';

describe('AgentTestPanel (Phase 7 §11.2 #4)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('sends a message and shows the mock reply + tool calls', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 'success',
        output: { reply: '你问的是：事业\n抽到的牌：…' },
        events: [{ name: 'draw_tarot', input: { count: 3 }, output: { cards: [] } }],
        mock: true,
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<AgentTestPanel generationId="gen_1" />);
    fireEvent.change(screen.getByTestId('agent-message-input'), {
      target: { value: '我想看看事业' },
    });
    fireEvent.click(screen.getByTestId('agent-send'));

    expect(await screen.findByTestId('agent-reply')).toHaveTextContent('抽到的牌');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/generations/gen_1/agent/runs',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(screen.getByText(/工具调用记录/)).toBeInTheDocument();
  });

  it('shows an error when the run fails', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error_code: 'RUN_FAILED', message: '运行失败' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<AgentTestPanel generationId="gen_1" />);
    fireEvent.change(screen.getByTestId('agent-message-input'), { target: { value: 'hi' } });
    fireEvent.click(screen.getByTestId('agent-send'));

    expect(await screen.findByTestId('agent-error')).toHaveTextContent('运行失败');
    vi.unstubAllGlobals();
  });

  it('clear button resets the conversation', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'success', output: { reply: '回复' }, events: [], mock: true }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<AgentTestPanel generationId="gen_1" />);
    fireEvent.change(screen.getByTestId('agent-message-input'), { target: { value: 'hi' } });
    fireEvent.click(screen.getByTestId('agent-send'));
    await screen.findByTestId('agent-reply');
    fireEvent.click(screen.getByTestId('agent-clear'));
    expect(screen.queryByTestId('agent-reply')).toBeNull();
    vi.unstubAllGlobals();
  });
});
