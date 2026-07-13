import fs from 'node:fs';
import path from 'node:path';
import { validateRealOpenJiuwenAgent } from './real-openjiuwen-gate';

function tmpDir(): string {
  const dir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'gate-test-'));
  return dir;
}

function writeFile(base: string, relPath: string, content: string): void {
  const full = path.join(base, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
}

const VALID_MANIFEST = {
  schema_version: '1.0',
  project_type: 'agent',
  entrypoint: 'src/agents/agent.py',
  test_command: 'pytest tests/test_agent_smoke.py -q',
  run_command: 'python src/main.py',
  example_input: 'hello',
  engine: 'opencode',
  runtime: { framework: 'openjiuwen', mode: 'real_openjiuwen' },
};

const VALID_AGENT_PY = `
import asyncio, os
from openjiuwen.core.single_agent import AgentCard, ReActAgent, ReActAgentConfig
from openjiuwen.core.foundation.tool import tool
from openjiuwen.core.runner import Runner, DEFAULT_RUNNER_CONFIG

@tool(name="test", description="test tool")
def test_tool(x: str) -> dict:
    return {"x": x}

card = AgentCard(name="test")
agent = ReActAgent(card=card)
config = (ReActAgentConfig()
    .configure_model_client(provider="deepseek", api_key=os.getenv("DEEPSEEK_API_KEY",""),
        api_base=os.getenv("DEEPSEEK_BASE_URL",""), model_name=os.getenv("AGENT_BUILDER_MODEL",""))
    .configure_prompt_template([{"role":"system","content":"You are helpful"}])
    .configure_max_iterations(3))
agent.configure(config)

runner_config = DEFAULT_RUNNER_CONFIG.model_copy(deep=True)
Runner.set_config(runner_config)
Runner.resource_mgr.add_tool(test_tool)
agent.ability_manager.add(test_tool.card)

def run_agent(message: str) -> dict:
    return asyncio.run(_run(message))

async def _run(message: str) -> dict:
    result = await agent.invoke({"query": message})
    return {"reply": result.get("output",""), "tool_calls": []}
`;

describe('validateRealOpenJiuwenAgent', () => {
  it('passes a valid real-openjiuwen project', () => {
    const dir = tmpDir();
    writeFile(dir, 'agent_builder_manifest.json', JSON.stringify(VALID_MANIFEST));
    writeFile(dir, 'src/agents/agent.py', VALID_AGENT_PY);
    writeFile(dir, 'tests/test_agent_smoke.py', '# valid test');
    writeFile(dir, 'pyproject.toml', '[project]\nname="test"');

    const result = validateRealOpenJiuwenAgent(dir);
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('fails when manifest is missing', () => {
    const dir = tmpDir();
    const result = validateRealOpenJiuwenAgent(dir);
    expect(result.ok).toBe(false);
    expect(result.errors).toContain('agent_builder_manifest.json 不存在');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('fails when manifest is invalid JSON', () => {
    const dir = tmpDir();
    writeFile(dir, 'agent_builder_manifest.json', '{ not json');
    const result = validateRealOpenJiuwenAgent(dir);
    expect(result.ok).toBe(false);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('fails when runtime.mode is not real_openjiuwen', () => {
    const dir = tmpDir();
    const manifest = { ...VALID_MANIFEST, runtime: { framework: 'openjiuwen', mode: 'lightweight' } };
    writeFile(dir, 'agent_builder_manifest.json', JSON.stringify(manifest));
    writeFile(dir, 'src/agents/agent.py', VALID_AGENT_PY);

    const result = validateRealOpenJiuwenAgent(dir);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('real_openjiuwen'))).toBe(true);

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('fails when engine is not opencode', () => {
    const dir = tmpDir();
    const manifest = { ...VALID_MANIFEST, engine: 'template' };
    writeFile(dir, 'agent_builder_manifest.json', JSON.stringify(manifest));
    writeFile(dir, 'src/agents/agent.py', VALID_AGENT_PY);

    const result = validateRealOpenJiuwenAgent(dir);
    expect(result.ok).toBe(false);

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('fails when ReActAgent import is missing', () => {
    const dir = tmpDir();
    writeFile(dir, 'agent_builder_manifest.json', JSON.stringify(VALID_MANIFEST));
    writeFile(dir, 'src/agents/agent.py', 'def run_agent(m): return {"reply": "hi"}');

    const result = validateRealOpenJiuwenAgent(dir);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('ReActAgent'))).toBe(true);

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('fails when agent.invoke() is missing', () => {
    const dir = tmpDir();
    const py = VALID_AGENT_PY.replace('agent.invoke(', 'agent.other(');
    writeFile(dir, 'agent_builder_manifest.json', JSON.stringify(VALID_MANIFEST));
    writeFile(dir, 'src/agents/agent.py', py);

    const result = validateRealOpenJiuwenAgent(dir);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('agent.invoke()'))).toBe(true);

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('fails when src/openjiuwen_runtime/ exists', () => {
    const dir = tmpDir();
    writeFile(dir, 'agent_builder_manifest.json', JSON.stringify(VALID_MANIFEST));
    writeFile(dir, 'src/agents/agent.py', VALID_AGENT_PY);
    writeFile(dir, 'src/openjiuwen_runtime/__init__.py', '# stub');

    const result = validateRealOpenJiuwenAgent(dir);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('openjiuwen_runtime'))).toBe(true);

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('fails when project is README-only', () => {
    const dir = tmpDir();
    writeFile(dir, 'agent_builder_manifest.json', JSON.stringify(VALID_MANIFEST));
    writeFile(dir, 'README.md', '# Just a readme');
    // no agent.py, no tests, no pyproject.toml

    const result = validateRealOpenJiuwenAgent(dir);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('不完整'))).toBe(true);

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('warns but does not fail for missing smoke test file', () => {
    const dir = tmpDir();
    writeFile(dir, 'agent_builder_manifest.json', JSON.stringify(VALID_MANIFEST));
    writeFile(dir, 'src/agents/agent.py', VALID_AGENT_PY);
    writeFile(dir, 'pyproject.toml', '[project]\nname="test"');

    const result = validateRealOpenJiuwenAgent(dir);
    expect(result.ok).toBe(false); // fails because tests/ directory is missing
    expect(result.warnings.some((w) => w.includes('smoke'))).toBe(true);

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('does not require @tool when Spec has no tools', () => {
    const dir = tmpDir();
    const noToolPy = VALID_AGENT_PY.replace(/@tool[\s\S]*?def test_tool[\s\S]*?return \{"x": x\}/, '');
    writeFile(dir, 'agent_builder_manifest.json', JSON.stringify(VALID_MANIFEST));
    writeFile(dir, 'src/agents/agent.py', noToolPy);
    writeFile(dir, 'tests/test_agent_smoke.py', '# valid');
    writeFile(dir, 'pyproject.toml', '[project]\nname="test"');

    const result = validateRealOpenJiuwenAgent(dir, { tools: [] } as any);
    // Should pass if no tools declared in spec
    expect(result.ok).toBe(true);

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('requires @tool when Spec declares tools', () => {
    const dir = tmpDir();
    const noToolPy = VALID_AGENT_PY.replace(/@tool[\s\S]*?def test_tool[\s\S]*?return \{"x": x\}/, '');
    writeFile(dir, 'agent_builder_manifest.json', JSON.stringify(VALID_MANIFEST));
    writeFile(dir, 'src/agents/agent.py', noToolPy);
    writeFile(dir, 'tests/test_agent_smoke.py', '# valid');
    writeFile(dir, 'pyproject.toml', '[project]\nname="test"');

    const specWithTools = { tools: [{ name: 'test', description: 'a tool', input_schema: {}, output_schema: {} }] };
    const result = validateRealOpenJiuwenAgent(dir, specWithTools as any);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('@tool'))).toBe(true);

    fs.rmSync(dir, { recursive: true, force: true });
  });
});
