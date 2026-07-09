import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { lintGeneratedProject } from './project-lint';
import { expectAgentBuilderError } from '../testing/expect-error';
import { ErrorCode, type AgentSpec, type WorkflowSpec } from '@agent-builder/shared-contracts';

describe('lintGeneratedProject (Phase 10 §10 — post-generation lint gate)', () => {
  let root: string;
  const agentSpec = { tools: [{ name: 'x' }] } as unknown as AgentSpec;
  const workflowSpec = { nodes: [{ id: 'start', type: 'start' }] } as unknown as WorkflowSpec;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ab-lint-'));
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  function writeCommon() {
    fs.writeFileSync(path.join(root, 'README.md'), '# x');
    fs.writeFileSync(path.join(root, '.env.example'), 'X=');
    fs.writeFileSync(path.join(root, 'pyproject.toml'), '[project]\nname="x"\n');
  }

  function writeValidAgentProject() {
    fs.mkdirSync(path.join(root, 'src', 'agents'), { recursive: true });
    fs.mkdirSync(path.join(root, 'tests'), { recursive: true });
    fs.mkdirSync(path.join(root, 'config'), { recursive: true });
    writeCommon();
    fs.writeFileSync(path.join(root, 'config', 'agent_spec.json'), '{}');
    fs.writeFileSync(path.join(root, 'src', 'agents', 'agent.py'), 'def build_agent():\n  pass\n');
    fs.writeFileSync(path.join(root, 'tests', 'test_agent_smoke.py'), 'def test_x():\n  pass\n');
  }

  function writeValidWorkflowProject() {
    fs.mkdirSync(path.join(root, 'src', 'workflows'), { recursive: true });
    fs.mkdirSync(path.join(root, 'tests'), { recursive: true });
    fs.mkdirSync(path.join(root, 'config'), { recursive: true });
    writeCommon();
    fs.writeFileSync(path.join(root, 'config', 'workflow_spec.json'), '{}');
    fs.writeFileSync(path.join(root, 'src', 'workflows', 'workflow.py'), 'def build_workflow():\n  pass\n');
    fs.writeFileSync(path.join(root, 'tests', 'test_workflow_smoke.py'), 'def test_x():\n  pass\n');
  }

  it('passes a valid agent project', () => {
    writeValidAgentProject();
    expect(() => lintGeneratedProject(root, agentSpec)).not.toThrow();
  });

  it('passes a valid workflow project', () => {
    writeValidWorkflowProject();
    expect(() => lintGeneratedProject(root, workflowSpec)).not.toThrow();
  });

  it('rejects a missing required file (contract — agent spec)', () => {
    writeValidAgentProject();
    fs.rmSync(path.join(root, 'config', 'agent_spec.json'));
    expectAgentBuilderError(() => lintGeneratedProject(root, agentSpec), ErrorCode.CodeGenerationFailed);
  });

  it('rejects a forbidden framework import (langgraph)', () => {
    writeValidAgentProject();
    fs.writeFileSync(path.join(root, 'src', 'agents', 'agent.py'), 'import langgraph\n');
    expectAgentBuilderError(() => lintGeneratedProject(root, agentSpec), ErrorCode.CodeGenerationFailed);
  });

  it('rejects a forbidden framework import (crewai / dify)', () => {
    writeValidAgentProject();
    fs.writeFileSync(path.join(root, 'src', 'agents', 'agent.py'), 'from crewai import Agent\n');
    expectAgentBuilderError(() => lintGeneratedProject(root, agentSpec), ErrorCode.CodeGenerationFailed);
  });

  it('rejects a secret-looking value in a generated file', () => {
    writeValidAgentProject();
    fs.writeFileSync(path.join(root, 'src', 'agents', 'agent.py'), 'KEY = "sk-1234567890abcdefGHIJKL"\n');
    expectAgentBuilderError(() => lintGeneratedProject(root, agentSpec), ErrorCode.CodeGenerationFailed);
  });
});
