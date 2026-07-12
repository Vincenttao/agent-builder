import { Injectable } from '@nestjs/common';
import fs from 'node:fs';
import path from 'node:path';
import type { AgentSpec, WorkflowSpec } from '@agent-builder/shared-contracts';
import { agentTemplateDir, workflowTemplateDir } from '@agent-builder/generated-project-templates';
import type { CodeGenerationEngine, GenerationContext, GenerationResult, GeneratedFile } from './engine';

const SECRET_PATTERNS = [/(sk-[A-Za-z0-9]{16,})/g, /AKIA[0-9A-Z]{16}/g];

function isAgentSpec(spec: AgentSpec | WorkflowSpec): spec is AgentSpec {
  return 'tools' in spec && !('nodes' in spec);
}

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9一-龥]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'project'
  );
}

/**
 * TemplateEngine — deterministic file-tree generation from a Spec (architecture
 * §5.5, P0 plan §8).
 *
 * Files are copied from packages/generated-project-templates/{agent,workflow}
 * into the generation's workspace, the Spec is written as config/*.json, and
 * README placeholders are rendered. Generated files never escape the project
 * path, and no real API key is written (P0 plan §8.2 tests #5/#6).
 */
@Injectable()
export class TemplateEngine implements CodeGenerationEngine {
  readonly name = 'template' as const;

  async generate(
    spec: AgentSpec | WorkflowSpec,
    context: GenerationContext,
    callbacks?: { onFile?: (file: GeneratedFile) => void },
  ): Promise<GenerationResult> {
    const isAgent = isAgentSpec(spec);
    const templateDir = isAgent ? agentTemplateDir() : workflowTemplateDir();
    const substitutions: Record<string, string> = {
      '{{PROJECT_NAME}}': spec.name,
      '{{KIND}}': isAgent ? 'Agent' : 'Workflow',
      '{{PROJECT_DIR}}': slugify(spec.name),
    };

    const files: GeneratedFile[] = [];
    this.copyTree(templateDir, context.projectPath, context.projectPath, substitutions, files, callbacks);

    // Generate tool files from the spec (replaces the generic tool_handler.py stub).
    if (isAgent) {
      const agentSpec = spec as AgentSpec;
      const toolsDir = path.join(context.projectPath, 'src', 'tools');
      fs.mkdirSync(toolsDir, { recursive: true });
      for (const tool of agentSpec.tools) {
        const toolContent = [
          `"""${tool.name} — generated from Agent Spec.`,
          '',
          `Description: ${tool.description}`,
          '"""',
          'from __future__ import annotations',
          '',
          'from typing import Any, Dict',
          '',
          '',
          `def handle(inputs: Dict[str, Any] | None) -> Dict[str, Any]:`,
          `    """${tool.name} has no generated implementation."""`,
          `    raise NotImplementedError("Tool '${tool.name}' requires a real implementation")`,
          '',
        ].join('\n');
        const toolPath = path.join(toolsDir, `${tool.name}.py`);
        this.assertNoSecrets(toolContent, `src/tools/${tool.name}.py`);
        fs.writeFileSync(toolPath, toolContent, 'utf8');
        const toolFile: GeneratedFile = {
          path: `src/tools/${tool.name}.py`,
          size: Buffer.byteLength(toolContent),
        };
        files.push(toolFile);
        callbacks?.onFile?.(toolFile);
      }
    }

    // Write the Spec as config (consumed by the generated runtime at import time).
    const specFile = isAgent ? 'config/agent_spec.json' : 'config/workflow_spec.json';
    const specPath = path.join(context.projectPath, specFile);
    fs.mkdirSync(path.dirname(specPath), { recursive: true });
    const specContent = JSON.stringify(spec, null, 2);
    this.assertNoSecrets(specContent, specFile);
    fs.writeFileSync(specPath, specContent, 'utf8');
    let file: GeneratedFile = { path: specFile, size: specContent.length };
    files.push(file);
    callbacks?.onFile?.(file);

    // T-002: Write agent_builder_manifest.json
    const projectType: 'agent' | 'workflow' = isAgent ? 'agent' : 'workflow';
    const entrypoint = isAgent ? 'src/agents/agent.py' : 'src/workflows/workflow.py';
    const testCommand = isAgent
      ? 'pytest tests/test_agent_smoke.py -q'
      : 'pytest tests/test_workflow_smoke.py -q';
    const manifest = {
      schema_version: '1.0',
      project_type: projectType,
      entrypoint,
      test_command: testCommand,
      run_command: isAgent ? 'python src/main.py' : 'python -m src.workflows.workflow',
      example_input: isAgent ? '你好' : { requirement_doc: '示例需求文档内容' },
      runtime: { framework: 'openjiuwen', mode: 'real' },
    };
    const manifestPath = path.join(context.projectPath, 'agent_builder_manifest.json');
    const manifestContent = JSON.stringify(manifest, null, 2);
    fs.writeFileSync(manifestPath, manifestContent, 'utf8');
    file = { path: 'agent_builder_manifest.json', size: manifestContent.length };
    files.push(file);
    callbacks?.onFile?.(file);

    return {
      engine: 'template',
      projectPath: context.projectPath,
      files,
      warnings: [],
    };
  }

  private copyTree(
    srcDir: string,
    destDir: string,
    rootDir: string,
    subs: Record<string, string>,
    files: GeneratedFile[],
    callbacks?: { onFile?: (file: GeneratedFile) => void },
  ): void {
    fs.mkdirSync(destDir, { recursive: true });
    const entries = fs.readdirSync(srcDir, { withFileTypes: true });
    for (const entry of entries) {
      const src = path.join(srcDir, entry.name);
      const dest = path.join(destDir, entry.name);
      if (entry.isDirectory()) {
        this.copyTree(src, dest, rootDir, subs, files, callbacks);
      } else {
        const raw = fs.readFileSync(src, 'utf8');
        const rendered = this.applySubstitutions(raw, subs);
        this.assertNoSecrets(rendered, entry.name);
        fs.writeFileSync(dest, rendered, 'utf8');
        // Relative to the project root so file_created paths match the tree.
        const rel = path.relative(rootDir, dest).split(path.sep).join('/');
        const file: GeneratedFile = { path: rel, size: Buffer.byteLength(rendered) };
        files.push(file);
        callbacks?.onFile?.(file);
      }
    }
  }

  private applySubstitutions(content: string, subs: Record<string, string>): string {
    let out = content;
    for (const [token, value] of Object.entries(subs)) {
      out = out.split(token).join(value);
    }
    return out;
  }

  /** P0 plan §8.2 test #6: generated content must not contain real API keys. */
  private assertNoSecrets(content: string, fileName: string): void {
    for (const pattern of SECRET_PATTERNS) {
      if (pattern.test(content)) {
        throw new Error(
          `Refusing to write secret-looking value into generated file ${fileName}`,
        );
      }
    }
  }
}
