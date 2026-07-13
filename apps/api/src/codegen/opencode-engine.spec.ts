import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { TemplateEngine } from './template-engine';
import { OpenCodeEngine } from './opencode-engine';
import { SandboxService } from '../sandbox/sandbox.service';
import { createInMemoryDb } from '../testing/in-memory-db';
import { SandboxJobRepository } from '../generations/repositories/sandbox.repository';
import { EventRepository } from '../generations/repositories/event.repository';
import { EventService } from '../generations/event.service';
import { MockSandboxRunner } from '../sandbox/mock-sandbox-runner';
import { DockerSandboxRunner } from '../sandbox/docker-sandbox-runner';
import type { AgentSpec } from '@agent-builder/shared-contracts';
import {
  EventType,
  JobType,
  SandboxRuntime,
  SandboxJobStatus,
  NetworkPolicy,
} from '@agent-builder/shared-contracts';
import { TAROT_AGENT_SPEC } from '../spec/canonical-specs';

function tmpProject(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ab-oc-'));
}

/** Build a real SandboxService backed by in-memory DB (tests only exercise run mock). */
function buildSandboxService(): SandboxService {
  const db = createInMemoryDb();
  const jobRepo = new SandboxJobRepository(db);
  const eventRepo = new EventRepository(db);
  const eventService = new EventService(eventRepo);
  const mockRunner = new MockSandboxRunner();
  const dockerRunner = new DockerSandboxRunner();
  const runsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ab-oc-runs-'));
  return new SandboxService(jobRepo, eventService, mockRunner, dockerRunner, runsDir);
}

describe('OpenCodeEngine', () => {
  // ---------------------------------------------------------------------------
  // Mock mode (requireReal=false) — existing P0 behaviour
  // ---------------------------------------------------------------------------
  describe('template mode (requireReal=false)', () => {
    it('delegates to TemplateEngine and emits opencode_* events', async () => {
      const templateEngine = new TemplateEngine();
      const sandbox = buildSandboxService();
      const engine = new OpenCodeEngine(templateEngine, sandbox, false);
      const projectPath = tmpProject();

      const events: { type: string; message: string }[] = [];
      const files: { path: string }[] = [];

      const result = await engine.generate(
        TAROT_AGENT_SPEC as AgentSpec,
        { generationId: 'gen', versionId: 'ver', projectPath },
        {
          onFile: (f) => files.push({ path: f.path }),
          onEvent: (type, message) => events.push({ type, message }),
        },
      );

      expect(result.engine).toBe('opencode');
      expect(events.map((e) => e.type)).toEqual(
        expect.arrayContaining([
          EventType.OpencodeStarted,
          EventType.OpencodeFileChanged,
          EventType.OpencodeFinished,
        ]),
      );
      const changed = events.filter((e) => e.type === EventType.OpencodeFileChanged);
      expect(changed.length).toBe(files.length);
      // prompt written
      expect(fs.existsSync(path.join(projectPath, '.agent_builder', 'prompt.md'))).toBe(true);

      fs.rmSync(projectPath, { recursive: true, force: true });
    });
  });

  // ---------------------------------------------------------------------------
  // Fallback mode (requireReal=true, opencode unavailable)
  // ---------------------------------------------------------------------------
  describe('fallback mode (requireReal=true, opencode unavailable)', () => {
    it('falls back to TemplateEngine with warning event', async () => {
      const templateEngine = new TemplateEngine();
      const sandbox = buildSandboxService();
      const engine = new OpenCodeEngine(templateEngine, sandbox, true);
      jest.spyOn(engine, 'isOpencodeAvailable').mockReturnValue(false);
      expect(engine.isOpencodeAvailable()).toBe(false);

      const projectPath = tmpProject();
      const events: EventType[] = [];
      const result = await engine.generate(
        TAROT_AGENT_SPEC as AgentSpec,
        { generationId: 'gen', versionId: 'ver', projectPath },
        { onEvent: (type) => events.push(type as EventType) },
      );

      // Fallback uses TemplateEngine directly → result.engine is 'template'.
      expect(result.engine).toBe('template');
      expect(events).not.toContain(EventType.OpencodeStarted);
      expect(fs.existsSync(path.join(projectPath, 'src/agents/agent.py'))).toBe(true);

      fs.rmSync(projectPath, { recursive: true, force: true });
    });

    it('hard-fails when OPENCODE_ALLOW_FALLBACK=false and opencode is unavailable', async () => {
      const templateEngine = new TemplateEngine();
      const sandbox = buildSandboxService();
      // 4th arg allowFallback=false → missing binary must throw, not fall back.
      const engine = new OpenCodeEngine(templateEngine, sandbox, true, false);
      jest.spyOn(engine, 'isOpencodeAvailable').mockReturnValue(false);

      const projectPath = tmpProject();
      await expect(
        engine.generate(
          TAROT_AGENT_SPEC as AgentSpec,
          { generationId: 'gen', versionId: 'ver', projectPath },
        ),
      ).rejects.toThrow(/OPENCODE_ALLOW_FALLBACK=false/);
      // No template files written — the engine did not silently substitute.
      expect(fs.existsSync(path.join(projectPath, 'src/agents/agent.py'))).toBe(false);

      fs.rmSync(projectPath, { recursive: true, force: true });
    });

    it('still falls back when OPENCODE_ALLOW_FALLBACK=true (default) and opencode is unavailable', async () => {
      const templateEngine = new TemplateEngine();
      const sandbox = buildSandboxService();
      const engine = new OpenCodeEngine(templateEngine, sandbox, true, true);
      jest.spyOn(engine, 'isOpencodeAvailable').mockReturnValue(false);

      const projectPath = tmpProject();
      const result = await engine.generate(
        TAROT_AGENT_SPEC as AgentSpec,
        { generationId: 'gen', versionId: 'ver', projectPath },
      );
      expect(result.engine).toBe('template');
      fs.rmSync(projectPath, { recursive: true, force: true });
    });
  });

  // ---------------------------------------------------------------------------
  // Real mode (requireReal=true, opencode available)
  // ---------------------------------------------------------------------------
  describe('real mode (requireReal=true, opencode available)', () => {
    it('executes opencode via SandboxService and scans generated files', async () => {
      const templateEngine = new TemplateEngine();
      const sandbox = buildSandboxService();
      const stderrPath = path.join(os.tmpdir(), `ab-oc-${Date.now()}-stderr.log`);
      fs.writeFileSync(
        stderrPath,
        "ERROR collecting tests/test_agent_smoke.py\nModuleNotFoundError: No module named 'openjiuwen_runtime'\n25 passed in 0.05s\n",
        'utf8',
      );
      // Mock sandbox.run to simulate a successful opencode execution.
      const runMock = jest.spyOn(sandbox, 'run').mockResolvedValue({
        jobId: 'job_oc_1',
        runtime: SandboxRuntime.Mock,
        status: SandboxJobStatus.Success,
        exitCode: 0,
        stdoutPath: '/tmp/stdout.log',
        stderrPath,
        durationMs: 5000,
        mock: true,
      });

      process.env.OPENCODE_CLI_STYLE = 'v1'; // host opencode v1.x

      const engine = new OpenCodeEngine(templateEngine, sandbox, true);
      // opencode IS available on PATH in this env — mock it as available.
      jest.spyOn(engine, 'isOpencodeAvailable').mockReturnValue(true);

      const projectPath = tmpProject();
      // Pre-create some files as if opencode wrote them.
      fs.mkdirSync(path.join(projectPath, 'src', 'agents'), { recursive: true });
      fs.writeFileSync(path.join(projectPath, 'src', 'agents', 'agent.py'), '# agent code', 'utf8');
      fs.writeFileSync(path.join(projectPath, 'README.md'), '# My Agent', 'utf8');
      fs.mkdirSync(path.join(projectPath, 'tests'), { recursive: true });
      fs.writeFileSync(path.join(projectPath, 'tests', 'test_agent_smoke.py'), 'def test(): pass', 'utf8');
      // Also create .agent_builder/ — should be excluded from the file list.
      fs.mkdirSync(path.join(projectPath, '.agent_builder'), { recursive: true });
      fs.writeFileSync(path.join(projectPath, '.agent_builder', 'prompt.md'), 'prompt', 'utf8');

      const events: EventType[] = [];
      const result = await engine.generate(
        TAROT_AGENT_SPEC as AgentSpec,
        { generationId: 'gen', versionId: 'ver', projectPath },
        { onEvent: (type) => events.push(type as EventType) },
      );

      // Sandbox was called with correct args.
      expect(runMock).toHaveBeenCalledTimes(1);
      const runReq = runMock.mock.calls[0][0];
      expect(runReq.jobType).toBe(JobType.OpencodeGeneration);
      expect(runReq.command[0]).toBe('opencode');
      expect(runReq.command[1]).toBe('run');
      expect(runReq.command).toContain('--dangerously-skip-permissions');
      expect(runReq.command).toContain('--model');
      expect(runReq.command).toContain('deepseek/deepseek-v4-pro');
      // P3-002: command now references the prompt file, not inline constraints.
      const lastArg = runReq.command[runReq.command.length - 1];
      expect(lastArg).toContain('.agent_builder/prompt.md');

      delete process.env.OPENCODE_CLI_STYLE;
      expect(runReq.workspacePath).toBe(projectPath);
      expect(runReq.networkPolicy).toBe(NetworkPolicy.Controlled);

      // Result
      expect(result.engine).toBe('opencode');
      expect(result.engine).toBe('opencode');

      // File scanning: .agent_builder/ excluded.
      const filePaths = result.files.map((f) => f.path);
      expect(filePaths).toContain('src/agents/agent.py');
      expect(filePaths).toContain('README.md');
      expect(filePaths).toContain('tests/test_agent_smoke.py');
      expect(filePaths).not.toContain(expect.stringContaining('.agent_builder'));

      // Events
      expect(events).toContain(EventType.OpencodeStarted);
      const fileEvents = events.filter((t) => t === EventType.OpencodeFileChanged);
      expect(fileEvents.length).toBe(3);
      expect(events).toContain(EventType.OpencodeFinished);

      fs.rmSync(projectPath, { recursive: true, force: true });
      fs.rmSync(stderrPath, { force: true });
    });

    it('throws CodeGenerationFailed when sandbox returns failed', async () => {
      const templateEngine = new TemplateEngine();
      const sandbox = buildSandboxService();
      jest.spyOn(sandbox, 'run').mockResolvedValue({
        jobId: 'job_fail',
        runtime: SandboxRuntime.Mock,
        status: SandboxJobStatus.Failed,
        exitCode: 1,
        stdoutPath: '/tmp/stdout.log',
        stderrPath: '/tmp/stderr.log',
        durationMs: 1000,
        mock: true,
      });

      const engine = new OpenCodeEngine(templateEngine, sandbox, true);
      jest.spyOn(engine, 'isOpencodeAvailable').mockReturnValue(true);

      const projectPath = tmpProject();
      await expect(
        engine.generate(
          TAROT_AGENT_SPEC as AgentSpec,
          { generationId: 'gen', versionId: 'ver', projectPath },
        ),
      ).rejects.toThrow(/OpenCode 执行失败/);

      fs.rmSync(projectPath, { recursive: true, force: true });
    });

    it('throws CodeGenerationFailed when sandbox times out', async () => {
      const templateEngine = new TemplateEngine();
      const sandbox = buildSandboxService();
      jest.spyOn(sandbox, 'run').mockResolvedValue({
        jobId: 'job_timeout',
        runtime: SandboxRuntime.Mock,
        status: SandboxJobStatus.Timeout,
        exitCode: null,
        stdoutPath: '/tmp/stdout.log',
        stderrPath: '/tmp/stderr.log',
        durationMs: 180000,
        mock: true,
      });

      const engine = new OpenCodeEngine(templateEngine, sandbox, true);
      jest.spyOn(engine, 'isOpencodeAvailable').mockReturnValue(true);

      const projectPath = tmpProject();
      await expect(
        engine.generate(
          TAROT_AGENT_SPEC as AgentSpec,
          { generationId: 'gen', versionId: 'ver', projectPath },
        ),
      ).rejects.toThrow(/OpenCode 执行失败/);

      fs.rmSync(projectPath, { recursive: true, force: true });
    });
  });

  // ---------------------------------------------------------------------------
  // File scanning
  // ---------------------------------------------------------------------------
  describe('scanProjectFiles', () => {
    it('excludes internal metadata, cache, and bytecode files', () => {
      // Access the private method via bracket notation for testing.
      const templateEngine = new TemplateEngine();
      const sandbox = buildSandboxService();
      const engine = new OpenCodeEngine(templateEngine, sandbox, false);
      const scan = (engine as any).scanProjectFiles.bind(engine);

      const projectPath = tmpProject();
      fs.mkdirSync(path.join(projectPath, '.agent_builder'), { recursive: true });
      fs.writeFileSync(path.join(projectPath, '.agent_builder', 'prompt.md'), 'p');
      fs.mkdirSync(path.join(projectPath, '.opencode'), { recursive: true });
      fs.writeFileSync(path.join(projectPath, '.opencode', 'config.json'), '{}');
      fs.mkdirSync(path.join(projectPath, '.pytest_cache'), { recursive: true });
      fs.writeFileSync(path.join(projectPath, '.pytest_cache', 'README.md'), 'cache');
      fs.writeFileSync(path.join(projectPath, 'README.md'), 'r');
      fs.mkdirSync(path.join(projectPath, 'src'), { recursive: true });
      fs.writeFileSync(path.join(projectPath, 'src', 'main.py'), 'm');
      fs.mkdirSync(path.join(projectPath, 'src', '__pycache__'), { recursive: true });
      fs.writeFileSync(path.join(projectPath, 'src', '__pycache__', 'main.cpython-311.pyc'), 'bytecode');
      fs.writeFileSync(path.join(projectPath, 'src', 'module.pyc'), 'bytecode');

      const files = scan(projectPath);
      const paths = files.map((f: any) => f.path);
      expect(paths).toContain('README.md');
      expect(paths).toContain('src/main.py');
      expect(paths).not.toContain(expect.stringContaining('.agent_builder'));
      expect(paths).not.toContain(expect.stringContaining('.opencode'));
      expect(paths).not.toContain(expect.stringContaining('.pytest_cache'));
      expect(paths).not.toContain(expect.stringContaining('__pycache__'));
      expect(paths).not.toContain(expect.stringContaining('.pyc'));

      fs.rmSync(projectPath, { recursive: true, force: true });
    });
  });

  // ---------------------------------------------------------------------------
  // opencode v1 log parsing (parseOpencodeLog)
  // ---------------------------------------------------------------------------
  describe('parseOpencodeLog (v1 pretty output)', () => {
    const templateEngine = new TemplateEngine();
    const sandbox = buildSandboxService();
    const engine = new OpenCodeEngine(templateEngine, sandbox, false);
    const parse = (line: string) => (engine as any).parseOpencodeLog(line);

    it('parses file read/edit/write actions into progress events', () => {
      // shortPath keeps the last 2 path segments.
      expect(parse('→ Read .agent_builder/prompt.md')).toBe('读取 .agent_builder/prompt.md');
      expect(parse('← Edit src/main.py')).toBe('编辑 src/main.py');
      expect(parse('← Write src/agents/agent.py')).toBe('创建 agents/agent.py');
    });

    it('parses the build/model banner and test-pass lines', () => {
      expect(parse('> build · deepseek-v4-pro')).toBe('开始构建（deepseek-v4-pro）');
      expect(parse('All 21 tests pass.')).toBe('测试通过（21）');
      expect(parse('All tests pass.')).toBe('测试通过');
    });

    it('surfaces Python tracebacks and errors as warnings', () => {
      expect(parse('Traceback (most recent call last):')).toMatch(/^⚠️ Traceback/);
      expect(parse("ModuleNotFoundError: No module named 'src'")).toMatch(/^⚠️ ModuleNotFoundError/);
    });

    it('skips unified-diff hunks and blank lines', () => {
      expect(parse('+import os')).toBeNull();
      expect(parse('-old line')).toBeNull();
      expect(parse('@@ -1,6 +1,9 @@')).toBeNull();
      expect(parse('   ')).toBeNull();
    });

    it('still handles v0 structured message= lines (backward compat)', () => {
      // v0 captures a single-token message + key=val fields.
      expect(parse('message=stream modelID=deepseek-v4-pro')).toBe('LLM 调用中…（deepseek-v4-pro）');
    });
  });

  // ---------------------------------------------------------------------------
  // Env / network policy helpers
  // ---------------------------------------------------------------------------
  describe('buildPrompt', () => {
    it('includes the required agent manifest and smoke test contract', () => {
      const templateEngine = new TemplateEngine();
      const sandbox = buildSandboxService();
      const engine = new OpenCodeEngine(templateEngine, sandbox, false);
      const prompt = (engine as any).buildPrompt(TAROT_AGENT_SPEC);

      expect(prompt).toContain('agent_builder_manifest.json');
      expect(prompt).toContain('src/agents/agent.py');
      expect(prompt).toContain('tests/test_agent_smoke.py');
      expect(prompt).toContain('"test_command": "pytest tests/test_agent_smoke.py -q"');
      expect(prompt).toContain('run_agent(message: str) -> dict');
      expect(prompt).toContain('def run_agent');
      expect(prompt).toContain('`pytest tests/ -q` 必须通过');
      expect(prompt).toContain('setuptools.build_meta');
      expect(prompt).toContain('openjiuwen 框架已预装在沙箱中');
    });
  });

  describe('resolveNetworkPolicy', () => {
    const templateEngine = new TemplateEngine();
    const sandbox = buildSandboxService();
    const engine = new OpenCodeEngine(templateEngine, sandbox, false);
    const resolve = (engine as any).resolveNetworkPolicy.bind(engine);

    afterEach(() => {
      delete process.env.OPENCODE_NETWORK_POLICY;
    });

    it('returns Controlled by default', () => {
      expect(resolve()).toBe(NetworkPolicy.Controlled);
    });

    it('parses "controlled"', () => {
      process.env.OPENCODE_NETWORK_POLICY = 'controlled';
      expect(resolve()).toBe(NetworkPolicy.Controlled);
    });

    it('parses "openjiuwen_only"', () => {
      process.env.OPENCODE_NETWORK_POLICY = 'openjiuwen_only';
      expect(resolve()).toBe(NetworkPolicy.OpenjiuwenOnly);
    });

    it('parses "none"', () => {
      process.env.OPENCODE_NETWORK_POLICY = 'none';
      expect(resolve()).toBe(NetworkPolicy.None);
    });

    it('defaults to Controlled for unknown values', () => {
      process.env.OPENCODE_NETWORK_POLICY = 'bogus';
      expect(resolve()).toBe(NetworkPolicy.Controlled);
    });
  });

  describe('buildEnvAllowlist', () => {
    const templateEngine = new TemplateEngine();
    const sandbox = buildSandboxService();
    const engine = new OpenCodeEngine(templateEngine, sandbox, false);
    const build = (engine as any).buildEnvAllowlist.bind(engine);

    afterEach(() => {
      delete process.env.OPENCODE_API_KEY;
      delete process.env.OPENCODE_BASE_URL;
      delete process.env.OPENCODE_MODEL;
      delete process.env.OPENCODE_PROVIDER;
      delete process.env.DEEPSEEK_API_KEY;
      delete process.env.DEEPSEEK_BASE_URL;
    });

    it('returns empty map when no opencode env vars are set', () => {
      expect(build()).toEqual({});
    });

    it('propagates provider-specific DEEPSEEK_API_KEY (no OPENAI_API_KEY fallback, D-016)', () => {
      process.env.OPENCODE_API_KEY = 'sk-test';
      process.env.OPENCODE_MODEL = 'gpt-4';
      process.env.OPENCODE_PROVIDER = 'deepseek';
      process.env.OPENCODE_BASE_URL = 'https://api.deepseek.com/v1';
      const map = build();
      expect(map).toEqual({
        OPENCODE_API_KEY: 'sk-test',
        OPENCODE_MODEL: 'gpt-4',
        OPENCODE_PROVIDER: 'deepseek',
        OPENCODE_BASE_URL: 'https://api.deepseek.com/v1',
        DEEPSEEK_API_KEY: 'sk-test',
        DEEPSEEK_BASE_URL: 'https://api.deepseek.com/v1',
      });
    });

    it('does not pass through unrelated env vars', () => {
      process.env.OPENCODE_API_KEY = 'sk-test';
      process.env.SECRET_TOKEN = 'shh';
      const map = build();
      expect(map).not.toHaveProperty('SECRET_TOKEN');
    });
  });
});
