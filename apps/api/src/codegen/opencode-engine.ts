import { Injectable, Logger } from '@nestjs/common';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import type { AgentSpec, WorkflowSpec } from '@agent-builder/shared-contracts';
import {
  EventType,
  JobType,
  SandboxRuntime,
  NetworkPolicy,
  ErrorCode,
  AgentBuilderError,
} from '@agent-builder/shared-contracts';
import type {
  CodeGenerationEngine,
  GenerationContext,
  GenerationResult,
  GenerationCallbacks,
  GeneratedFile,
} from './engine';
import { TemplateEngine } from './template-engine';
import { SandboxService } from '../sandbox/sandbox.service';

/**
 * OpenCodeEngine — calls `opencode run` via SandboxService to generate code
 * (architecture §2.3, §5.5, runtime_and_sandbox §10).
 *
 * P0 constraint: OpenCode is the code-generation execution layer, NOT the
 * Agent/Workflow runtime — generated code still targets the OpenJiuwen adapter
 * (P0 plan §8.5 note 1). OpenCode may not pick LangGraph/CrewAI/Dify (note 2).
 *
 * Three modes:
 *  - mock (requireReal=false, default): emits opencode_started /
 *    opencode_file_changed / opencode_finished around a TemplateEngine run,
 *    so the event mapping is exercised without a real opencode binary.
 *  - fallback (requireReal=true, opencode unavailable): delegates to
 *    TemplateEngine with a warning event (P0 plan §8.2 test #4).
 *  - real (requireReal=true, opencode available): executes `opencode run`
 *    via SandboxService, scans the generated file tree, and emits
 *    opencode_* events (Phase 10).
 */
@Injectable()
export class OpenCodeEngine implements CodeGenerationEngine {
  private readonly logger = new Logger(OpenCodeEngine.name);
  readonly name = 'opencode' as const;

  constructor(
    private readonly templateEngine: TemplateEngine,
    private readonly sandbox: SandboxService,
    private readonly requireReal: boolean = false,
  ) {}

  isOpencodeAvailable(): boolean {
    try {
      return spawnSync('opencode', ['--version'], { stdio: 'ignore' }).status === 0;
    } catch {
      return false;
    }
  }

  async generate(
    spec: AgentSpec | WorkflowSpec,
    context: GenerationContext,
    callbacks?: GenerationCallbacks,
  ): Promise<GenerationResult> {
    if (!this.requireReal) {
      return this.generateMock(spec, context, callbacks);
    }

    if (!this.isOpencodeAvailable()) {
      this.logger.warn('OpenCode unavailable — falling back to TemplateEngine.');
      callbacks?.onEvent?.(
        EventType.OpencodeFinished,
        'OpenCode 不可用，已回退到 TemplateEngine',
        { fallback: true },
      );
      return this.templateEngine.generate(spec, context, callbacks);
    }

    return this.generateReal(spec, context, callbacks);
  }

  /** Mock mode (P0): emit opencode_* events around a TemplateEngine run. */
  private async generateMock(
    spec: AgentSpec | WorkflowSpec,
    context: GenerationContext,
    callbacks?: GenerationCallbacks,
  ): Promise<GenerationResult> {
    callbacks?.onEvent?.(EventType.OpencodeStarted, 'OpenCode 会话启动', { mock: true });

    // prompt written to .agent_builder/prompt.md (runtime_and_sandbox §10.1).
    const promptDir = path.join(context.projectPath, '.agent_builder');
    fs.mkdirSync(promptDir, { recursive: true });
    const prompt = this.buildPrompt(spec);
    fs.writeFileSync(path.join(promptDir, 'prompt.md'), prompt, 'utf8');

    const result = await this.templateEngine.generate(spec, context, {
      onFile: (file: GeneratedFile) => {
        callbacks?.onFile?.(file);
        callbacks?.onEvent?.(
          EventType.OpencodeFileChanged,
          `OpenCode 写入文件 ${file.path}`,
          { path: file.path, mock: true },
        );
      },
    });

    callbacks?.onEvent?.(
      EventType.OpencodeFinished,
      'OpenCode 会话结束',
      { mock: true, file_count: result.files.length },
    );

    return { ...result, engine: 'opencode' };
  }

  /** Real mode (Phase 10): execute `opencode run` via SandboxService. */
  private async generateReal(
    spec: AgentSpec | WorkflowSpec,
    context: GenerationContext,
    callbacks?: GenerationCallbacks,
  ): Promise<GenerationResult> {
    callbacks?.onEvent?.(EventType.OpencodeStarted, 'OpenCode 会话启动', { mock: false });

    // Write the prompt for opencode to read.
    const promptDir = path.join(context.projectPath, '.agent_builder');
    fs.mkdirSync(promptDir, { recursive: true });
    const prompt = this.buildPrompt(spec);
    fs.writeFileSync(path.join(promptDir, 'prompt.md'), prompt, 'utf8');

    // Write project-level opencode config so it uses the configured provider.
    this.writeOpencodeConfig(context.projectPath);

    const networkPolicy = this.resolveNetworkPolicy();
    const timeoutSeconds = parseInt(process.env.OPENCODE_TIMEOUT_SECONDS ?? '180', 10);
    const envAllowlist = this.buildEnvAllowlist();

    // Build opencode command with model flag
    const opencodeModel = process.env.OPENCODE_MODEL ?? 'deepseek-chat';
    const opencodeProvider = process.env.OPENCODE_PROVIDER ?? 'deepseek';
    const modelArg = `${opencodeProvider}/${opencodeModel}`;

    const result = await this.sandbox.run({
      generationId: context.generationId,
      versionId: context.versionId,
      jobType: JobType.OpencodeGeneration,
      command: ['opencode', 'run', '--model', modelArg, '--format', 'json', '.agent_builder/prompt.md'],
      workspacePath: context.projectPath,
      networkPolicy,
      timeoutSeconds,
      envAllowlist,
      runtime: SandboxRuntime.Docker,
    });

    // Check stderr for opencode errors even when exit code is 0 (opencode may
    // print "Model not found" etc. and still exit 0).
    let stderrText = '';
    try { stderrText = fs.readFileSync(result.stderrPath, 'utf8'); } catch { /* ok */ }
    const stderrErrors = this.extractOpencodeErrors(stderrText);

    if (result.status !== 'success' || stderrErrors) {
      const reason = stderrErrors
        ? `OpenCode 错误：${stderrErrors}`
        : `OpenCode 执行失败 (exit ${result.exitCode})`;
      throw new AgentBuilderError(
        ErrorCode.CodeGenerationFailed,
        reason,
        { jobId: result.jobId, stdoutPath: result.stdoutPath },
      );
    }

    // Scan the generated file tree, excluding our own .agent_builder/ prompt.
    const files = this.scanProjectFiles(context.projectPath);
    for (const file of files) {
      callbacks?.onFile?.(file);
      callbacks?.onEvent?.(
        EventType.OpencodeFileChanged,
        `OpenCode 写入文件 ${file.path}`,
        { path: file.path, mock: result.mock },
      );
    }

    callbacks?.onEvent?.(
      EventType.OpencodeFinished,
      'OpenCode 会话结束',
      { mock: result.mock, file_count: files.length },
    );

    return {
      engine: 'opencode',
      projectPath: context.projectPath,
      files,
      warnings: [],
      mock: result.mock,
    };
  }

  /** Recursively scan the project directory, returning project-relative paths. */
  private scanProjectFiles(projectPath: string): GeneratedFile[] {
    const files: GeneratedFile[] = [];
    const excludeDirs = new Set(['.agent_builder', '.opencode']);

    const walk = (dir: string) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        // Skip our own metadata dirs.
        if (excludeDirs.has(entry.name) && entry.isDirectory()) continue;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath);
        } else {
          const rel = path.relative(projectPath, fullPath).split(path.sep).join('/');
          const stat = fs.statSync(fullPath);
          files.push({ path: rel, size: stat.size });
        }
      }
    };

    walk(projectPath);
    return files;
  }

  /** Resolve network policy from OPENCODE_NETWORK_POLICY env, defaulting to Controlled. */
  private resolveNetworkPolicy(): NetworkPolicy {
    const raw = process.env.OPENCODE_NETWORK_POLICY;
    if (raw === 'none') return NetworkPolicy.None;
    if (raw === 'openjiuwen_only') return NetworkPolicy.OpenjiuwenOnly;
    if (raw === 'controlled') return NetworkPolicy.Controlled;
    return NetworkPolicy.Controlled; // real mode requires a non-none policy
  }

  /** Scan opencode stderr for error patterns and return a user-facing message. */
  private extractOpencodeErrors(stderr: string): string | null {
    if (!stderr.trim()) return null;
    const lines = stderr.split('\n').filter((l) =>
      /error|Error|not found|Model not/i.test(l) && !/^\s*$/.test(l),
    );
    if (lines.length === 0) return null;
    this.logger.warn(`opencode stderr: ${lines.join(' | ')}`);
    // Return the first meaningful error line
    const first = lines.find((l) => l.length > 10);
    return first ? first.trim().slice(0, 200) : lines[0].trim().slice(0, 200);
  }

  /**
   * Write a project-level opencode config so opencode uses the configured
   * provider/model instead of the global ~/.config/opencode/opencode.json.
   * The file is written inside the project workspace (never contains secrets
   * that aren't already in env vars — the env injects the actual key).
   */
  private writeOpencodeConfig(projectPath: string): void {
    const provider = process.env.OPENCODE_PROVIDER ?? 'deepseek';
    const model = process.env.OPENCODE_MODEL ?? 'deepseek-chat';
    const baseUrl = process.env.OPENCODE_BASE_URL ?? 'https://api.deepseek.com/v1';

    const config = {
      provider: {
        [provider]: {
          // @ai-sdk/openai-compatible works with any OpenAI-compatible API including DeepSeek
          npm: '@ai-sdk/openai-compatible',
          name: provider,
          options: {
            baseURL: baseUrl,
          },
          models: {
            [model]: {
              name: model,
              modalities: { input: ['text'], output: ['text'] },
              limit: { context: 131072, output: 8192 },
            },
          },
        },
      },
    };

    const configDir = path.join(projectPath, '.opencode');
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(
      path.join(configDir, 'config.json'),
      JSON.stringify(config, null, 2),
      'utf8',
    );
  }

  /** Collect configured opencode env vars to inject into the sandbox. */
  private buildEnvAllowlist(): Record<string, string> {
    const map: Record<string, string> = {};
    const keys = ['OPENCODE_API_KEY', 'OPENCODE_BASE_URL', 'OPENCODE_MODEL', 'OPENCODE_PROVIDER'] as const;
    for (const key of keys) {
      const val = process.env[key];
      if (val) map[key] = val;
    }
    // The AI SDK reads OPENAI_API_KEY for @ai-sdk/openai-compatible providers.
    // Propagate our key so opencode in the sandbox can auth to the LLM.
    if (map['OPENCODE_API_KEY']) {
      map['OPENAI_API_KEY'] = map['OPENCODE_API_KEY'];
    }
    return map;
  }

  /** The OpenCode prompt is derived from the Spec (never the raw user prompt). */
  private buildPrompt(spec: AgentSpec | WorkflowSpec): string {
    const lines = [
      `# 生成 OpenJiuwen ${isAgentSpec(spec) ? 'Agent' : 'Workflow'} 工程`,
      '',
      `名称：${spec.name}`,
      `描述：${spec.description}`,
      '',
      '约束：',
      '- 生成的 Agent/Workflow 必须通过 src/openjiuwen_runtime 适配层调用 OpenJiuwen。',
      '- 不得使用 LangGraph / CrewAI / Dify 等非 OpenJiuwen 框架。',
      '- 不得硬编码任何 API key。',
      '',
      'Spec（JSON）：',
      '```json',
      JSON.stringify(spec, null, 2),
      '```',
    ];
    return lines.join('\n');
  }
}

function isAgentSpec(spec: AgentSpec | WorkflowSpec): spec is AgentSpec {
  return 'tools' in spec && !('nodes' in spec);
}
