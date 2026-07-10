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

    const networkPolicy = this.resolveNetworkPolicy();
    const timeoutSeconds = parseInt(process.env.OPENCODE_TIMEOUT_SECONDS ?? '180', 10);
    const envAllowlist = this.buildEnvAllowlist();

    // Build opencode command with model flag
    const opencodeModel = process.env.OPENCODE_MODEL ?? 'deepseek-chat';
    const opencodeProvider = process.env.OPENCODE_PROVIDER ?? 'deepseek';
    const modelArg = `${opencodeProvider}/${opencodeModel}`;

    // Parse opencode stderr for meaningful progress events.
    // Raw log lines are filtered; only user-relevant messages are emitted.
    const onLine = (stream: string) => (line: string) => {
      const msg = this.parseOpencodeLog(line);
      if (msg) {
        callbacks?.onEvent?.(EventType.Thought, msg, { stream, mock: false });
      }
    };

    // Build version-appropriate opencode command.
    const cmd = this.buildOpencodeCommand(modelArg);

    const result = await this.sandbox.run({
      generationId: context.generationId,
      versionId: context.versionId,
      jobType: JobType.OpencodeGeneration,
      command: cmd,
      workspacePath: context.projectPath,
      networkPolicy,
      timeoutSeconds,
      envAllowlist,
      runtime: SandboxRuntime.Docker,
      onStdout: onLine('stdout'),
      onStderr: onLine('stderr'),
    });

    // Scan the generated file tree, excluding our own .agent_builder/ prompt.
    const files = this.scanProjectFiles(context.projectPath);

    // Check for fatal errors after scanning: only fail if sandbox status is
    // non-success, OR if stderr has errors AND no files were generated (opencode
    // may emit non-fatal ERROR log lines from plugins etc. — those are ok if
    // files were produced).
    let stderrText = '';
    try { stderrText = fs.readFileSync(result.stderrPath, 'utf8'); } catch { /* ok */ }
    const stderrErrors = this.extractOpencodeErrors(stderrText);
    const noFilesGenerated = files.length === 0;

    if (result.status !== 'success') {
      throw new AgentBuilderError(
        ErrorCode.CodeGenerationFailed,
        `OpenCode 执行失败 (exit ${result.exitCode})`,
        { jobId: result.jobId, stdoutPath: result.stdoutPath },
      );
    }

    if (noFilesGenerated && stderrErrors) {
      throw new AgentBuilderError(
        ErrorCode.CodeGenerationFailed,
        `OpenCode 错误：${stderrErrors}`,
        { jobId: result.jobId, stdoutPath: result.stdoutPath },
      );
    }
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

  /**
   * Parse one opencode log line and return a user-friendly message, or null
   * if the line is noise (internal operations, config loading, etc.).
   */
  private parseOpencodeLog(line: string): string | null {
    const get = (key: string): string | undefined => {
      const m = line.match(new RegExp(`${key}=([^ ]+)`));
      return m ? m[1] : undefined;
    };
    const message = get('message');
    if (!message) return null;

    // ── Noise filter ──────────────────────────────────────────────
    const noise = /^(all LSPs|all formatters|init$|event connected|shell tool|booting location|project copy|loading|opencode\.json)/;
    if (noise.test(message)) return null;

    // ── Model calls ───────────────────────────────────────────────
    if (message.startsWith('stream')) {
      const model = get('modelID') ?? 'LLM';
      return `调用 ${model} 生成代码…`;
    }
    if (message.startsWith('llm runtime')) {
      return `模型就绪：${get('llm.provider') ?? ''}/${get('llm.model') ?? ''}`;
    }

    // ── Tool calls ────────────────────────────────────────────────
    if (message.includes('tool_call') || message.includes('ToolCall')) {
      const tool = get('tool') ?? get('toolName') ?? '';
      if (tool === 'write_file' || tool === 'write' || tool === 'edit_file' || tool === 'edit') {
        const p = get('path') ?? get('filePath') ?? '';
        return p ? `写入 ${p}` : '写入文件…';
      }
      if (tool === 'bash' || tool === 'shell' || tool === 'command') {
        const cmd = get('command') ?? get('cmd') ?? '';
        return cmd ? `执行 ${cmd.slice(0, 80)}` : '执行命令…';
      }
      return tool ? `调用工具：${tool}` : '调用工具…';
    }
    if (message.includes('tool_result') || message.includes('ToolResult')) {
      const tool = get('tool') ?? '';
      if (tool === 'bash' || tool === 'shell') return null; // command outputs are noisy
      return tool ? `工具完成：${tool}` : null;
    }

    // ── Progress ──────────────────────────────────────────────────
    if (message.startsWith('loop')) {
      const step = get('step');
      return step === '0' ? '开始生成项目…' : `处理步骤 ${step}…`;
    }
    if (message.startsWith('created')) {
      return '会话已创建';
    }

    // ── Completion / file writes ──────────────────────────────────
    if (message.startsWith('done') || message === 'done') return '生成完成';
    if (/^(write|Wrote) /.test(message)) return message;
    if (message.startsWith('file written') || message.startsWith('File written')) {
      const p = get('path') ?? get('file') ?? '';
      return p ? `已写入 ${p}` : '已写入文件';
    }

    return null;
  }

  /** Scan opencode stderr for error patterns and return a user-facing message. */
  private extractOpencodeErrors(stderr: string): string | null {
    if (!stderr.trim()) return null;
    // Filter to lines that look like real errors, but exclude known non-fatal
    // noise: MCP plugin timeouts, internal service errors from plugins, etc.
    const nonFatal = /MCP error|service=mcp|plugin.*error|type=message\.updated/i;
    const lines = stderr.split('\n').filter((l) =>
      /error|Error|not found|Model not/i.test(l) &&
      !/^\s*$/.test(l) &&
      !nonFatal.test(l),
    );
    if (lines.length === 0) {
      // Log non-fatal lines for debugging but don't treat as errors.
      const mcpLines = stderr.split('\n').filter((l) => nonFatal.test(l));
      if (mcpLines.length > 0) {
        this.logger.debug(`opencode non-fatal stderr: ${mcpLines.join(' | ').slice(0, 300)}`);
      }
      return null;
    }
    this.logger.warn(`opencode stderr: ${lines.join(' | ')}`);
    // Return the first meaningful error line
    const first = lines.find((l) => l.length > 10);
    return first ? first.trim().slice(0, 200) : lines[0].trim().slice(0, 200);
  }

  /**
   * Build the opencode run command, adapting flags to the CLI style.
   * v0 (GitHub Release, Docker): opencode -p "prompt" -f json
   * v1 (standalone, host):       opencode run --dangerously-skip-permissions --model p/m --format json file
   * v3 (oh-my-opencode, npm):    opencode run --model p/m --json "message"
   * Set OPENCODE_CLI_STYLE in .env.
   */
  private buildOpencodeCommand(modelArg: string): string[] {
    const style = process.env.OPENCODE_CLI_STYLE ?? 'v0';
    switch (style) {
      case 'v1':
        return ['opencode', 'run', '--dangerously-skip-permissions', '--print-logs', '--model', modelArg, '请读取 .agent_builder/prompt.md 并根据其中的 Spec 生成完整的项目代码'];
      case 'v3':
        return ['opencode', 'run', '--model', modelArg, '--json', 'Read .agent_builder/prompt.md and generate the project'];
      case 'v0':
      default:
        return ['opencode', '-p', 'Read .agent_builder/prompt.md and generate the project files', '-f', 'json'];
    }
  }

  /** Collect configured opencode env vars to inject into the sandbox. */
  private buildEnvAllowlist(): Record<string, string> {
    const map: Record<string, string> = {};
    const keys = ['OPENCODE_API_KEY', 'OPENCODE_BASE_URL', 'OPENCODE_MODEL', 'OPENCODE_PROVIDER'] as const;
    for (const key of keys) {
      const val = process.env[key];
      if (val) map[key] = val;
    }
    // The AI SDK derives env var name from provider ID (e.g. "deepseek" → DEEPSEEK_API_KEY).
    // Also set OPENAI_API_KEY as a generic fallback.
    if (map['OPENCODE_API_KEY']) {
      map['OPENAI_API_KEY'] = map['OPENCODE_API_KEY'];
      if (map['OPENCODE_PROVIDER']) {
        const upper = map['OPENCODE_PROVIDER'].toUpperCase();
        map[`${upper}_API_KEY`] = map['OPENCODE_API_KEY'];
        map[`${upper}_BASE_URL`] = map['OPENCODE_BASE_URL'] ?? 'https://api.deepseek.com/v1';
      }
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
