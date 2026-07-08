import { Injectable, Logger } from '@nestjs/common';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import type { AgentSpec, WorkflowSpec } from '@agent-builder/shared-contracts';
import { EventType } from '@agent-builder/shared-contracts';
import type {
  CodeGenerationEngine,
  GenerationContext,
  GenerationResult,
  GenerationCallbacks,
  GeneratedFile,
} from './engine';
import { TemplateEngine } from './template-engine';

/**
 * OpenCodeEngine — calls `opencode run` / task-level `opencode serve` to
 * generate or modify code (architecture §2.3, §5.5, runtime_and_sandbox §10).
 *
 * P0 constraint: OpenCode is the code-generation execution layer, NOT the
 * Agent/Workflow runtime — generated code still targets the OpenJiuwen adapter
 * (P0 plan §8.5 note 1). OpenCode may not pick LangGraph/CrewAI/Dify (note 2).
 *
 * Two modes:
 *  - mockMode (default, P0 — opencode unavailable): emits opencode_started /
 *    opencode_file_changed / opencode_finished around a TemplateEngine run,
 *    so the event mapping is exercised without a real opencode binary.
 *  - real mode (requireReal=true): if opencode is available it would invoke
 *    `opencode run`; if unavailable it FALLS BACK to TemplateEngine
 *    (P0 plan §8.2 test #4) with a warning event.
 */
@Injectable()
export class OpenCodeEngine implements CodeGenerationEngine {
  private readonly logger = new Logger(OpenCodeEngine.name);
  readonly name = 'opencode' as const;

  constructor(
    private readonly templateEngine: TemplateEngine,
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
    // #4: real mode + opencode unavailable -> reliable TemplateEngine fallback.
    if (this.requireReal && !this.isOpencodeAvailable()) {
      this.logger.warn('OpenCode unavailable — falling back to TemplateEngine.');
      callbacks?.onEvent?.(
        EventType.OpencodeFinished,
        'OpenCode 不可用，已回退到 TemplateEngine',
        { fallback: true },
      );
      return this.templateEngine.generate(spec, context, callbacks);
    }

    // mock-opencode flow (P0): emit opencode_* events around template generation.
    callbacks?.onEvent?.(EventType.OpencodeStarted, 'OpenCode 会话启动', { mock: true });

    // prompt written to /workspace/.agent_builder/prompt.md (runtime_and_sandbox §10.1).
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
