'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { DraftResponse } from '@agent-builder/shared-contracts';
import { getDraft, updateDraftSpec, confirmDraft } from '@/lib/api';

export function SpecConfirmation({ draftId }: { draftId: string }) {
  const searchParams = useSearchParams();
  const prompt = searchParams.get('prompt') ?? '';
  const type = searchParams.get('type') ?? 'agent';

  const [draft, setDraft] = useState<DraftResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [specJson, setSpecJson] = useState('');
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 1500));
        if (cancelled) return;
        try {
          const d = await getDraft(draftId);
          if (d.status !== 'pending') {
            setDraft(d);
            setSpecJson(JSON.stringify(d.spec, null, 2));
            setLoading(false);
            return;
          }
        } catch { /* keep polling */ }
      }
      if (!cancelled) {
        setError('Spec 解析超时，请返回重试');
        setLoading(false);
      }
    }
    poll();
    return () => { cancelled = true; };
  }, [draftId]);

  async function handleConfirm() {
    if (!draft) return;
    setConfirming(true);
    try {
      const { generation_id } = await confirmDraft(draftId);
      window.location.href = `/generations/${generation_id}`;
    } catch (e) {
      setError((e as Error).message);
      setConfirming(false);
    }
  }

  async function handleSaveSpec() {
    try {
      const spec = JSON.parse(specJson);
      await updateDraftSpec(draftId, spec);
      const d = await getDraft(draftId);
      setDraft(d);
      setEditing(false);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-zinc-500">正在解析需求生成 Spec…</p>
      </div>
    );
  }

  const spec = draft?.spec as Record<string, unknown> | null;

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <div className="surface rounded-lg p-6" data-testid="spec-confirmation">
        <h2 className="text-base font-semibold text-zinc-950">确认生成规格</h2>
        <p className="mt-1 text-xs text-zinc-500">
          以下是根据你的需求解析出的 {type === 'workflow' ? 'Workflow' : 'Agent'} Spec，确认无误后开始生成代码。
        </p>

        {error && (
          <p className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
        )}

        <div className="mt-4 rounded-md border border-zinc-200 bg-zinc-50 p-4">
          <dl className="grid grid-cols-[80px_1fr] gap-x-3 gap-y-1 text-xs">
            <dt className="text-zinc-500">名称</dt>
            <dd className="font-medium text-zinc-900">{spec?.name as string ?? '—'}</dd>
            <dt className="text-zinc-500">描述</dt>
            <dd className="text-zinc-700">{spec?.description as string ?? '—'}</dd>
            <dt className="text-zinc-500">解析方式</dt>
            <dd className="text-zinc-700">{draft?.parser_mode ?? '—'} / {draft?.model ?? '—'}</dd>
            {spec && 'tools' in spec && (
              <>
                <dt className="text-zinc-500">工具数</dt>
                <dd className="text-zinc-700">{(spec.tools as unknown[])?.length ?? 0}</dd>
              </>
            )}
            {spec && 'nodes' in spec && (
              <>
                <dt className="text-zinc-500">节点数</dt>
                <dd className="text-zinc-700">{(spec.nodes as unknown[])?.length ?? 0}</dd>
              </>
            )}
          </dl>
        </div>

        {editing ? (
          <div className="mt-4">
            <label className="text-xs font-medium text-zinc-700">编辑 Spec JSON</label>
            <textarea
              className="control mt-1 w-full rounded-md px-3 py-2 font-mono text-xs leading-5"
              rows={20}
              value={specJson}
              onChange={(e) => setSpecJson(e.target.value)}
            />
            <div className="mt-3 flex gap-2">
              <button onClick={handleSaveSpec} className="btn-primary rounded-md px-4 py-2 text-xs font-semibold">
                保存修改
              </button>
              <button onClick={() => setEditing(false)} className="btn-secondary rounded-md px-4 py-2 text-xs font-medium">
                取消
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-4 flex gap-2">
            <button
              onClick={handleConfirm}
              disabled={confirming}
              className="btn-primary rounded-md px-5 py-2 text-xs font-semibold"
            >
              {confirming ? '确认中…' : '确认并生成'}
            </button>
            <button onClick={() => setEditing(true)} className="btn-secondary rounded-md px-4 py-2 text-xs font-medium">
              修改 Spec
            </button>
            <button onClick={() => window.history.back()} className="rounded-md px-4 py-2 text-xs text-zinc-500 hover:text-zinc-700">
              返回修改 prompt
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
