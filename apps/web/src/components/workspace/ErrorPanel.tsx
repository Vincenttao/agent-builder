'use client';

import { useEffect, useState } from 'react';
import type { GenerationEvent, GenerationDto } from '@agent-builder/shared-contracts';
import { EventType } from '@agent-builder/shared-contracts';
import { repairGeneration, fallbackGeneration, getRuns, getRunLog } from '@/lib/api';

interface RunLogTail {
  stdout: string;
  stderr: string;
  run_id: string;
}

export function ErrorPanel({
  events,
  gen,
  onRepair,
}: {
  events: GenerationEvent[];
  gen: GenerationDto | null;
  onRepair: (newVersionLabel: string) => void;
}) {
  const [repairing, setRepairing] = useState(false);
  const [fallingBack, setFallingBack] = useState(false);
  const [repairResult, setRepairResult] = useState<string | null>(null);
  const [runLog, setRunLog] = useState<RunLogTail | null>(null);

  const errorEvent = events.find((e) => e.type === EventType.Error);
  const errorCode = (errorEvent?.payload?.error_code as string) ?? gen?.error_code ?? 'UNKNOWN';
  const errorMessage = errorEvent?.message ?? gen?.error_message ?? '未知错误';

  const sandboxEvents = events.filter(
    (e) => e.type === EventType.SandboxFinished || e.type === EventType.TestFinished,
  );

  // P3-009: surface the latest run's stdout/stderr tail so a failure is
  // explainable from the UI (not just event summaries).
  useEffect(() => {
    if (!gen) return;
    let cancelled = false;
    getRuns(gen.generation_id)
      .then(async (runs) => {
        if (!runs.length || cancelled) return;
        const latest = runs[0]; // listByGeneration is DESC by started_at
        const [out, err] = await Promise.all([
          getRunLog(gen.generation_id, latest.id, 'stdout', 200),
          getRunLog(gen.generation_id, latest.id, 'stderr', 200),
        ]);
        if (!cancelled) setRunLog({ stdout: out.content, stderr: err.content, run_id: latest.id });
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [gen]);

  // P3-003: offer template fallback only when the generation ran (or attempted)
  // OpenCode — a template-engine failure has nothing to fall back to.
  const showFallback = gen?.codegen_engine !== 'template';

  async function handleRepair() {
    if (!gen) return;
    setRepairing(true);
    setRepairResult(null);
    try {
      const result = await repairGeneration(gen.generation_id);
      setRepairResult(`已创建修复版本 ${result.version_label}`);
      onRepair(result.version_label);
    } catch (e) {
      setRepairResult(`修复失败：${(e as Error).message}`);
    } finally {
      setRepairing(false);
    }
  }

  async function handleFallback() {
    if (!gen) return;
    setFallingBack(true);
    setRepairResult(null);
    try {
      const result = await fallbackGeneration(gen.generation_id);
      setRepairResult(`已切换模板引擎，创建版本 ${result.version_label}`);
      onRepair(result.version_label);
    } catch (e) {
      setRepairResult(`切换失败：${(e as Error).message}`);
    } finally {
      setFallingBack(false);
    }
  }

  return (
    <div className="rounded-lg border border-red-200 bg-red-50/80 p-4" data-testid="error-panel">
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-red-500" />
        <h3 className="text-xs font-semibold text-red-900">生成失败</h3>
      </div>
      <dl className="mt-3 grid grid-cols-[72px_1fr] gap-x-3 gap-y-1.5 text-[11px]">
        <dt className="text-red-600">错误码</dt>
        <dd className="font-mono text-red-900" data-testid="error-code">{errorCode}</dd>
        <dt className="text-red-600">错误信息</dt>
        <dd className="text-red-900" data-testid="error-message">{errorMessage}</dd>
      </dl>
      {sandboxEvents.length > 0 && (
        <details className="mt-3 text-[11px] text-red-700">
          <summary className="cursor-pointer">运行日志（{sandboxEvents.length} 条）</summary>
          <ul className="mt-2 space-y-1 border-l border-red-200 pl-3">
            {sandboxEvents.map((e) => (
              <li key={e.id} className="font-mono">
                [{e.type}] {e.message}
              </li>
            ))}
          </ul>
        </details>
      )}
      {runLog && (runLog.stdout || runLog.stderr) && (
        <details className="mt-3 text-[11px] text-red-700" data-testid="run-log-tail">
          <summary className="cursor-pointer">最近一次运行的 stdout / stderr（tail 200）</summary>
          {runLog.stdout && (
            <div className="mt-2">
              <p className="font-mono text-zinc-500">stdout:</p>
              <pre className="mt-1 max-h-40 overflow-auto rounded bg-zinc-950 p-2 text-[10px] leading-4 text-zinc-100">
                {runLog.stdout || '(空)'}
              </pre>
            </div>
          )}
          {runLog.stderr && (
            <div className="mt-2">
              <p className="font-mono text-zinc-500">stderr:</p>
              <pre className="mt-1 max-h-40 overflow-auto rounded bg-zinc-950 p-2 text-[10px] leading-4 text-red-200">
                {runLog.stderr}
              </pre>
            </div>
          )}
        </details>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleRepair}
          disabled={repairing || fallingBack}
          className="btn-primary rounded-md px-3 py-1.5 text-xs font-medium"
          data-testid="repair-button"
        >
          {repairing ? '修复中…' : '修复并重试'}
        </button>
        {showFallback && (
          <button
            type="button"
            onClick={handleFallback}
            disabled={repairing || fallingBack}
            className="btn-secondary rounded-md px-3 py-1.5 text-xs font-medium"
            data-testid="fallback-button"
          >
            {fallingBack ? '切换中…' : '切换模板引擎'}
          </button>
        )}
        {repairResult && (
          <span className="text-xs text-zinc-600" data-testid="repair-result">{repairResult}</span>
        )}
      </div>
      {showFallback && (
        <p className="mt-2 text-[11px] text-zinc-500">
          切换模板引擎将用确定性模板重新生成（mock 模式），便于继续演示源码与导出。
        </p>
      )}
    </div>
  );
}
