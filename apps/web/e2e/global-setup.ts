/* Playwright globalSetup: build shared-contracts + start the NestJS API on :3001. */
import { spawn, execSync } from 'node:child_process';
import path from 'node:path';
import http from 'node:http';
import fs from 'node:fs';

const REPO_ROOT = path.resolve(process.cwd(), '..', '..');
const TEST_RESULTS_DIR = path.join(REPO_ROOT, 'apps', 'web', 'test-results');
const API_PID_FILE = path.join(TEST_RESULTS_DIR, 'api.pid');

async function waitForHealth(url: string, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const ok = await new Promise<boolean>((resolve) => {
        const req = http.get(url, (res) => {
          res.resume();
          resolve(res.statusCode === 200);
        });
        req.on('error', () => resolve(false));
        req.setTimeout(2000, () => {
          req.destroy();
          resolve(false);
        });
      });
      if (ok) return;
    } catch {
      // keep polling
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`API did not become healthy at ${url} within ${timeoutMs}ms`);
}

export default async function globalSetup() {
  // shared-contracts dist must exist for the API to import types at runtime.
  execSync('npm run build:contracts', { stdio: 'inherit', cwd: REPO_ROOT });
  fs.mkdirSync(TEST_RESULTS_DIR, { recursive: true });
  fs.rmSync(API_PID_FILE, { force: true });

  const api = spawn('npm', ['run', 'dev:api'], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    detached: true,
    env: { ...process.env, PORT: '3001', METADATA_DB_PATH: ':memory:' },
  });
  api.unref();
  fs.writeFileSync(API_PID_FILE, String(api.pid), 'utf8');

  await waitForHealth('http://localhost:3001/health', 90_000);
}
