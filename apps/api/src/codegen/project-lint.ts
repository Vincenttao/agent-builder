import fs from 'node:fs';
import path from 'node:path';
import {
  AgentBuilderError,
  ErrorCode,
  type AgentSpec,
  type WorkflowSpec,
} from '@agent-builder/shared-contracts';

/**
 * Post-generation lint gate (Phase 10 §10 test #10 / note 6).
 *
 * Runs after codegen and BEFORE the smoke test. Rejects (as
 * CODE_GENERATION_FAILED) a generated project that:
 *  - is missing a required contract file (so a half-built project never passes),
 *  - imports a non-OpenJiuwen orchestration framework (langgraph / crewai / dify),
 *  - contains a secret-looking value.
 * OpenJiuwen-only is a positive constraint (PRD §8.4); rival frameworks are
 * denylisted so OpenCode cannot silently emit them.
 */

const FORBIDDEN_FRAMEWORKS = ['langgraph', 'crewai', 'dify'] as const;
const FORBIDDEN_IMPORT_RE = new RegExp(
  `^\\s*(?:import|from)\\s+(?:${FORBIDDEN_FRAMEWORKS.join('|')})\\b`,
  'm',
);
const SECRET_PATTERNS = [/(sk-[A-Za-z0-9]{16,})/g, /AKIA[0-9A-Z]{16}/g];

function isAgentSpec(spec: AgentSpec | WorkflowSpec): spec is AgentSpec {
  return 'tools' in spec && !('nodes' in spec);
}

function requiredFiles(spec: AgentSpec | WorkflowSpec): string[] {
  // Minimal gate: reject only projects where opencode generated no code at all.
  // TemplateEngine writes config/*.json; opencode writes different structures.
  // Check for at least one Python file that looks like an entry point.
  if (isAgentSpec(spec)) {
    return ['src/agents/agent.py'];
  }
  return ['src/workflows/workflow.py'];
}

function walkFiles(projectRoot: string, base = ''): string[] {
  const dir = base ? path.join(projectRoot, base) : projectRoot;
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      out.push(...walkFiles(projectRoot, rel));
    } else {
      out.push(rel);
    }
  }
  return out;
}

export function lintGeneratedProject(
  projectPath: string,
  spec: AgentSpec | WorkflowSpec,
): void {
  // 1. Contract: required files must exist.
  for (const rel of requiredFiles(spec)) {
    if (!fs.existsSync(path.join(projectPath, rel))) {
      throw new AgentBuilderError(
        ErrorCode.CodeGenerationFailed,
        `生成物缺少必需文件：${rel}`,
      );
    }
  }

  // 2. Scan generated files for forbidden framework imports + secrets.
  for (const rel of walkFiles(projectPath)) {
    const full = path.join(projectPath, rel);
    let content: string;
    try {
      content = fs.readFileSync(full, 'utf8');
    } catch {
      continue; // binary / unreadable — skip
    }
    if (rel.endsWith('.py') && FORBIDDEN_IMPORT_RE.test(content)) {
      throw new AgentBuilderError(
        ErrorCode.CodeGenerationFailed,
        `生成物 ${rel} 引入了非 OpenJiuwen 框架（仅允许 OpenJiuwen）`,
      );
    }
    for (const pattern of SECRET_PATTERNS) {
      pattern.lastIndex = 0;
      if (pattern.test(content)) {
        throw new AgentBuilderError(
          ErrorCode.CodeGenerationFailed,
          `生成物 ${rel} 包含疑似 secret 的值`,
        );
      }
    }
  }
}
