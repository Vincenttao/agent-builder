import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Diagnostics } from './Diagnostics';

describe('Diagnostics (P3-008)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders runtime rows from /health/deep', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        llm: { provider: 'openai-compatible', base_url: 'x', model: 'deepseek-chat', key_present: true },
        opencode: { engine: 'opencode', cli_style: 'v1', require_real: true, provider: 'deepseek', model: 'deepseek-chat', key_present: true },
        sandbox: { runner: 'docker', docker_available: true, allowlist_prefixes: 17 },
        python_runner: { src_present: true },
      }),
    }));

    render(<Diagnostics />);
    expect(await screen.findByText('OpenCode (v1)')).toBeInTheDocument();
    expect(screen.getByText('Docker')).toBeInTheDocument();
    expect(screen.getByText('present')).toBeInTheDocument();
    // No secret values are rendered.
    expect(document.body.textContent).not.toContain('sk-');
  });

  it('shows a loading message before the fetch resolves', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => undefined)));
    render(<Diagnostics />);
    expect(screen.getByText('正在读取运行时诊断…')).toBeInTheDocument();
  });

  it('falls back gracefully when the fetch fails', () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')));
    render(<Diagnostics />);
    expect(screen.getByText('正在读取运行时诊断…')).toBeInTheDocument();
  });
});
