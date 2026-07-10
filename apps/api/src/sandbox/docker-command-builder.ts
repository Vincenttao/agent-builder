import {
  SandboxRuntime,
  NetworkPolicy,
  type ResourceLimits,
  DEFAULT_RESOURCE_LIMITS,
} from '@agent-builder/shared-contracts';

/**
 * Builds the hardened container argv (runtime_and_sandbox §8).
 *
 * Pure function — no shell, no user-input concatenation. The returned argv is
 * spawned directly so there is exactly one command and no shell interpretation.
 */
export interface DockerCommandInput {
  runtime: SandboxRuntime;
  image: string;
  workspacePath: string;
  command: string[];
  networkPolicy?: NetworkPolicy;
  resourceLimits?: ResourceLimits;
  /** Env vars to inject into the container (-e KEY=VALUE). */
  envAllowlist?: Record<string, string>;
}

const RUNTIME_BINARIES: Record<string, string> = {
  docker: 'docker',
  podman: 'podman',
  gvisor: 'docker', // gVisor uses docker + --runtime=runsc
};

export function buildDockerArgs(input: DockerCommandInput): string[] {
  const bin = RUNTIME_BINARIES[input.runtime] ?? 'docker';
  const limits = { ...DEFAULT_RESOURCE_LIMITS, ...input.resourceLimits };
  const network = input.networkPolicy ?? NetworkPolicy.None;

  const args: string[] = [bin, 'run', '--rm'];

  // gVisor runtime flag (P0+ target — architecture §12).
  if (input.runtime === SandboxRuntime.Gvisor) {
    args.push('--runtime=runsc');
  }

  // #2 network policy: none = fully isolated; else default bridge (outbound ok).
  if (network === NetworkPolicy.None) {
    args.push('--network', 'none');
  }
  // controlled / openjiuwen_only → Docker default bridge (internet access, isolated)

  // #3 resource limits: CPU, memory, pids.
  args.push('--cpus', String(limits.cpus));
  args.push('--memory', limits.memory);
  args.push('--pids-limit', String(limits.pids_limit));

  // Hardening: drop all caps, no new privileges.
  // (No --read-only: opencode needs to write to /workspace and /root.)
  args.push('--cap-drop', 'ALL');
  args.push('--security-opt', 'no-new-privileges');

  // #4 mount ONLY the current generation/version workspace; never the host
  // docker socket, never the host root (architecture §12 constraint #10).
  args.push('-v', `${input.workspacePath}:/workspace:rw`);
  args.push('-w', '/workspace');

  // Inject env vars (API keys, model config) into the container.
  if (input.envAllowlist) {
    for (const [key, val] of Object.entries(input.envAllowlist)) {
      if (val) args.push('-e', `${key}=${val}`);
    }
  }

  args.push(input.image);
  // The command argv is appended verbatim — no shell wrapping.
  args.push(...input.command);

  return args;
}
