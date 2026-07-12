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
    callbacks?.onEvent?.(EventType.OpencodeStarted, 'OpenCode 会话启动');

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
          { path: file.path },
        );
      },
    });

    callbacks?.onEvent?.(
      EventType.OpencodeFinished,
      'OpenCode 会话结束',
      { file_count: result.files.length },
    );

    return { ...result, engine: 'opencode' };
  }

  /** Real mode (Phase 10): execute `opencode run` via SandboxService. */
  private async generateReal(
    spec: AgentSpec | WorkflowSpec,
    context: GenerationContext,
    callbacks?: GenerationCallbacks,
  ): Promise<GenerationResult> {
    callbacks?.onEvent?.(EventType.OpencodeStarted, 'OpenCode 会话启动');

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
        callbacks?.onEvent?.(EventType.Thought, msg, { stream });
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

    // Check for fatal errors after scanning. A successful opencode run may keep
    // intermediate pytest/import failures in stderr after it has fixed them, so
    // only inspect stderr when the run failed or produced no usable files.
    const noFilesGenerated = files.length === 0;

    if (result.status !== 'success') {
      let stderrText = '';
      try { stderrText = fs.readFileSync(result.stderrPath, 'utf8'); } catch { /* ok */ }
      const stderrErrors = this.extractOpencodeErrors(stderrText);
      if (stderrErrors) this.logger.warn(`opencode stderr: ${stderrErrors}`);
      throw new AgentBuilderError(
        ErrorCode.CodeGenerationFailed,
        `OpenCode 执行失败 (exit ${result.exitCode})${stderrErrors ? `：${stderrErrors}` : ''}`,
        { jobId: result.jobId, stdoutPath: result.stdoutPath },
      );
    }

    if (noFilesGenerated) {
      let stderrText = '';
      try { stderrText = fs.readFileSync(result.stderrPath, 'utf8'); } catch { /* ok */ }
      const stderrErrors = this.extractOpencodeErrors(stderrText);
      if (stderrErrors) this.logger.warn(`opencode stderr: ${stderrErrors}`);
      throw new AgentBuilderError(
        ErrorCode.CodeGenerationFailed,
        `OpenCode 没有生成可用文件${stderrErrors ? `：${stderrErrors}` : ''}`,
        { jobId: result.jobId, stdoutPath: result.stdoutPath },
      );
    }
    for (const file of files) {
      callbacks?.onFile?.(file);
      callbacks?.onEvent?.(
        EventType.OpencodeFileChanged,
        `OpenCode 写入文件 ${file.path}`,
        { path: file.path },
      );
    }

    callbacks?.onEvent?.(
      EventType.OpencodeFinished,
      'OpenCode 会话结束',
      { file_count: files.length },
    );

    return {
      engine: 'opencode',
      projectPath: context.projectPath,
      files,
      warnings: [],
    };
  }

  /** Recursively scan the project directory, returning project-relative paths. */
  private scanProjectFiles(projectPath: string): GeneratedFile[] {
    const files: GeneratedFile[] = [];
    const excludeDirs = new Set(['.agent_builder', '.opencode', '.pytest_cache', '__pycache__']);

    const walk = (dir: string) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        // Skip our own metadata dirs.
        if (excludeDirs.has(entry.name) && entry.isDirectory()) continue;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath);
        } else {
          if (entry.name.endsWith('.pyc')) continue;
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
    const raw = line.trim();
    if (!raw) return null;

    // ── opencode v1 pretty output (human-readable lines, no message= field).
    // v1 emits "→ Read <path>", "← Edit <path>", "← Write <path>",
    // "All N tests pass.", "> build · <model>", and Python tracebacks. Without
    // this branch a ~180s real run emits zero progress events, so the UI looks
    // stuck at the sandbox-started line for the whole job.
    const v1Action = raw.match(/^[←→]\s*(Read|Write|Edit|Bash|Grep|Glob|Task|TodoWrite)\b\s*(.*)/);
    if (v1Action) {
      const action = v1Action[1];
      const target = v1Action[2].trim();
      const verb: Record<string, string> = {
        Read: '读取', Write: '创建', Edit: '编辑', Bash: '执行',
        Grep: '搜索', Glob: '查找', Task: '子任务', TodoWrite: '更新待办',
      };
      return target ? `${verb[action] ?? action} ${this.shortPath(target)}` : (verb[action] ?? action);
    }
    const buildMatch = raw.match(/^>\s*build\s*[·-]\s*(.+)/);
    if (buildMatch) return `开始构建（${buildMatch[1].trim()}）`;
    const testsPass = raw.match(/^All\s+(\d+)\s+tests?\s+pass/i);
    if (testsPass) return `测试通过（${testsPass[1]}）`;
    if (/^All\s+tests?\s+pass/i.test(raw)) return '测试通过';
    // Python traceback / runtime errors (ModuleNotFoundError, ValueError, …).
    if (/^(Traceback|[A-Za-z_]+Error)/.test(raw)) return `⚠️ ${raw.slice(0, 150)}`;
    // Skip unified-diff hunks and other v1 noise.
    if (/^([-+]|@@)/.test(raw)) return null;

    // ── opencode v0 structured log (message= key=value) ──────────────
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

    // Derive example_input from the Spec's examples field when available,
    // otherwise fall back to a generic placeholder that matches the domain.
    let exampleInput: unknown = '你好，请帮我处理';
    if (isAgent) {
      const agentSpec = spec as AgentSpec;
      if (agentSpec.examples && agentSpec.examples.length > 0) {
        exampleInput = agentSpec.examples[0].input;
      } else if (agentSpec.scenario) {
        exampleInput = `[${agentSpec.scenario}场景的用户输入示例]`;
      }
    }
    // workflow: use the first acceptance check or a generic dict.
    if (!isAgent) {
      const inputs: Record<string, string> = {};
      // workflowSpec doesn't have examples, but acceptance_checks hint at inputs.
      if (spec.acceptance_checks && spec.acceptance_checks.length > 0) {
        inputs['requirement_doc'] = spec.acceptance_checks[0];
      } else {
        inputs['requirement_doc'] = '请描述你的需求';
      }
      exampleInput = inputs;
    }

    const manifest = isAgent
      ? {
          schema_version: '1.0',
          project_type: 'agent',
          entrypoint: 'src/agents/agent.py',
          test_command: 'pytest tests/test_agent_smoke.py -q',
          run_command: 'python src/main.py',
          example_input: exampleInput,
          runtime: { framework: 'openjiuwen', mode: 'real' },
        }
      : {
          schema_version: '1.0',
          project_type: 'workflow',
          entrypoint: 'src/workflows/workflow.py',
          test_command: 'pytest tests/test_workflow_smoke.py -q',
          run_command: 'python -m src.main',
          example_input: exampleInput,
          runtime: { framework: 'openjiuwen', mode: 'real' },
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
      '- 不得硬编码任何 API key。API key / base URL / model 通过环境变量注入：',
      '  - 用 `os.getenv("DEEPSEEK_API_KEY")` 读取 key',
      '  - 用 `os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1")` 读取 base URL',
      '  - 用 `os.getenv("AGENT_BUILDER_MODEL", "deepseek-v4-flash")` 读取模型名',
      `- Agent 的业务逻辑必须通过 LLM 实现：使用 \`openai.OpenAI(base_url=..., api_key=...).chat.completions.create(...)\` 调用大模型。`,
      '- 不要依赖联网安装才能通过 smoke test；测试必须能在离线 sandbox 内通过。',
      '- smoke test 不要求真实 LLM 调用（可能因凭据/网络问题失败），但必须校验工具 handler 调用链和输出结构。',
      '- 平台会把 pytest 作为硬性 smoke gate；`python -m pip install -e . --no-build-isolation` 只是打包质量检查，不应成为测试通过的必要前提。',
      '- 如果生成 pyproject.toml，必须使用标准可安装配置；build-backend 使用 "setuptools.build_meta"，不要使用 "setuptools.backends._legacy:_Backend"。',
      '',
      '必须创建以下文件，路径必须完全一致：',
      ...requiredFiles.map((file) => `- ${file}`),
      '',
      'agent_builder_manifest.json 必须是合法 JSON，内容按以下结构生成：',
      '```json',
      JSON.stringify(manifest, null, 2),
      '```',
      '',
      '平台运行入口要求：',
      isAgent
        ? '- `src/agents/agent.py` 必须暴露 `run_agent(message: str) -> str | dict`，由该函数调用 LLM 处理用户输入、调用工具 handler、生成最终回复；smoke test 必须直接覆盖 `run_agent()`。'
        : '- `src/workflows/workflow.py` 必须暴露 `run_workflow(inputs: dict) -> dict`，由该函数调用 LLM 编排节点逻辑并返回最终输出；smoke test 必须直接覆盖 `run_workflow()`。',
      '- 入口函数在真实运行时可通过环境变量获取 LLM 凭据；smoke test 中可使用 mock/fixture 替代真实 LLM 调用。',
      '- 不得返回占位/模拟文案（如 "这是一个示例回复"）。',
      '',
      'Python 导入路径规范（极其重要，违反会导致 ModuleNotFoundError）：',
      '- `python src/main.py` 执行时，Python 自动将 `src/` 目录加入 sys.path[0]。',
      '- 因此 **src/main.py 中必须使用 `from agents.agent import run_agent`**，严禁写成 `from src.agents.agent import ...`。',
      '- 同理，`src/agents/agent.py` 中导入 openjiuwen_runtime 必须写 `from openjiuwen_runtime import ...`，禁止 `from src.openjiuwen_runtime`。',
      '- 测试文件（tests/）通过 PYTHONPATH=src 运行，测试中导入 Agent 必须写 `from agents.agent import run_agent`。',
      '- 简记：**所有文件都从 src/ 内部视角导入，永远不要写 `from src.` 前缀**。',
      '',
      '代码质量要求：',
      '- Agent 的核心逻辑必须通过 LLM 调用实现（使用 openai 库），而不是纯规则/正则/关键词匹配。',
      '- run_agent() 流程：解析用户 message → 组装 system prompt + 工具定义 → 调用 LLM → 解析 tool_calls → 执行 handler → 将结果回传 LLM 生成最终回复。',
      '- 工具 handler 实现具体业务操作（如文本分析、数据提取），返回结构化结果供 LLM 组织最终输出。',
      '- 如果 Spec 的 examples 字段有示例，应在代码中覆盖这些示例路径以确保业务正确性。',
      '- 中文输出时，注意 Python 字符串中嵌套引号要加反斜杠转义，或使用单引号包裹含双引号的字符串。',
      '',
      'smoke test 要求：',
      `- 必须包含 ${isAgent ? 'tests/test_agent_smoke.py' : 'tests/test_workflow_smoke.py'}。`,
      '- pytest tests/ -q 必须通过。',
      '- 测试不得访问真实网络，不得要求真实 API key。',
      '- 测试至少校验 manifest、入口文件、OpenJiuwen adapter、Spec 中的工具/节点配置。',
      '- 测试必须覆盖真实业务输出：用 Spec 中 examples（如有）或场景化输入调用 run_agent()/run_workflow()，断言返回内容包含预期关键词。',
      '- 推荐自检命令：python -m pytest tests/ -q。若额外验证打包安装，请使用 python -m pip install -e . --no-build-isolation，但安装失败应先修正 pyproject.toml。',
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
