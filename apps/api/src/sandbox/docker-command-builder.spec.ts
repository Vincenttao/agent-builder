import { buildDockerArgs } from './docker-command-builder';
import { SandboxRuntime, type ResourceLimits } from '@agent-builder/shared-contracts';

const WORKSPACE = '/repo/workspace/generated/gen_x/ver_y';
const IMAGE = 'agent-builder-sandbox:latest';
const CMD = ['python', '-m', 'pytest', 'tests/test_agent_smoke.py'];

describe('buildDockerArgs (Phase 3 §7.2 — Docker baseline)', () => {
  it('#1 uses docker run --rm with the image and command appended', () => {
    const args = buildDockerArgs({
      runtime: SandboxRuntime.Docker,
      image: IMAGE,
      workspacePath: WORKSPACE,
      command: CMD,
    });
    expect(args[0]).toBe('docker');
    expect(args[1]).toBe('run');
    expect(args[2]).toBe('--rm');
    expect(args[args.length - 1]).toBe('tests/test_agent_smoke.py');
    // Image is followed verbatim by the command argv (no sh -c wrapping).
    const imgIdx = args.lastIndexOf(IMAGE);
    expect(imgIdx).toBeGreaterThan(-1);
    expect(args.slice(imgIdx + 1)).toEqual(CMD);
  });

  it('#2 default network policy is none', () => {
    const args = buildDockerArgs({
      runtime: SandboxRuntime.Docker,
      image: IMAGE,
      workspacePath: WORKSPACE,
      command: CMD,
    });
    const netIdx = args.indexOf('--network');
    expect(netIdx).toBeGreaterThan(-1);
    expect(args[netIdx + 1]).toBe('none');
  });

  it('#3 includes CPU, memory and pids resource limits', () => {
    const limits: ResourceLimits = { cpus: 1, memory: '1g', pids_limit: 256 };
    const args = buildDockerArgs({
      runtime: SandboxRuntime.Docker,
      image: IMAGE,
      workspacePath: WORKSPACE,
      command: CMD,
      resourceLimits: limits,
    });
    expect(args).toEqual(expect.arrayContaining(['--cpus', '1', '--memory', '1g', '--pids-limit', '256']));
  });

  it('#4 mounts ONLY the current generation/version workspace', () => {
    const args = buildDockerArgs({
      runtime: SandboxRuntime.Docker,
      image: IMAGE,
      workspacePath: WORKSPACE,
      command: CMD,
    });
    const mounts = args.filter((_, i) => args[i - 1] === '-v');
    expect(mounts).toEqual([`${WORKSPACE}:/workspace:rw`]);
    // #7 critical: never mount the host docker socket.
    expect(args.some((a) => a.includes('/var/run/docker.sock'))).toBe(false);
    expect(args.some((a) => a.includes('/:/'))).toBe(false);
  });

  it('applies hardening flags (cap-drop ALL, no-new-privileges, read-only, tmpfs)', () => {
    const args = buildDockerArgs({
      runtime: SandboxRuntime.Docker,
      image: IMAGE,
      workspacePath: WORKSPACE,
      command: CMD,
    });
    expect(args).toEqual(
      expect.arrayContaining([
        '--cap-drop',
        'ALL',
        '--security-opt',
        'no-new-privileges',
        '--read-only',
        '--tmpfs',
        '/tmp:rw,nosuid,nodev,size=256m',
      ]),
    );
    expect(args).not.toContain('--privileged');
  });

  it('sets working dir to /workspace', () => {
    const args = buildDockerArgs({
      runtime: SandboxRuntime.Docker,
      image: IMAGE,
      workspacePath: WORKSPACE,
      command: CMD,
    });
    const wIdx = args.indexOf('-w');
    expect(args[wIdx + 1]).toBe('/workspace');
  });

  it('uses podman binary for podman runtime', () => {
    const args = buildDockerArgs({
      runtime: SandboxRuntime.Podman,
      image: IMAGE,
      workspacePath: WORKSPACE,
      command: CMD,
    });
    expect(args[0]).toBe('podman');
  });

  it('adds --runtime=runsc for gVisor (P0+ target)', () => {
    const args = buildDockerArgs({
      runtime: SandboxRuntime.Gvisor,
      image: IMAGE,
      workspacePath: WORKSPACE,
      command: CMD,
    });
    expect(args).toContain('--runtime=runsc');
  });

  it('never wraps the command in a shell (no sh -c)', () => {
    const args = buildDockerArgs({
      runtime: SandboxRuntime.Docker,
      image: IMAGE,
      workspacePath: WORKSPACE,
      command: CMD,
    });
    const imageIdx = args.lastIndexOf(IMAGE);
    const afterImage = args.slice(imageIdx + 1);
    expect(afterImage).toEqual(CMD); // appended verbatim, no sh -c
  });
});
