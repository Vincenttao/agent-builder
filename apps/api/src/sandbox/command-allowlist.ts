/**
 * Command allowlist for the sandbox (runtime_and_sandbox §7, architecture §12).
 *
 * Commands are passed as an argv and spawned WITHOUT a shell — user input is
 * never concatenated into a shell string (P0 plan §7.5 note 1). A command may
 * run only if it (a) is non-empty, (b) contains no forbidden token, (c) has no
 * path-escaping args (absolute paths or `..`), and (d) matches an allowed
 * command prefix.
 */

/** Tokens that may never appear as a command argv element. */
export const FORBIDDEN_TOKENS: readonly string[] = [
  'sudo',
  'rm',
  'curl',
  'wget',
  'ssh',
  'scp',
  'docker',
  'podman',
  'chmod',
  'chown',
  'bash',
  'sh',
  'zsh',
  'fish',
  'nc',
  'telnet',
  'dd',
  'mkfs',
  'kill',
  'killall',
  'pkill',
  'shutdown',
  'reboot',
] as const;

/**
 * Allowed command prefixes. The remainder of the argv (e.g. test-file paths)
 * is permitted as long as it passes the path-escape + forbidden-token checks.
 */
export const ALLOWED_PREFIXES: readonly string[][] = [
  ['opencode', 'run'],
  ['opencode', '-p'],       // v0 legacy
  ['opencode', 'serve'],
  ['python', '--version'],
  ['python', '-m', 'pytest'],
  ['python', 'src/main.py'],
  ['python', '-m', 'src.main'],
  ['python', '-m', 'pip'],
  ['python', '-m', 'python_runner.cli'],
  ['python3', '--version'],
  ['python3', '-m', 'pytest'],
  ['python3', 'src/main.py'],
  ['python3', '-m', 'src.main'],
  ['python3', '-m', 'pip'],
  ['python3', '-m', 'python_runner.cli'],
];

/** Env vars that may be injected into a sandbox (runtime_and_sandbox §5). */
export const ENV_ALLOWLIST: readonly string[] = [
  'OPENJIUWEN_API_KEY',
  'OPENJIUWEN_BASE_URL',
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'PATH',
  'HOME',
  'PYTHONPATH',
  'PYTHONDONTWRITEBYTECODE',
  'PYTHONUNBUFFERED',
  'OPENCODE_API_KEY',
  'OPENCODE_BASE_URL',
  'OPENCODE_MODEL',
  'OPENCODE_PROVIDER',
  'DEEPSEEK_API_KEY',
  'DEEPSEEK_BASE_URL',
  'LOGURU_LEVEL',
  'AGENT_BUILDER_MODEL',
] as const;

export interface AllowlistResult {
  ok: boolean;
  reason?: string;
}

function matchesPrefix(command: string[]): boolean {
  return ALLOWED_PREFIXES.some((prefix) => {
    if (command.length < prefix.length) return false;
    return prefix.every((token, i) => command[i] === token);
  });
}

function hasPathEscape(command: string[]): boolean {
  // Only match .. as a path segment, not as ... (ellipsis) or foo..bar.
  const pathTraversal = /(?:^|\/)\.\.(?:$|\/)/;
  return command.some((arg) => arg.startsWith('/') || pathTraversal.test(arg));
}

export function isCommandAllowed(command: string[]): AllowlistResult {
  if (!command || command.length === 0) {
    return { ok: false, reason: 'empty command' };
  }
  const forbidden = command.find((arg) => (FORBIDDEN_TOKENS as readonly string[]).includes(arg));
  if (forbidden) {
    return { ok: false, reason: `forbidden token: ${forbidden}` };
  }
  if (hasPathEscape(command)) {
    return { ok: false, reason: 'command contains absolute path or ..' };
  }
  if (!matchesPrefix(command)) {
    return { ok: false, reason: `command not in allowlist: ${command.slice(0, 3).join(' ')}…` };
  }
  return { ok: true };
}

/** Filter an env map to the allowlist (secrets only injected when listed). */
export function filterEnv(
  env: Record<string, string | undefined>,
  allowlist: Record<string, string> = {},
): Record<string, string | undefined> {
  const result: Record<string, string | undefined> = {};
  for (const key of ENV_ALLOWLIST) {
    if (key in allowlist) {
      result[key] = allowlist[key];
    } else if (key in env) {
      result[key] = env[key];
    }
  }
  return result;
}
