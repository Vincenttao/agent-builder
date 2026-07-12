'use client';

import { useState } from 'react';
import type { GenerationEvent, GenerationDto } from '@agent-builder/shared-contracts';
import { EventType } from '@agent-builder/shared-contracts';
import { repairGeneration, fallbackGeneration } from '@/lib/api';

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

  const errorEvent = events.find((e) => e.type === EventType.Error);
  const errorCode = (errorEvent?.payload?.error_code as string) ?? gen?.error_code ?? 'UNKNOWN';
  const errorMessage = errorEvent?.message ?? gen?.error_message ?? '未知错误';

  const sandboxEvents = events.filter(
    (e) => e.type === EventType.SandboxFinished || e.type === EventType.TestFinished,
  );

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
