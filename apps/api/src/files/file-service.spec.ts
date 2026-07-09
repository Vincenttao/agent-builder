import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  assertSafePath,
  isExportAllowed,
  scanTree,
  readFileSafe,
  listExportableFiles,
  PathSafetyError,
} from './file-service';

describe('file-service (Phase 6 §6.2 #6, Phase 8 security)', () => {
  let root: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ab-files-'));
    fs.mkdirSync(path.join(root, 'src', 'agents'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src', 'agents', 'agent.py'), 'print("hi")');
    fs.writeFileSync(path.join(root, '.env'), 'OPENJIUWEN_API_KEY=sk-secret');
    fs.writeFileSync(path.join(root, '.env.example'), 'OPENJIUWEN_API_KEY=');
    fs.writeFileSync(path.join(root, 'app.log'), 'log line');
    fs.mkdirSync(path.join(root, '__pycache__'), { recursive: true });
    fs.writeFileSync(path.join(root, '__pycache__', 'x.pyc'), 'pyc');
    // Phase 9 slice H: OpenCode / LLM artifacts must never leak into exports.
    fs.mkdirSync(path.join(root, '.agent_builder'), { recursive: true });
    fs.writeFileSync(path.join(root, '.agent_builder', 'prompt.md'), 'prompt');
    fs.mkdirSync(path.join(root, '.opencode'), { recursive: true });
    fs.writeFileSync(path.join(root, '.opencode', 'config.json'), '{}');
    fs.writeFileSync(path.join(root, 'opencode.json'), '{}');
    fs.writeFileSync(path.join(root, 'opencode.local.json'), '{}');
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  describe('assertSafePath / readFileSafe (#6 path traversal)', () => {
    it('accepts a normal relative path', () => {
      const full = assertSafePath(root, 'src/agents/agent.py');
      expect(full).toBe(path.join(root, 'src', 'agents', 'agent.py'));
    });

      it('rejects absolute paths', () => {
        expect(() => assertSafePath(root, '/etc/passwd')).toThrow(PathSafetyError);
      });

      it('rejects .. traversal (Phase 8: ../../etc/passwd)', () => {
        expect(() => assertSafePath(root, '../../etc/passwd')).toThrow(PathSafetyError);
        expect(() => assertSafePath(root, 'src/../../etc/passwd')).toThrow(PathSafetyError);
      });

      it('readFileSafe returns content for a valid file', () => {
        const res = readFileSafe(root, 'src/agents/agent.py');
        expect(res.path).toBe('src/agents/agent.py');
        expect(res.content).toBe('print("hi")');
      });

      it('readFileSafe rejects traversal', () => {
        expect(() => readFileSafe(root, '../../etc/passwd')).toThrow(PathSafetyError);
      });
  });

  describe('isExportAllowed (export filter — runtime_and_sandbox §13)', () => {
    it('excludes .env, logs, caches, .venv, __pycache__, *.pyc', () => {
      expect(isExportAllowed('.env')).toBe(false);
      expect(isExportAllowed('.env.local')).toBe(false);
      expect(isExportAllowed('app.log')).toBe(false);
      expect(isExportAllowed('__pycache__/x.pyc')).toBe(false);
      expect(isExportAllowed('src/__pycache__/agent.cpython.pyc')).toBe(false);
      expect(isExportAllowed('.venv/bin/python')).toBe(false);
      expect(isExportAllowed('.pytest_cache/v/cache/lastfailed')).toBe(false);
      expect(isExportAllowed('.agent_builder/secrets/key')).toBe(false);
    });

    it('keeps .env.example and source files', () => {
      expect(isExportAllowed('.env.example')).toBe(true);
      expect(isExportAllowed('src/agents/agent.py')).toBe(true);
      expect(isExportAllowed('pyproject.toml')).toBe(true);
      expect(isExportAllowed('tests/test_agent_smoke.py')).toBe(true);
    });

    it('excludes whole .agent_builder/ and .opencode/ dirs (not just secrets/cache) — Phase 9 slice H', () => {
      expect(isExportAllowed('.agent_builder/prompt.md')).toBe(false);
      expect(isExportAllowed('.agent_builder/anything')).toBe(false);
      expect(isExportAllowed('.opencode/config.json')).toBe(false);
      expect(isExportAllowed('.opencode/anything')).toBe(false);
    });

    it('excludes opencode.json and *opencode*.json project config — Phase 9 slice H', () => {
      expect(isExportAllowed('opencode.json')).toBe(false);
      expect(isExportAllowed('.opencode.json')).toBe(false);
      expect(isExportAllowed('config/opencode.json')).toBe(false);
      expect(isExportAllowed('opencode.local.json')).toBe(false);
    });
  });

  describe('scanTree', () => {
    it('builds a file tree with directories and files', () => {
      const tree = scanTree(root);
      const src = tree.find((n) => n.path === 'src');
      expect(src?.type).toBe('directory');
      const agent = src?.children?.find((n) => n.path === 'src/agents');
      expect(agent?.children?.some((n) => n.path === 'src/agents/agent.py')).toBe(true);
    });
  });

  describe('listExportableFiles', () => {
    it('lists source files but never .env / logs / caches', () => {
      const files = listExportableFiles(root);
      expect(files).toContain('src/agents/agent.py');
      expect(files).toContain('.env.example');
      expect(files).not.toContain('.env');
      expect(files).not.toContain('app.log');
      expect(files.some((f) => f.endsWith('.pyc'))).toBe(false);
      expect(files.some((f) => f.includes('__pycache__'))).toBe(false);
    });

    it('never lists .agent_builder/, .opencode/, or opencode*.json (Phase 9 slice H)', () => {
      const files = listExportableFiles(root);
      expect(files.some((f) => f.startsWith('.agent_builder/'))).toBe(false);
      expect(files.some((f) => f.startsWith('.opencode/'))).toBe(false);
      expect(files.some((f) => /opencode.*\.json$/i.test(f))).toBe(false);
    });
  });
});
