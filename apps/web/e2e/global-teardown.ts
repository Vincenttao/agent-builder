/* Playwright globalTeardown: stop the NestJS API started by globalSetup. */
import path from 'node:path';
import fs from 'node:fs';

const REPO_ROOT = path.resolve(process.cwd(), '..', '..');
const API_PID_FILE = path.join(REPO_ROOT, 'apps', 'web', 'test-results', 'api.pid');

export default async function globalTeardown() {
  if (fs.existsSync(API_PID_FILE)) {
    const pid = Number(fs.readFileSync(API_PID_FILE, 'utf8'));
    try {
      // Kill the process group (the npm + ts-node children).
      if (Number.isInteger(pid) && pid > 0) {
        process.kill(-pid, 'SIGTERM');
      }
    } catch {
      // best-effort; the dev server is also killed when the worker exits
    } finally {
      fs.rmSync(API_PID_FILE, { force: true });
    }
  }
}
