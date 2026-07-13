/**
 * Real OpenJiuwen Agent product gate (P4 M4).
 *
 * Called after OpenCode generation and before smoke test.  Scans the
 * generated project and confirms it is a real OpenJiuwen Agent — not a
 * lightweight adapter, mock stub, README-only, or foreign framework.
 *
 * The gate does NOT do Python AST analysis; it uses text-level heuristics
 * (required files, import patterns, forbidden keywords).
 */

import fs from 'node:fs';
import path from 'node:path';
import type { AgentBuilderManifest } from '@agent-builder/shared-contracts';
import { lintGeneratedProject } from './project-lint';
import type { AgentSpec, WorkflowSpec } from '@agent-builder/shared-contracts';

// ── public types ─────────────────────────────────────────────────────────

export interface RealOpenJiuwenGateResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

// ── validation entry ─────────────────────────────────────────────────────

/**
 * Validate that a generated project is a real OpenJiuwen Agent.
 *
 * Required checks (hard failure):
 *  1. manifest exists and is valid JSON
 *  2. project_type === 'agent'
 *  3. runtime.framework === 'openjiuwen'
 *  4. runtime.mode === 'real_openjiuwen'
 *  5. engine === 'opencode'
 *  6. entrypoint file exists
 *  7. Contains `from openjiuwen.core.single_agent import` + `ReActAgent`
 *  8. Contains `from openjiuwen.core.foundation.tool import` or `tool`
 *  9. Contains `agent.invoke(` (or `agent.invoke (`)
 * 10. No `src/openjiuwen_runtime/` directory
 * 11. No forbidden framework keywords (langgraph, crewai, dify)
 * 12. Not README-only (must have entrypoint + test file + pyproject.toml)
 *
 * Optional checks (warnings only):
 *  A. Contains `run_agent(`
 *  B. Contains `asyncio.run(`
 *  C. Contains `DEEPSEEK_API_KEY` or `RUN_LLM` env read
 *  D. Smoke test file exists
 *  E. pyproject.toml exists
 *  F. Contains at least one `@tool` (only if Spec declares tools)
 */
export function validateRealOpenJiuwenAgent(
  projectPath: string,
  spec?: AgentSpec | WorkflowSpec,
): RealOpenJiuwenGateResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // ── 1-5: manifest checks ───────────────────────────────────────────
  const manifestPath = path.join(projectPath, 'agent_builder_manifest.json');
  if (!fs.existsSync(manifestPath)) {
    return { ok: false, errors: ['agent_builder_manifest.json 不存在'], warnings: [] };
  }

  let manifest: AgentBuilderManifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch {
    return { ok: false, errors: ['agent_builder_manifest.json 不是合法 JSON'], warnings: [] };
  }

  if (manifest.project_type !== 'agent') {
    errors.push(`manifest project_type 必须是 'agent'，当前为 '${manifest.project_type}'`);
  }
  if ((manifest.runtime as any)?.framework !== 'openjiuwen') {
    errors.push(
      `manifest runtime.framework 必须是 'openjiuwen'，当前为 '${(manifest.runtime as any)?.framework}'`,
    );
  }
  if ((manifest.runtime as any)?.mode !== 'real_openjiuwen') {
    errors.push(
      `manifest runtime.mode 必须是 'real_openjiuwen'，当前为 '${(manifest.runtime as any)?.mode}'`,
    );
  }
  if ((manifest as any).engine !== 'opencode') {
    errors.push(`manifest engine 必须是 'opencode'，当前为 '${(manifest as any).engine}'`);
  }

  // ── 6: entrypoint exists ────────────────────────────────────────────
  const entrypointPath = path.join(projectPath, manifest.entrypoint ?? 'src/agents/agent.py');
  if (!fs.existsSync(entrypointPath)) {
    errors.push(`entrypoint 文件不存在: ${manifest.entrypoint ?? 'src/agents/agent.py'}`);
  }

  // ── 7-9 + A-C: agent.py content checks ─────────────────────────────
  let agentPyContent = '';
  try {
    agentPyContent = fs.readFileSync(entrypointPath, 'utf8');
  } catch {
    // file missing — already reported above
  }

  if (agentPyContent) {
    // Required import: from openjiuwen.core.single_agent import ... ReActAgent ...
    const hasReActImport =
      /from\s+openjiuwen\.core\.single_agent\s+import/.test(agentPyContent) &&
      /\bReActAgent\b/.test(agentPyContent);
    if (!hasReActImport) {
      errors.push(
        'agent.py 缺少 ReActAgent import: from openjiuwen.core.single_agent import ReActAgent',
      );
    }

    // Required import: from openjiuwen.core.foundation.tool import tool
    const hasToolImport =
      /from\s+openjiuwen\.core\.foundation\.tool\s+import/.test(agentPyContent) &&
      /\btool\b/.test(agentPyContent);
    if (!hasToolImport) {
      errors.push(
        'agent.py 缺少 tool import: from openjiuwen.core.foundation.tool import tool',
      );
    }

    // Required: agent.invoke( call
    if (!/agent\.invoke\s*\(/.test(agentPyContent)) {
      errors.push("agent.py 缺少 agent.invoke() 调用");
    }

    // Warning checks
    if (!/run_agent\s*\(/.test(agentPyContent)) {
      warnings.push('agent.py 缺少 run_agent() 入口函数');
    }
    if (!/asyncio\.run\s*\(/.test(agentPyContent)) {
      warnings.push('agent.py 缺少 asyncio.run() — invoke() 是异步的');
    }
    if (!/(DEEPSEEK_API_KEY|RUN_LLM)/.test(agentPyContent)) {
      warnings.push('agent.py 未读取 DEEPSEEK_API_KEY 或 RUN_LLM 环境变量');
    }

    // @tool check: only required if Spec declares tools
    const specDeclaresTools =
      spec && 'tools' in spec && Array.isArray((spec as AgentSpec).tools) && (spec as AgentSpec).tools.length > 0;
    if (specDeclaresTools && !/@tool\b/.test(agentPyContent)) {
      errors.push('Spec 声明了工具但 agent.py 缺少 @tool 装饰器');
    }
  }

  // ── 10: no src/openjiuwen_runtime/ ────────────────────────────────────
  const adapterDir = path.join(projectPath, 'src', 'openjiuwen_runtime');
  if (fs.existsSync(adapterDir)) {
    errors.push('生成物包含 src/openjiuwen_runtime/ — 真实 OpenJiuwen 已在 Docker 中预装');
  }

  // ── 11: forbidden framework keywords ───────────────────────────────
  try {
    lintGeneratedProject(projectPath, spec ?? ({} as any));
  } catch (lintErr) {
    const msg = lintErr instanceof Error ? lintErr.message : String(lintErr);
    // Only surface framework-related lint errors; benign warnings are ignored
    if (msg.includes('禁止') || msg.includes('langgraph') || msg.includes('crewai') || msg.includes('dify')) {
      errors.push(msg);
    }
  }

  // ── 12: not README-only ────────────────────────────────────────────
  const hasEntrypoint = fs.existsSync(entrypointPath);
  const testDir = path.join(projectPath, 'tests');
  const hasTests =
    fs.existsSync(testDir) &&
    fs.readdirSync(testDir).some((f) => f.startsWith('test_') && f.endsWith('.py'));
  const hasPyproject = fs.existsSync(path.join(projectPath, 'pyproject.toml'));

  if (!hasEntrypoint || !hasTests || !hasPyproject) {
    const missing = [];
    if (!hasEntrypoint) missing.push('entrypoint');
    if (!hasTests) missing.push('smoke test');
    if (!hasPyproject) missing.push('pyproject.toml');
    errors.push(`项目不完整（非 README-only 检查失败）：缺少 ${missing.join('、')}`);
  }

  // ── optional warnings ────────────────────────────────────────────────
  if (!fs.existsSync(path.join(projectPath, 'tests', 'test_agent_smoke.py'))) {
    warnings.push('缺少 tests/test_agent_smoke.py');
  }
  if (!fs.existsSync(path.join(projectPath, 'pyproject.toml'))) {
    warnings.push('缺少 pyproject.toml');
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
  };
}
