'use client';

import { useState } from 'react';
import { agentRun } from '@/lib/api';
import type { RunnerResult } from '@agent-builder/shared-contracts';

/**
 * Agent effect test bench (PRD FR-007, §12.3). Sends a message and shows the
 * mock reply + recorded tool calls.
 */
export function AgentTestPanel({ generationId }: { generationId: string }) {
  const [message, setMessage] = useState('');
  const [reply, setReply] = useState<string | null>(null);
  const [toolCalls, setToolCalls] = useState<Record<string, unknown>[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim() || sending) return;
    setSending(true);
    setError(null);
    try {
      const result: RunnerResult = await agentRun(generationId, message.trim());
      setReply((result.output as { reply?: string } | null)?.reply ?? '(无回复)');
      setToolCalls(result.events ?? []);
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
    <div className="flex h-full flex-col gap-3" data-testid="agent-test-panel">
      <form onSubmit={send} className="flex gap-2">
        <input
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand"
          placeholder="输入测试消息…"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          data-testid="agent-message-input"
        />
        <button
          type="submit"
          disabled={sending || !message.trim()}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          data-testid="agent-send"
        >
          {sending ? '运行中…' : '发送'}
        </button>
        <button
          type="button"
          onClick={clear}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600"
          data-testid="agent-clear"
        >
          清空
        </button>
      </form>

      {reply && (
        <div className="rounded-lg bg-slate-50 p-3 text-sm whitespace-pre-wrap" data-testid="agent-reply">
          {reply}
        </div>
      )}

      {toolCalls.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-slate-600">工具调用记录（{toolCalls.length}）</summary>
          <pre className="mt-1 overflow-auto rounded bg-slate-900 p-2 text-slate-100">
            {JSON.stringify(toolCalls, null, 2)}
          </pre>
        </details>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-600" data-testid="agent-error">
          {error}
        </p>
      )}
    </div>
  );
}
