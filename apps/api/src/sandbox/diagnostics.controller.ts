import { Controller, Get } from '@nestjs/common';
import fs from 'node:fs';
import { SandboxService } from './sandbox.service';
import { ALLOWED_PREFIXES } from './command-allowlist';
import { PYTHON_RUNNER_SRC } from '../common/workspace';

export interface DiagnosticsResponse {
  llm: {
    provider: string | null;
    base_url: string | null;
    model: string | null;
    /** Presence only — the key value is never returned. */
    key_present: boolean;
  };
  opencode: {
    engine: string;
    cli_style: string;
    require_real: boolean;
    provider: string | null;
    model: string | null;
    key_present: boolean;
  };
  sandbox: {
    runner: 'mock' | 'docker';
    docker_available: boolean;
    allowlist_prefixes: number;
  };
  python_runner: {
    src_present: boolean;
  };
}

/**
 * Deep diagnostics (P3-008). Reports capability + configuration presence so a
 * demonstrator can see at a glance whether the real LLM / OpenCode / Docker /
 * Python runner stack is wired up — without exposing any secret values.
 *
 * Kept at the root path (not under /api) alongside /health so platform probes
 * and the homepage diagnostics widget can both reach it without coupling to
 * the business API prefix.
 */
@Controller()
export class DiagnosticsController {
  constructor(private readonly sandbox: SandboxService) {}

  @Get('health/deep')
  diagnose(): DiagnosticsResponse {
    const llmKey = process.env.SPEC_LLM_API_KEY ?? process.env.DEEPSEEK_API_KEY;
    const opencodeKey = process.env.OPENCODE_API_KEY ?? process.env.DEEPSEEK_API_KEY;
    const runner = this.sandbox.selectRunner();
    return {
      llm: {
        provider: process.env.SPEC_LLM_PROVIDER ?? null,
        base_url: process.env.SPEC_LLM_BASE_URL ?? null,
        model: process.env.SPEC_LLM_MODEL ?? null,
        key_present: Boolean(llmKey),
      },
      opencode: {
        engine: process.env.CODEGEN_ENGINE ?? 'template',
        cli_style: process.env.OPENCODE_CLI_STYLE ?? 'v1',
        require_real: process.env.OPENCODE_REQUIRE_REAL === 'true',
        provider: process.env.OPENCODE_PROVIDER ?? null,
        model: process.env.OPENCODE_MODEL ?? null,
        key_present: Boolean(opencodeKey),
      },
      sandbox: {
        runner: runner.runner,
        docker_available: this.sandbox.isDockerAvailable(),
        allowlist_prefixes: ALLOWED_PREFIXES.length,
      },
      python_runner: {
        src_present: fs.existsSync(PYTHON_RUNNER_SRC),
      },
    };
  }
}
