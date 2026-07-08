import {
  isCommandAllowed,
  filterEnv,
  FORBIDDEN_TOKENS,
  ALLOWED_PREFIXES,
} from './command-allowlist';

describe('command-allowlist (Phase 3 §7.2)', () => {
  describe('isCommandAllowed', () => {
    it('allows opencode run / serve', () => {
      expect(isCommandAllowed(['opencode', 'run', '--format', 'json', '.agent_builder/prompt.md']).ok).toBe(true);
      expect(isCommandAllowed(['opencode', 'serve', '--port', '7777']).ok).toBe(true);
    });

    it('allows python --version and python -m pytest <testfile>', () => {
      expect(isCommandAllowed(['python', '--version']).ok).toBe(true);
      expect(
        isCommandAllowed(['python', '-m', 'pytest', 'tests/test_agent_smoke.py']).ok,
      ).toBe(true);
      expect(isCommandAllowed(['python', 'src/main.py']).ok).toBe(true);
      expect(isCommandAllowed(['python', '-m', 'src.main']).ok).toBe(true);
    });

    it('#7 forbids dangerous commands (never enter the container)', () => {
      expect(isCommandAllowed(['rm', '-rf', '/']).ok).toBe(false);
      expect(isCommandAllowed(['sudo', 'python', 'src/main.py']).ok).toBe(false);
      expect(isCommandAllowed(['curl', 'http://evil.example']).ok).toBe(false);
      expect(isCommandAllowed(['docker', 'run', 'evil']).ok).toBe(false);
      expect(isCommandAllowed(['chmod', '777', '/workspace']).ok).toBe(false);
      expect(isCommandAllowed(['bash', '-c', 'rm -rf /']).ok).toBe(false);
    });

    it('forbids shell interpreters even with a python wrapper', () => {
      expect(isCommandAllowed(['sh', '-c', 'python src/main.py']).ok).toBe(false);
      expect(isCommandAllowed(['python', '-c', 'import os; os.system("rm -rf /")']).ok).toBe(false);
    });

    it('forbids path-escaping args (absolute paths / ..)', () => {
      expect(isCommandAllowed(['python', '/etc/passwd']).ok).toBe(false);
      expect(isCommandAllowed(['python', '-m', 'pytest', '../../etc/passwd']).ok).toBe(false);
    });

    it('forbids empty command', () => {
      expect(isCommandAllowed([]).ok).toBe(false);
    });

    it('returns a human-readable reason on rejection', () => {
      const r = isCommandAllowed(['rm', '-rf', '/']);
      expect(r.ok).toBe(false);
      expect(r.reason).toMatch(/forbidden token: rm/);
    });

    it('FORBIDDEN_TOKENS and ALLOWED_PREFIXES are non-empty', () => {
      expect(FORBIDDEN_TOKENS.length).toBeGreaterThan(5);
      expect(ALLOWED_PREFIXES.length).toBeGreaterThan(3);
    });
  });

  describe('filterEnv', () => {
    it('keeps only allowlisted vars and injects provided secrets', () => {
      const filtered = filterEnv(
        { PATH: '/usr/bin', HOME: '/home/sandbox', OPENAI_API_KEY: 'should-not-leak', RANDOM_VAR: 'x' },
        { OPENJIUWEN_API_KEY: 'injected-secret' },
      );
      expect(filtered.PATH).toBe('/usr/bin');
      expect(filtered.HOME).toBe('/home/sandbox');
      expect(filtered.OPENJIUWEN_API_KEY).toBe('injected-secret');
      expect(filtered.OPENAI_API_KEY).toBe('should-not-leak'); // allowlisted env var
      expect(filtered.RANDOM_VAR).toBeUndefined(); // non-allowlisted dropped
    });
  });
});
