'use client';

import { useEffect, useRef, useState } from 'react';
import { agentRun, getGeneration, getManifest } from '@/lib/api';
import type { RunnerResult, GenerationDto } from '@agent-builder/shared-contracts';

/**
 * Agent effect test bench (PRD FR-007, §12.3). Sends a message and shows the
 * mock reply + recorded tool calls. D-023: shows agent name and mock status.
 * P3-005: prefills the message from the manifest's example_input.
 */
export function AgentTestPanel({ generationId }: { generationId: string }) {
  const [message, setMessage] = useState('');
  const [reply, setReply] = useState<string | null>(null);
  const [toolCalls, setToolCalls] = useState<Record<string, unknown>[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gen, setGen] = useState<GenerationDto | null>(null);
  const [runMode, setRunMode] = useState<string | null>(null);
  const [runCount, setRunCount] = useState(0);
  // Track whether the user typed, so a late manifest load can't overwrite it.
  const userEditedRef = useRef(false);

  useEffect(() => {
    getGeneration(generationId).then(setGen).catch(() => undefined);
    getManifest(generationId)
      .then((m) => {
        const sample = typeof m.example_input === 'string' ? m.example_input : '';
        if (sample.trim() && !userEditedRef.current) setMessage(sample);
      })
      .catch(() => undefined);
  }, [generationId]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim() || sending) return;
    setSending(true);
    setError(null);
    try {
      const result: RunnerResult = await agentRun(generationId, message.trim());
      setReply((result.output as { reply?: string } | null)?.reply ?? '(无回复)');
      setToolCalls(result.events ?? []);
      setRunMode(result.mode ?? (result.mock ? 'mock' : null));
      setRunCount((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : '运行失败');
    } finally {
      setSending(false);
    }
  }

  function clear() {
    setReply(null);
    setToolCalls([]);
    setError(null);
    setMessage('');
  }

  return (
    <div className="surface flex h-full flex-col gap-4 rounded-lg p-4" data-testid="agent-test-panel">
      <div className="flex items-center justify-between border-b border-zinc-200 pb-3">
        <div>
          <p className="section-label">Run Bench</p>
          <h2 className="mt-1 text-sm font-semibold text-zinc-950">
            {gen?.title ?? 'Agent 效果测试'}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          {runCount > 0 && (
            <span className="rounded border border-zinc-200 bg-zinc-50 px-2 py-1 text-[11px] text-zinc-500">
              已运行 {runCount} 次
            </span>
          )}
          <span className="rounded border border-zinc-200 bg-zinc-50 px-2 py-1 text-[11px] text-zinc-500">
            {gen?.codegen_engine === 'opencode' ? 'OpenCode' : 'Template'}
          </span>
        </div>
      </div>

      <form onSubmit={send} className="flex gap-2">
        <input
          className="control flex-1 rounded-md px-3 py-2 text-xs"
          placeholder="输入测试消息…"
          aria-label="Agent 测试消息"
          value={message}
          onChange={(e) => { userEditedRef.current = true; setMessage(e.target.value); }}
          data-testid="agent-message-input"
        />
        <button
          type="submit"
          disabled={sending || !message.trim()}
          className="btn-primary rounded-md px-4 py-2 text-xs font-semibold"
          data-testid="agent-send"
        >
          {sending ? '运行中…' : '发送'}
        </button>
        <button
          type="button"
          onClick={clear}
          className="btn-secondary rounded-md px-3 py-2 text-xs font-medium"
          data-testid="agent-clear"
        >
          清空
        </button>
      </form>

      {runMode === 'mock_fallback' && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800" data-testid="agent-fallback">
          ⚠ Mock fallback — 真实运行失败，显示模拟输出
        </div>
      )}
      {reply && (
        <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4 text-xs leading-6 whitespace-pre-wrap text-zinc-800" data-testid="agent-reply">
          {reply}
        </div>
      )}

      {toolCalls.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer font-medium text-zinc-600">工具调用记录（{toolCalls.length}）</summary>
          <pre className="mt-2 overflow-auto rounded-md bg-zinc-950 p-3 text-[11px] leading-5 text-zinc-100">
            {JSON.stringify(toolCalls, null, 2)}
          </pre>
        </details>
      )}

      {error && (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700" data-testid="agent-error">
          {error}
        </p>
      )}
    </div>
  );
}
