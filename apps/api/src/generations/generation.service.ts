import { Injectable, Logger } from '@nestjs/common';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { GenerationRepository } from './repositories/generation.repository';
import { VersionRepository } from './repositories/version.repository';
import { SpecRepository } from './repositories/spec.repository';
import { EventService } from './event.service';
import { SpecParserService } from '../spec/spec-parser.service';
import { SpecValidatorService } from '../spec/spec-validator.service';
import type {
  CreateGenerationRequest,
  Generation,
  ProjectVersion,
  AgentSpec,
  WorkflowSpec,
  AgentBuilderManifest,
} from '@agent-builder/shared-contracts';
import {
  GenerationStatus,
  EventType,
  TestStatus,
  AgentBuilderError,
  ErrorCode,
  canTransition,
} from '@agent-builder/shared-contracts';

/**
 * Orchestrates a generation's lifecycle (architecture §5.2).
 *
 * Phase 9: createGeneration is now non-blocking — it inserts the generation,
 * emits plan_created, and returns immediately. The LLM parse (which can take
 * 5-45s) runs in the async pipeline via parseAndPersistSpec, never on the HTTP
 * path (plan §2.3 item A / §9 implementation task 7). The parsed Spec is
 * persisted to generation_specs so getSpec never re-invokes the LLM (§9 note 1).
 */
@Injectable()
export class GenerationService {
  private readonly logger = new Logger(GenerationService.name);
  /** D-022: in-flight parse promises to prevent concurrent LLM calls. */
  private readonly activeParses = new Map<string, Promise<AgentSpec | WorkflowSpec>>();

  constructor(
    private readonly genRepo: GenerationRepository,
    private readonly versionRepo: VersionRepository,
    private readonly eventService: EventService,
    private readonly specParser: SpecParserService,
    private readonly specValidator: SpecValidatorService,
    private readonly specRepo: SpecRepository,
  ) {}

  async createGeneration(req: CreateGenerationRequest): Promise<Generation> {
    const id = this.genRepo.newId();
    const title = this.deriveTitle(req.prompt, req.type);
    this.genRepo.insert({
      id,
      type: req.type,
      title,
      user_prompt: req.prompt,
      status: GenerationStatus.Pending,
      selected_model: req.model ?? 'default',
      mode: req.mode,
    });

    // pending -> planning: emit a plan event and advance state. Parse happens
    // later in the async pipeline — the HTTP request returns here (§9 task 7).
    await this.eventService.record({
      generation_id: id,
      type: EventType.PlanCreated,
      message: `已创建生成计划：${title}`,
      payload: { type: req.type, title, model: req.model ?? 'default' },
    });
    this.genRepo.updateStatus(id, GenerationStatus.Planning);

    return this.genRepo.getById(id)!;
  }

  /**
   * Parse the prompt into a Spec, validate it, and persist it. Idempotent: if a
   * Spec is already persisted for this generation it is returned without
   * re-invoking the parser (§9 test #9 — a real LLM must not be re-called).
   * Emits a thought event carrying the validated Spec and updates the title.
   */
  async parseAndPersistSpec(id: string): Promise<AgentSpec | WorkflowSpec> {
    const existing = this.specRepo.getByGeneration(id);
    if (existing) return existing.spec;

    // D-022: prevent duplicate LLM calls when called concurrently.
    const inflight = this.activeParses.get(id);
    if (inflight) return inflight;

    const promise = this._doParseAndPersist(id);
    this.activeParses.set(id, promise);
    try {
      return await promise;
    } finally {
      this.activeParses.delete(id);
    }
  }

  private async _doParseAndPersist(id: string): Promise<AgentSpec | WorkflowSpec> {
    const gen = this.genRepo.getById(id);
    if (!gen) {
      throw new AgentBuilderError(ErrorCode.PromptParseFailed, `生成任务 ${id} 不存在`);
    }

    const result = await this.specParser.parse(gen.user_prompt, gen.type);
    const validated = this.specValidator.validate(result.spec) as AgentSpec | WorkflowSpec;
    const specName = 'name' in validated ? validated.name : gen.title;

    this.specRepo.save({
      generation_id: id,
      spec: validated,
      parser_mode: result.parserMode,
      provider: result.provider,
      model: result.model,
      prompt_hash: createHash('sha256').update(gen.user_prompt).digest('hex').slice(0, 16),
      validation_status: 'valid',
    });

    this.genRepo.updateTitle(id, specName);
    await this.eventService.record({
      generation_id: id,
      type: EventType.Thought,
      message: `需求已解析为 Spec：${specName}`,
      payload: {
        spec: validated as unknown as Record<string, unknown>,
        parser_mode: result.parserMode,
        provider: result.provider,
        model: result.model,
      },
    });
    return validated;
  }

  getById(id: string): Generation | null {
    return this.genRepo.getById(id);
  }

  /** Read the persisted Spec for a generation (never re-parses). Throws if the
   * async parse has not completed yet — callers should use parseAndPersistSpec
   * to drive the parse, then this read path is consistent (§9 note 1). */
  getSpec(id: string): AgentSpec | WorkflowSpec {
    const gen = this.genRepo.getById(id);
    if (!gen) {
      throw new AgentBuilderError(ErrorCode.PromptParseFailed, `生成任务 ${id} 不存在`);
    }
    const persisted = this.specRepo.getByGeneration(id);
    if (!persisted) {
      throw new AgentBuilderError(
        ErrorCode.PromptParseFailed,
        `生成任务 ${id} 的 Spec 尚未解析完成`,
      );
    }
    return persisted.spec;
  }

  /** Lifecycle transition used by the orchestrator (architecture §11). */
  transitionTo(id: string, status: GenerationStatus): void {
    const gen = this.genRepo.getById(id);
    if (!gen) {
      this.logger.warn(`transitionTo: generation ${id} not found`);
      return;
    }
    if (canTransition(gen.status as GenerationStatus, status)) {
      this.genRepo.updateStatus(id, status);
    } else {
      this.logger.warn(
        `transitionTo: illegal transition ${gen.status} → ${status} for ${id}`,
      );
    }
  }

  /** Force-reset a generation to Planning for retry loops (D-007). */
  resetToPlanning(id: string): void {
    this.genRepo.updateStatus(id, GenerationStatus.Planning);
  }

  /**
   * Promote a version to active and mark the generation completed.
   * Called only after smoke test passes (Phase 6).
   */
  async promoteVersion(
    generationId: string,
    version: ProjectVersion,
  ): Promise<void> {
    this.genRepo.setActiveVersion(generationId, version.id, version.project_path);
    this.genRepo.markCompleted(generationId);
    await this.eventService.record({
      generation_id: generationId,
      type: EventType.TestFinished,
      message: `测试通过，已发布版本 ${version.version_label}`,
      payload: { version_id: version.id, file_count: version.file_count, mock: version.mock_mode },
    });
  }

  /**
   * Mark a generation failed WITHOUT touching active_version_id — a failed
   * re-generation must never overwrite the last successful version
   * (PRD FR-012 / architecture §5.2).
   */
  async markFailed(
    generationId: string,
    errorCode: string,
    errorMessage: string,
    runId?: string | null,
  ): Promise<void> {
    this.genRepo.markFailed(generationId, errorCode, errorMessage);
    await this.eventService.record({
      generation_id: generationId,
      type: EventType.Error,
      message: errorMessage,
      payload: { error_code: errorCode },
      run_id: runId ?? null,
    });
    this.logger.warn(`Generation ${generationId} failed: ${errorCode} — ${errorMessage}`);
  }

  /** Create a version row (Phase 6 uses this after files are written). */
  createVersion(input: {
    generation_id: string;
    version_label: string;
    summary: string;
    project_path: string;
    file_count: number;
    mock_mode: boolean;
  }): ProjectVersion {
    return this.versionRepo.create({
      id: this.versionRepo.newId(),
      generation_id: input.generation_id,
      version_label: input.version_label,
      summary: input.summary,
      project_path: input.project_path,
      file_count: input.file_count,
      test_status: TestStatus.Skipped,
      mock_mode: input.mock_mode,
    });
  }

  /** The last successfully-completed version (null if none). */
  getActiveVersion(generationId: string): ProjectVersion | null {
    const gen = this.genRepo.getById(generationId);
    if (!gen?.active_version_id) return null;
    return this.versionRepo.getById(gen.active_version_id);
  }

  /**
   * Read the active version's `agent_builder_manifest.json` (P3-005). Used by
   * the UI to prefill example input and surface entrypoint / runtime info.
   * Throws if no active version or the manifest is absent.
   */
  getManifest(generationId: string): AgentBuilderManifest {
    const version = this.getActiveVersion(generationId);
    if (!version) {
      throw new AgentBuilderError(ErrorCode.CodeGenerationFailed, '尚无可用版本');
    }
    const manifestPath = path.join(version.project_path, 'agent_builder_manifest.json');
    if (!fs.existsSync(manifestPath)) {
      throw new AgentBuilderError(ErrorCode.CodeGenerationFailed, '项目缺少 agent_builder_manifest.json');
    }
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as AgentBuilderManifest;
  }

  /** Phase 14: list generations with optional status filter and pagination. */
  listGenerations(filter?: { status?: string; limit?: number; offset?: number }) {
    return this.genRepo.list(filter);
  }

  /** Phase 14: like getById but throws NotFoundException. */
  getByIdOrThrow(id: string): Generation {
    const gen = this.genRepo.getById(id);
    if (!gen) {
      throw new AgentBuilderError(ErrorCode.PromptParseFailed, `生成任务 ${id} 不存在`);
    }
    return gen;
  }

  /** Phase 14: list all versions for a generation. */
  listVersions(generationId: string): ProjectVersion[] {
    return this.versionRepo.listByGeneration(generationId);
  }

  /** Phase 14: compute diff between two versions. */
  diffVersions(
    _generationId: string,
    baseVersionId: string,
    targetVersionId: string,
  ): { files: { path: string; status: string; diff?: string }[] } {
    const base = this.versionRepo.getById(baseVersionId);
    const target = this.versionRepo.getById(targetVersionId);
    if (!base || !target) {
      throw new AgentBuilderError(ErrorCode.CodeGenerationFailed, '版本不存在');
    }
    return computeVersionDiff(base.project_path, target.project_path);
  }

  /** Phase 14: activate a version (must have test_status=passed). */
  activateVersion(generationId: string, versionId: string): ProjectVersion {
    const version = this.versionRepo.getById(versionId);
    if (!version || version.generation_id !== generationId) {
      throw new AgentBuilderError(ErrorCode.CodeGenerationFailed, '版本不存在');
    }
    if (version.test_status !== TestStatus.Passed) {
      throw new AgentBuilderError(ErrorCode.CodeGenerationFailed, '只能激活测试通过的版本');
    }
    this.genRepo.setActiveVersion(generationId, versionId, version.project_path);
    return version;
  }

  /** Phase 14: count existing versions to determine retry index for repair. */
  countVersions(generationId: string): number {
    return this.versionRepo.listByGeneration(generationId).length;
  }

  private deriveTitle(prompt: string, type: string): string {
    const trimmed = prompt.trim().replace(/\s+/g, ' ');
    const suffix = type === 'workflow' ? 'Workflow' : 'Agent';
    if (!trimmed) return `未命名 ${suffix}`;
    const slice = trimmed.length > 24 ? `${trimmed.slice(0, 24)}…` : trimmed;
    return slice;
  }
}

/** Simple line-by-line diff for two directory trees. */
function computeVersionDiff(
  basePath: string,
  targetPath: string,
): { files: { path: string; status: string; diff?: string }[] } {
  const baseFiles = scanRelative(basePath);
  const targetFiles = scanRelative(targetPath);

  const allPaths = new Set([...baseFiles.keys(), ...targetFiles.keys()]);
  const results: { path: string; status: string; diff?: string }[] = [];

  for (const rel of [...allPaths].sort()) {
    const inBase = baseFiles.has(rel);
    const inTarget = targetFiles.has(rel);

    if (!inBase && inTarget) {
      results.push({ path: rel, status: 'added' });
    } else if (inBase && !inTarget) {
      results.push({ path: rel, status: 'deleted' });
    } else {
      const baseContent = fs.readFileSync(path.join(basePath, rel));
      const targetContent = fs.readFileSync(path.join(targetPath, rel));
      if (baseContent.equals(targetContent)) {
        results.push({ path: rel, status: 'unchanged' });
      } else if (isBinary(baseContent)) {
        results.push({ path: rel, status: 'binary' });
      } else {
        const diff = lineDiff(
          baseContent.toString('utf8'),
          targetContent.toString('utf8'),
        );
        results.push({ path: rel, status: 'modified', diff });
      }
    }
  }

  return { files: results };
}

function scanRelative(dir: string): Map<string, string> {
  const map = new Map<string, string>();
  if (!fs.existsSync(dir)) return map;

  const walk = (current: string) => {
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(current, e.name);
      if (e.isDirectory()) {
        if (e.name === '.agent_builder') continue;
        walk(full);
      } else {
        const rel = path.relative(dir, full).split(path.sep).join('/');
        map.set(rel, full);
      }
    }
  };
  walk(dir);
  return map;
}

function isBinary(buf: Buffer): boolean {
  return buf.slice(0, 1024).includes(0);
}

function lineDiff(base: string, target: string): string {
  const baseLines = base.split('\n');
  const targetLines = target.split('\n');
  // Simple LCS-based diff
  const lcs = longestCommonSubsequence(baseLines, targetLines);
  const hunks: string[] = [];
  let bi = 0, ti = 0, li = 0;
  while (bi < baseLines.length || ti < targetLines.length) {
    while (li < lcs.length && bi < baseLines.length && baseLines[bi] !== lcs[li]) {
      hunks.push(`-${baseLines[bi]}`);
      bi++;
    }
    while (li < lcs.length && ti < targetLines.length && targetLines[ti] !== lcs[li]) {
      hunks.push(`+${targetLines[ti]}`);
      ti++;
    }
    if (li < lcs.length) {
      hunks.push(` ${lcs[li]}`);
      bi++; ti++; li++;
    } else {
      while (bi < baseLines.length) { hunks.push(`-${baseLines[bi]}`); bi++; }
      while (ti < targetLines.length) { hunks.push(`+${targetLines[ti]}`); ti++; }
    }
  }
  return hunks.join('\n');
}

function longestCommonSubsequence(a: string[], b: string[]): string[] {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  const result: string[] = [];
  let i = m, j = n;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) { result.unshift(a[i - 1]); i--; j--; }
    else if (dp[i - 1][j] > dp[i][j - 1]) { i--; }
    else { j--; }
  }
  return result;
}
