import { DiagnosticsController } from './diagnostics.controller';
import type { SandboxService } from './sandbox.service';

function mockSandbox(opts: { runner: 'mock' | 'docker'; docker: boolean }) {
  return {
    selectRunner: () => ({ runner: opts.runner, mock: opts.runner === 'mock' }),
    isDockerAvailable: () => opts.docker,
  } as unknown as SandboxService;
}

describe('DiagnosticsController (P3-008)', () => {
  it('reports config presence without leaking key values', () => {
    const ctrl = new DiagnosticsController(mockSandbox({ runner: 'mock', docker: false }));
    const d = ctrl.diagnose();
    expect(d.sandbox.runner).toBe('mock');
    expect(d.sandbox.docker_available).toBe(false);
    expect(d.sandbox.allowlist_prefixes).toBeGreaterThan(0);
    expect(typeof d.llm.key_present).toBe('boolean');
    expect(typeof d.opencode.key_present).toBe('boolean');
    // No secret material is ever surfaced — only booleans / non-secret config.
    expect(JSON.stringify(d)).not.toContain('sk-');
  });

  it('reflects a real OpenCode + Docker config', () => {
    const prev = { ...process.env };
    process.env.CODEGEN_ENGINE = 'opencode';
    process.env.OPENCODE_REQUIRE_REAL = 'true';
    process.env.OPENCODE_CLI_STYLE = 'v1';
    process.env.OPENCODE_API_KEY = 'sk-test-123';
    process.env.SPEC_LLM_API_KEY = 'sk-test-456';
    process.env.SPEC_LLM_PROVIDER = 'openai-compatible';
    process.env.SPEC_LLM_MODEL = 'deepseek-chat';

    const ctrl = new DiagnosticsController(mockSandbox({ runner: 'docker', docker: true }));
    const d = ctrl.diagnose();
    expect(d.opencode.engine).toBe('opencode');
    expect(d.opencode.cli_style).toBe('v1');
    expect(d.opencode.require_real).toBe(true);
    expect(d.opencode.key_present).toBe(true);
    expect(d.llm.provider).toBe('openai-compatible');
    expect(d.llm.model).toBe('deepseek-chat');
    expect(d.llm.key_present).toBe(true);
    expect(d.sandbox.docker_available).toBe(true);
    // The actual key value must never appear in the response.
    expect(JSON.stringify(d)).not.toContain('sk-test-123');
    expect(JSON.stringify(d)).not.toContain('sk-test-456');

    // restore env
    for (const k of ['CODEGEN_ENGINE', 'OPENCODE_REQUIRE_REAL', 'OPENCODE_CLI_STYLE', 'OPENCODE_API_KEY', 'SPEC_LLM_API_KEY', 'SPEC_LLM_PROVIDER', 'SPEC_LLM_MODEL']) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  });
});
