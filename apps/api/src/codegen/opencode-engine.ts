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
    /** When requireReal=true but the opencode binary is missing, fall back to
     * TemplateEngine (true, default) or hard-fail (false). P3: OPENCODE_ALLOW_FALLBACK. */
    private readonly allowFallback: boolean = true,
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
      // P3: OPENCODE_ALLOW_FALLBACK=false makes a missing opencode binary a
      // hard failure (no silent TemplateEngine substitution), so a "must be
      // real opencode" demo fails loudly instead of looking like opencode.
      if (!this.allowFallback) {
        throw new AgentBuilderError(
          ErrorCode.CodeGenerationFailed,
          'OpenCode 不可用（opencode 二进制未找到），且 OPENCODE_ALLOW_FALLBACK=false，拒绝回退到 TemplateEngine',
        );
      }
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
    const opencodeModel = process.env.OPENCODE_MODEL ?? 'deepseek-v4-pro';
    const opencodeProvider = process.env.OPENCODE_PROVIDER ?? 'deepseek';
    const modelArg = `${opencodeProvider}/${opencodeModel}`;

    // Parse opencode stderr for meaningful progress events.
    // Raw log lines are filtered; only user-relevant messages are emitted.
    this.logger.debug(`opencode sandbox starting (timeout: ${timeoutSeconds}s)`);
    const onLine = (stream: string) => (line: string) => {
      const msg = this.parseOpencodeLog(line);
      if (msg) {
        callbacks?.onEvent?.(EventType.Thought, msg, { stream, mock: false });
      }
      this.logger.debug(`[opencode ${stream}] ${line.slice(0, 200)}`);
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
   * if the line is noise.
   */
  private parseOpencodeLog(line: string): string | null {
    const get = (key: string): string | undefined => {
      const m = line.match(new RegExp(`${key}=([^ ]+)`));
      return m ? m[1] : undefined;
    };
    const message = get('message');
    if (!message) return null;

    // ── Noise ──────────────────────────────────────────────────
    if (/^(all LSPs|all formatters|init$|event connected|shell tool|booting|project copy|loading|opencode\.json)/.test(message)) return null;

    // ── File writes (key user-visible action) ───────────────────
    // "← Write <path>" or "Wrote <path>" or "Wrote file successfully"
    const arrowMatch = line.match(/[←↳→]\s*Write\s+(.+)/);
    if (arrowMatch) return `创建 ${this.shortPath(arrowMatch[1])}`;
    if (message.startsWith('Wrote file successfully') || message === 'Wrote file successfully') return '文件写入完成';
    if (/formatted|formatting|touching file/.test(message)) {
      const f = get('file') ?? '';
      return f ? `格式化 ${this.shortPath(f)}` : null;
    }

    // ── Model calls ───────────────────────────────────────────
    if (message.startsWith('stream')) {
      const model = get('modelID') ?? '';
      return model ? `LLM 调用中…（${model}）` : 'LLM 调用中…';
    }
    if (message.startsWith('llm runtime')) return null;

    // ── Progress ──────────────────────────────────────────────
    if (message.startsWith('loop')) return null; // too frequent, skip
    if (message.startsWith('created')) return null; // skip session noise

    // ── Errors / important ────────────────────────────────────
    if (/error|Error|PermissionDenied|ENOENT|EACCES|failed/i.test(message)) {
      return `⚠️ ${message.slice(0, 150)}`;
    }

    // ── Tool calls ────────────────────────────────────────────
    if (/tool_call|ToolCall/.test(message)) return null; // too noisy
    if (/tool_result|ToolResult/.test(message)) return null;

    // ── Completion ────────────────────────────────────────────
    if (message.startsWith('done') || message === 'done') return '生成完成';
    if (message.startsWith('exiting loop')) return '生成结束，正在整理文件…';
    if (message.startsWith('disposing instance')) return null;

    return null;
  }

  /** Shorten a path to just the last 2 segments for display. */
  private shortPath(p: string): string {
    const parts = p.split('/');
    return parts.slice(-2).join('/');
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
    const style = process.env.OPENCODE_CLI_STYLE ?? 'v1';
    // P3-002: all styles read the full prompt from .agent_builder/prompt.md.
    // The prompt file already contains the complete spec, constraints, manifest
    // requirements, and file checklist — no need to duplicate in argv.
    const instruction = 'Read .agent_builder/prompt.md and generate the project per its instructions. Write all output directly in /workspace.';
    switch (style) {
      case 'v1':
        return ['opencode', 'run', '--dangerously-skip-permissions', '--model', modelArg, instruction];
      case 'v3':
        return ['opencode', 'run', '--model', modelArg, '--json', instruction];
      case 'v0':
      default:
        return ['opencode', '-p', instruction, '-f', 'json'];
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
    // D-016: only inject the provider-specific key (e.g. DEEPSEEK_API_KEY).
    // Remove OPENAI_API_KEY fallback to minimize secret exposure surface.
    if (map['OPENCODE_API_KEY'] && map['OPENCODE_PROVIDER']) {
      const upper = map['OPENCODE_PROVIDER'].toUpperCase();
      map[`${upper}_API_KEY`] = map['OPENCODE_API_KEY'];
      if (map['OPENCODE_BASE_URL']) {
        map[`${upper}_BASE_URL`] = map['OPENCODE_BASE_URL'];
      }
    }
    return map;
  }

  /** The OpenCode prompt is derived from the Spec (never the raw user prompt). */
  private buildPrompt(spec: AgentSpec | WorkflowSpec): string {
    const isAgent = isAgentSpec(spec);
    const requiredFiles = isAgent
      ? [
          'agent_builder_manifest.json',
          'pyproject.toml',
          'README.md',
          'src/main.py',
          'src/openjiuwen_runtime/__init__.py',
          'src/agents/agent.py',
          'tests/test_agent_smoke.py',
        ]
      : [
          'agent_builder_manifest.json',
          'pyproject.toml',
          'README.md',
          'workflow.yaml',
          'src/main.py',
          'src/openjiuwen_runtime/__init__.py',
          'src/workflows/workflow.py',
          'tests/test_workflow_smoke.py',
        ];
    const manifest = isAgent
      ? {
          schema_version: '1.0',
          project_type: 'agent',
          entrypoint: 'src/agents/agent.py',
          test_command: 'pytest tests/test_agent_smoke.py -q',
          run_command: 'python src/main.py',
          example_input: '请查询年假政策',
          runtime: { framework: 'openjiuwen', mode: 'mock-compatible' },
        }
      : {
          schema_version: '1.0',
          project_type: 'workflow',
          entrypoint: 'src/workflows/workflow.py',
          test_command: 'pytest tests/test_workflow_smoke.py -q',
          run_command: 'python -m src.main',
          example_input: { requirement_doc: '示例需求文档内容' },
          runtime: { framework: 'openjiuwen', mode: 'mock-compatible' },
        };
    const lines = [
      `# 生成 OpenJiuwen ${isAgent ? 'Agent' : 'Workflow'} 工程`,
      '',
      `名称：${spec.name}`,
      `描述：${spec.description}`,
      '',
      '约束：',
      '- 生成的 Agent/Workflow 必须通过 src/openjiuwen_runtime 适配层调用 OpenJiuwen。',
      '- 不得使用 LangGraph / CrewAI / Dify 等非 OpenJiuwen 框架。',
      '- 不得硬编码任何 API key。',
      '- 不要依赖联网安装才能通过 smoke test；测试必须能在离线 sandbox 内通过。',
      '- 如果需要外部 LLM SDK，运行时代码只能通过环境变量读取 key，smoke test 必须使用 mock/fake provider。',
      '',
      '必须创建以下文件，路径必须完全一致：',
      ...requiredFiles.map((file) => `- ${file}`),
      '',
      'agent_builder_manifest.json 必须是合法 JSON，内容按以下结构生成：',
      '```json',
      JSON.stringify(manifest, null, 2),
      '```',
      '',
      'smoke test 要求：',
      `- 必须包含 ${isAgent ? 'tests/test_agent_smoke.py' : 'tests/test_workflow_smoke.py'}。`,
      '- pytest tests/ -q 必须通过。',
      '- 测试不得访问真实网络，不得要求真实 API key。',
      '- 测试至少校验 manifest、入口文件、OpenJiuwen adapter、Spec 中的工具/节点配置。',
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
