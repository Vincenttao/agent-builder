'use client';

import { useEffect, useState } from 'react';

/**
 * Deep diagnostics fetched from /health/deep (P3-008). Shows whether the real
 * LLM / OpenCode / Docker / Python runner stack is wired up. Key values are
 * never returned by the backend — only presence + non-secret config.
 */
interface Diagnostics {
  llm: { provider: string | null; base_url: string | null; model: string | null; key_present: boolean };
  opencode: { engine: string; cli_style: string; require_real: boolean; provider: string | null; model: string | null; key_present: boolean };
  sandbox: { runner: 'mock' | 'docker'; docker_available: boolean; allowlist_prefixes: number };
  python_runner: { src_present: boolean };
}

function tone(ok: boolean): string {
  return ok ? 'bg-emerald-500' : 'bg-zinc-300';
}

export function Diagnostics() {
  const [diag, setDiag] = useState<Diagnostics | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/health/deep')
      .then((r) => r.json())
      .then((d: Diagnostics) => { if (!cancelled) setDiag(d); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  if (!diag) {
    return (
      <div className="mt-5 border-t border-zinc-200 pt-4">
        <p className="section-label">Runtime</p>
        <p className="mt-3 text-[11px] text-zinc-400">正在读取运行时诊断…</p>
      </div>
    );
  }

  const realOpenCode = diag.opencode.engine === 'opencode' && diag.opencode.require_real && diag.opencode.key_present;
  const realLlm = diag.llm.provider !== 'mock' && diag.llm.key_present;

  return (
    <div className="mt-5 border-t border-zinc-200 pt-4" data-testid="diagnostics">
      <p className="section-label">Runtime Diagnostics</p>
      <div className="mt-3 grid gap-2 text-xs">
        <Row label="Spec LLM" ok={realLlm} value={diag.llm.provider && diag.llm.provider !== 'mock' ? `${diag.llm.provider} / ${diag.llm.model ?? '?'}` : 'mock'} />
        <Row label="Code Engine" ok={diag.opencode.engine === 'opencode'} value={diag.opencode.engine === 'opencode' ? `OpenCode (${diag.opencode.cli_style})` : 'Template'} />
        <Row label="OpenCode Real" ok={realOpenCode} value={diag.opencode.require_real ? 'enabled' : 'disabled'} />
        <Row label="Sandbox" ok={diag.sandbox.docker_available} value={diag.sandbox.docker_available ? 'Docker' : 'Mock'} />
        <Row label="Python Runner" ok={diag.python_runner.src_present} value={diag.python_runner.src_present ? 'present' : 'missing'} />
      </div>
      <p className="mt-3 text-[10px] leading-4 text-zinc-400">
        绿点表示该能力已就绪；密钥仅检测是否存在，不输出值。沙箱 allowlist {diag.sandbox.allowlist_prefixes} 条前缀。
      </p>
    </div>
  );
}

function Row({ label, ok, value }: { label: string; ok: boolean; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2">
      <span className="flex items-center gap-2 text-zinc-600">
        <span className={`h-1.5 w-1.5 rounded-full ${tone(ok)}`} />
        {label}
      </span>
      <span className="font-medium text-zinc-800">{value}</span>
    </div>
  );
}
