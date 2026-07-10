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
  pending: 'bg-zinc-100 text-zinc-600',
  planning: 'bg-cyan-50 text-cyan-700',
  generating: 'bg-amber-50 text-amber-700',
  testing: 'bg-teal-50 text-teal-700',
  completed: 'bg-emerald-50 text-emerald-700',
  failed: 'bg-red-50 text-red-700',
};

export function TaskHistory() {
  const [generations, setGenerations] = useState<GenerationDto[]>([]);
  const [filter, setFilter] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    listGenerations(filter || undefined, 50, 0)
      .then((list) => { if (!cancelled) { setGenerations(list); setLoading(false); } })
      .catch((e) => { if (!cancelled) { setError((e as Error).message); setLoading(false); } });
    return () => { cancelled = true; };
  }, [filter]);

  return (
    <section className="surface rounded-lg" data-testid="task-history">
      <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4">
        <div>
          <p className="section-label">History</p>
          <h2 className="mt-1 text-sm font-semibold text-zinc-950">任务历史</h2>
        </div>
        <div className="flex gap-2">
          {['', 'completed', 'failed'].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setFilter(s)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                filter === s
                  ? 'bg-brand text-white'
                  : 'border border-zinc-200 bg-white text-zinc-600 hover:border-brand/50 hover:text-brand-ink'
              }`}
              data-testid={`filter-${s || 'all'}`}
            >
              {s ? STATUS_LABEL[s] : '全部'}
            </button>
          ))}
        </div>
      </div>

      {loading && <p className="py-8 text-center text-xs text-zinc-400">加载中…</p>}
      {error && <p className="py-8 text-center text-xs text-red-600">{error}</p>}

      {!loading && !error && generations.length === 0 && (
        <p className="py-8 text-center text-xs text-zinc-400">暂无任务记录</p>
      )}

      {!loading && generations.length > 0 && (
        <ul className="divide-y divide-zinc-100">
          {generations.map((g) => (
            <li key={g.generation_id}>
              <Link
                href={`/generations/${g.generation_id}`}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-5 py-3 transition hover:bg-zinc-50"
                data-testid="task-item"
              >
                <div className="min-w-0">
                  <h3 className="truncate text-xs font-semibold text-zinc-900">{g.title}</h3>
                  <p className="mt-1 text-[11px] text-zinc-500">
                    {g.type === 'workflow' ? 'Workflow' : 'Agent'}
                    {g.parser_mode && ` / ${g.parser_mode}`}
                    {g.codegen_engine && ` / ${g.codegen_engine}`}
                    <span className="ml-2 text-zinc-400">
                      {new Date(g.created_at).toLocaleString('zh-CN')}
                    </span>
                  </p>
                </div>
                <span
                  className={`inline-flex rounded px-2 py-1 text-[11px] font-medium ${STATUS_COLOR[g.status] ?? 'bg-zinc-100 text-zinc-600'}`}
                >
                  {STATUS_LABEL[g.status] ?? g.status}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
