'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { GenerationDto } from '@agent-builder/shared-contracts';
import { listGenerations } from '@/lib/api';

const STATUS_LABEL: Record<string, string> = {
  pending: '等待',
  planning: '规划中',
  generating: '生成中',
  testing: '测试中',
  completed: '已完成',
  failed: '失败',
};

const STATUS_COLOR: Record<string, string> = {
  pending: 'bg-slate-100 text-slate-600',
  planning: 'bg-blue-100 text-blue-700',
  generating: 'bg-amber-100 text-amber-700',
  testing: 'bg-purple-100 text-purple-700',
  completed: 'bg-emerald-100 text-emerald-700',
  failed: 'bg-red-100 text-red-700',
};

export function TaskHistory() {
  const [generations, setGenerations] = useState<GenerationDto[]>([]);
  const [filter, setFilter] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    listGenerations(filter || undefined, 50, 0)
      .then(setGenerations)
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [filter]);

  return (
    <div className="mx-auto max-w-2xl py-8" data-testid="task-history">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">任务历史</h2>
        <div className="flex gap-2">
          {['', 'completed', 'failed'].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setFilter(s)}
              className={`rounded-full px-3 py-1 text-xs transition-colors ${
                filter === s
                  ? 'bg-brand text-white'
                  : 'border border-slate-200 bg-white text-slate-600 hover:border-brand'
              }`}
              data-testid={`filter-${s || 'all'}`}
            >
              {s ? STATUS_LABEL[s] : '全部'}
            </button>
          ))}
        </div>
      </div>

      {loading && <p className="py-8 text-center text-sm text-slate-400">加载中…</p>}
      {error && <p className="py-8 text-center text-sm text-red-600">{error}</p>}

      {!loading && !error && generations.length === 0 && (
        <p className="py-8 text-center text-sm text-slate-400">暂无任务记录</p>
      )}

      {!loading && generations.length > 0 && (
        <ul className="space-y-3">
          {generations.map((g) => (
            <li key={g.generation_id}>
              <Link
                href={`/generations/${g.generation_id}`}
                className="block rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
                data-testid="task-item"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-medium text-slate-900">{g.title}</h3>
                    <p className="mt-1 text-xs text-slate-500">
                      {g.type === 'workflow' ? 'Workflow' : 'Agent'}
                      {g.parser_mode && ` · ${g.parser_mode}`}
                      {g.codegen_engine && ` · ${g.codegen_engine}`}
                    </p>
                  </div>
                  <span
                    className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLOR[g.status] ?? 'bg-slate-100 text-slate-600'}`}
                  >
                    {STATUS_LABEL[g.status] ?? g.status}
                  </span>
                </div>
                <p className="mt-2 text-xs text-slate-400">
                  {new Date(g.created_at).toLocaleString('zh-CN')}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
