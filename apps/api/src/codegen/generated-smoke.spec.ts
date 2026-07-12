import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createInMemoryDb } from '../testing/in-memory-db';
import { SandboxJobRepository } from '../generations/repositories/sandbox.repository';
import { EventRepository } from '../generations/repositories/event.repository';
import { EventService } from '../generations/event.service';
import { SandboxService } from '../sandbox/sandbox.service';
import { MockSandboxRunner } from '../sandbox/mock-sandbox-runner';
import { DockerSandboxRunner } from '../sandbox/docker-sandbox-runner';
import { TemplateEngine } from './template-engine';
import { TAROT_AGENT_SPEC, PRESALES_WORKFLOW_SPEC } from '../spec/canonical-specs';
import { JobType, SandboxRuntime, type AgentSpec, type WorkflowSpec } from '@agent-builder/shared-contracts';

/**
 * End-to-end: generate a project with the TemplateEngine, then run its smoke
 * test inside the (mock) sandbox. Validates that the generated Agent/Workflow
 * projects actually run (Phase 5 §9.4 #4/#5; PRD FR-006).
 */
describe('generated project smoke tests (Phase 5 §9.4 #4/#5)', () => {
  const db = createInMemoryDb();
  const jobRepo = new SandboxJobRepository(db);
  const eventRepo = new EventRepository(db);
  const eventService = new EventService(eventRepo);
  const mockRunner = new MockSandboxRunner();
  const dockerRunner = new DockerSandboxRunner();
  const runsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ab-smoke-'));
  const sandbox = new SandboxService(jobRepo, eventService, mockRunner, dockerRunner, runsDir);
  const templateEngine = new TemplateEngine();

  afterAll(() => {
    db.close();
    fs.rmSync(runsDir, { recursive: true, force: true });
  });

  it('#4 tarot Agent smoke test passes in the sandbox', async () => {
    const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'ab-agent-'));
    try {
      await templateEngine.generate(
        TAROT_AGENT_SPEC as AgentSpec,
        { generationId: 'gen', versionId: 'ver', projectPath },
      );

      const result = await sandbox.run({
        generationId: 'gen_smoke',
        versionId: 'ver',
        jobType: JobType.SmokeTest,
        command: ['python', '-m', 'pytest', 'tests/test_agent_smoke.py', '-q'],
        workspacePath: projectPath,
        runtime: SandboxRuntime.Mock,
        timeoutSeconds: 60,
      });

      expect(result.status).toBe('success' as never);
      expect(result.exitCode).toBe(0);
      // #3 run record carries stdout/stderr paths.
      expect(fs.existsSync(result.stdoutPath)).toBe(true);
      expect(fs.existsSync(result.stderrPath)).toBe(true);
    } finally {
      fs.rmSync(projectPath, { recursive: true, force: true });
    }
  });

  it('#5 presales Workflow smoke test passes in the sandbox', async () => {
    const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'ab-wf-'));
    try {
      await templateEngine.generate(
        PRESALES_WORKFLOW_SPEC as WorkflowSpec,
        { generationId: 'gen', versionId: 'ver', projectPath },
      );

      const result = await sandbox.run({
        generationId: 'gen_smoke',
        versionId: 'ver',
        jobType: JobType.SmokeTest,
        command: ['python', '-m', 'pytest', 'tests/test_workflow_smoke.py', '-q'],
        workspacePath: projectPath,
        runtime: SandboxRuntime.Mock,
        timeoutSeconds: 60,
      });

      expect(result.status).toBe('success' as never);
      expect(result.exitCode).toBe(0);
    } finally {
      fs.rmSync(projectPath, { recursive: true, force: true });
    }
  });
});
