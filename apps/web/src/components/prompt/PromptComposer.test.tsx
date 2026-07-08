import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PromptComposer } from './PromptComposer';

describe('PromptComposer (home page, PRD §6.1)', () => {
  it('renders Agent / Workflow type toggle and defaults to Agent', () => {
    render(<PromptComposer />);
    expect(screen.getByTestId('type-agent')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('type-workflow')).toHaveAttribute('aria-checked', 'false');
  });

  it('switches to Workflow when its toggle is clicked', () => {
    render(<PromptComposer />);
    fireEvent.click(screen.getByTestId('type-workflow'));
    expect(screen.getByTestId('type-workflow')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('type-agent')).toHaveAttribute('aria-checked', 'false');
  });

  it('disables submit until prompt is non-empty', () => {
    render(<PromptComposer />);
    const submit = screen.getByTestId('submit-button') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);

    fireEvent.change(screen.getByTestId('prompt-input'), {
      target: { value: '一个塔罗占卜 Agent' },
    });
    expect(submit.disabled).toBe(false);
  });

  it('fills the example prompt for the selected type', () => {
    render(<PromptComposer />);
    fireEvent.click(screen.getByTestId('fill-example'));
    const input = screen.getByTestId('prompt-input') as HTMLTextAreaElement;
    expect(input.value).toContain('塔罗');
  });

  it('shows a user-facing error and does not redirect when the API rejects', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error_code: 'PROMPT_PARSE_FAILED', message: '无法解析需求' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<PromptComposer />);
    fireEvent.change(screen.getByTestId('prompt-input'), {
      target: { value: '无效需求' },
    });
    fireEvent.click(screen.getByTestId('submit-button'));

    expect(await screen.findByTestId('submit-error')).toHaveTextContent('无法解析需求');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });
});
