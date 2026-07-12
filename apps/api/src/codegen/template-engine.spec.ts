import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { TemplateEngine } from './template-engine';
import type { AgentSpec, WorkflowSpec } from '@agent-builder/shared-contracts';
import { TAROT_AGENT_SPEC, PRESALES_WORKFLOW_SPEC } from '../spec/canonical-specs';

function tmpProject(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ab-gen-'));
}

describe('TemplateEngine (Phase 4 §8.2)', () => {
  const engine = new TemplateEngine();

  describe('#1 Agent file tree (PRD FR-003)', () => {
    const projectPath = tmpProject();
    afterAll(() => fs.rmSync(projectPath, { recursive: true, force: true }));

    it('generates the standard Agent directory layout', async () => {
      const result = await engine.generate(
        TAROT_AGENT_SPEC as AgentSpec,
        { generationId: 'gen', versionId: 'ver', projectPath },
      );
      const exists = (rel: string) => fs.existsSync(path.join(projectPath, rel));
      expect(exists('pyproject.toml')).toBe(true);
      expect(exists('README.md')).toBe(true);
      expect(exists('.env.example')).toBe(true);
      expect(exists('config/agent_llm_config.json')).toBe(true);
      expect(exists('config/agent_spec.json')).toBe(true);
      expect(exists('src/agents/__init__.py')).toBe(true);
      expect(exists('src/agents/agent.py')).toBe(true);
      expect(exists('src/tools/__init__.py')).toBe(true);
      expect(exists('src/tools/draw_tarot.py')).toBe(true);
      expect(exists('src/openjiuwen_runtime/__init__.py')).toBe(true);
      expect(exists('src/openjiuwen_runtime/agent_runtime.py')).toBe(true);
      expect(exists('src/openjiuwen_runtime/model_config.py')).toBe(true);
      expect(exists('src/main.py')).toBe(true);
      expect(exists('examples/input.md')).toBe(true);
      expect(exists('tests/test_agent_smoke.py')).toBe(true);
      expect(result.files.length).toBeGreaterThan(10);
    });

    it('writes the Agent Spec as config/agent_spec.json', () => {
      const spec = JSON.parse(
        fs.readFileSync(path.join(projectPath, 'config/agent_spec.json'), 'utf8'),
      ) as AgentSpec;
      expect(spec.agent_id).toBe(TAROT_AGENT_SPEC.agent_id);
      expect(spec.tools[0].name).toBe('draw_tarot');
    });

    it('renders the project name into the README', () => {
      const readme = fs.readFileSync(path.join(projectPath, 'README.md'), 'utf8');
      expect(readme).toContain(TAROT_AGENT_SPEC.name);
      expect(readme).not.toContain('{{PROJECT_NAME}}');
    });
  });

  describe('#2 Workflow file tree (PRD FR-004)', () => {
    const projectPath = tmpProject();
    afterAll(() => fs.rmSync(projectPath, { recursive: true, force: true }));

    it('generates the standard Workflow directory layout', async () => {
      await engine.generate(
        PRESALES_WORKFLOW_SPEC as WorkflowSpec,
        { generationId: 'gen', versionId: 'ver', projectPath },
      );
      const exists = (rel: string) => fs.existsSync(path.join(projectPath, rel));
      expect(exists('pyproject.toml')).toBe(true);
      expect(exists('workflow.yaml')).toBe(true);
      expect(exists('config/workflow_spec.json')).toBe(true);
      expect(exists('src/workflows/__init__.py')).toBe(true);
      expect(exists('src/workflows/workflow.py')).toBe(true);
      expect(exists('src/components/__init__.py')).toBe(true);
      expect(exists('src/components/extract_requirement.py')).toBe(true);
      expect(exists('src/components/match_solution.py')).toBe(true);
      expect(exists('src/components/generate_demo_plan.py')).toBe(true);
      expect(exists('src/components/export_report.py')).toBe(true);
      expect(exists('src/openjiuwen_runtime/workflow_runtime.py')).toBe(true);
      expect(exists('src/main.py')).toBe(true);
      expect(exists('tests/test_workflow_smoke.py')).toBe(true);
    });
  });

  it('#3 emits a file_created callback per file (relative path + size)', async () => {
    const projectPath = tmpProject();
    const files: { path: string; size: number }[] = [];
    const result = await engine.generate(
      TAROT_AGENT_SPEC as AgentSpec,
      { generationId: 'gen', versionId: 'ver', projectPath },
      { onFile: (f) => files.push(f) },
    );
    expect(files.length).toBe(result.files.length);
    expect(files.some((f) => f.path === 'src/agents/agent.py')).toBe(true);
    expect(files.every((f) => !f.path.startsWith('/') && !f.path.includes('..'))).toBe(true);
    fs.rmSync(projectPath, { recursive: true, force: true });
  });

  it('#5 all generated files stay under the project path (no workspace escape)', async () => {
    const projectPath = tmpProject();
    const result = await engine.generate(
      PRESALES_WORKFLOW_SPEC as WorkflowSpec,
      { generationId: 'gen', versionId: 'ver', projectPath },
    );
    for (const f of result.files) {
      const full = path.resolve(projectPath, f.path);
      expect(full.startsWith(projectPath)).toBe(true);
    }
    fs.rmSync(projectPath, { recursive: true, force: true });
  });

  it('#6 refuses to write secret-looking values into generated files', async () => {
    const projectPath = tmpProject();
    const tainted = { ...TAROT_AGENT_SPEC, system_prompt: 'use key sk-' + 'a'.repeat(40) } as AgentSpec;
    await expect(
      engine.generate(
        tainted,
        { generationId: 'gen', versionId: 'ver', projectPath },
      ),
    ).rejects.toThrow(/secret/);
    fs.rmSync(projectPath, { recursive: true, force: true });
  });
});
