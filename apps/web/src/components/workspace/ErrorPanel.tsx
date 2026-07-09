'use client';

import { useState } from 'react';
import type { GenerationEvent, GenerationDto } from '@agent-builder/shared-contracts';
import { EventType } from '@agent-builder/shared-contracts';
import { repairGeneration } from '@/lib/api';

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
  const [repairResult, setRepairResult] = useState<string | null>(null);

  const errorEvent = events.find((e) => e.type === EventType.Error);
  const errorCode = (errorEvent?.payload?.error_code as string) ?? gen?.error_code ?? 'UNKNOWN';
  const errorMessage = errorEvent?.message ?? gen?.error_message ?? '未知错误';

  const sandboxEvents = events.filter(
    (e) => e.type === EventType.SandboxFinished || e.type === EventType.TestFinished,
  );

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

  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-4" data-testid="error-panel">
      <div className="flex items-center gap-2">
        <span className="text-lg">❌</span>
        <h3 className="text-sm font-semibold text-red-800">生成失败</h3>
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        <dt className="text-red-600">错误码</dt>
        <dd className="font-mono text-red-900" data-testid="error-code">{errorCode}</dd>
        <dt className="text-red-600">错误信息</dt>
        <dd className="text-red-900" data-testid="error-message">{errorMessage}</dd>
      </dl>
      {sandboxEvents.length > 0 && (
        <details className="mt-2 text-xs text-red-700">
          <summary className="cursor-pointer">运行日志（{sandboxEvents.length} 条）</summary>
          <ul className="mt-1 space-y-1 pl-4">
            {sandboxEvents.map((e) => (
              <li key={e.id} className="font-mono">
                [{e.type}] {e.message}
              </li>
            ))}
          </ul>
        </details>
      )}
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={handleRepair}
          disabled={repairing}
          className="rounded-md bg-brand px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-brand/90 disabled:opacity-50"
          data-testid="repair-button"
        >
          {repairing ? '修复中…' : '修复并重试'}
        </button>
        {repairResult && (
          <span className="text-xs text-slate-600" data-testid="repair-result">{repairResult}</span>
        )}
      </div>
    </div>
  );
}
