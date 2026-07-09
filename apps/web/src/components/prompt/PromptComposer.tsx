'use client';

import { useState } from 'react';
import { GenerationType } from '@agent-builder/shared-contracts';
import { PromptTemplates } from './PromptTemplates';

const TYPE_OPTIONS: { value: GenerationType; label: string; hint: string }[] = [
  { value: GenerationType.Agent, label: '智能体', hint: '对话式 Agent' },
  { value: GenerationType.Workflow, label: '工作流', hint: '多节点流程编排' },
];

const EXAMPLES: Record<GenerationType, string> = {
  [GenerationType.Agent]:
    '一个塔罗牌占卜 Agent。首先询问用户想要占卜的问题，之后抽取塔罗牌并解读。',
  [GenerationType.Workflow]:
    '读取客户需求文档，抽取客户目标和限制条件，匹配可演示的解决方案，生成 Demo 清单并输出一份 Markdown 报告。',
};

type CreateGenerationResponse =
  | { generation_id: string; status: string }
  | { error_code: string; message: string };

/**
 * Home page prompt composer (PRD §6.1 / §12.1).
 *
 * Submits a generation request and redirects to the generation workspace.
 * P0 only supports Agent / Workflow — Skills is intentionally absent (PRD §4.2).
 */
export function PromptComposer() {
  const [type, setType] = useState<GenerationType>(GenerationType.Agent);
  const [prompt, setPrompt] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function fillExample() {
    setPrompt(EXAMPLES[type]);
  }

  function handleSelectTemplate(template: { prompt: string; type: 'agent' | 'workflow' }) {
    setType(template.type === 'workflow' ? GenerationType.Workflow : GenerationType.Agent);
    setPrompt(template.prompt);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = prompt.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/generations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, prompt: trimmed, mode: 'auto', model: 'default' }),
      });
      const data = (await res.json()) as CreateGenerationResponse;
      if (!res.ok || !('generation_id' in data)) {
        setError('message' in data ? data.message : '生成失败，请重试');
        return;
      }
      window.location.href = `/generations/${data.generation_id}`;
    } catch {
      setError('网络错误，请检查后端服务是否启动');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto flex w-full max-w-3xl flex-col gap-4" data-testid="prompt-composer">
      <div className="flex items-center gap-2" role="radiogroup" aria-label="生成类型">
        {TYPE_OPTIONS.map((opt) => {
          const active = type === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={active}
              data-testid={`type-${opt.value}`}
              onClick={() => setType(opt.value)}
              className={
                'rounded-full border px-4 py-1.5 text-sm font-medium transition ' +
                (active
                  ? 'border-brand bg-brand text-white'
                  : 'border-slate-300 bg-white text-slate-700 hover:border-brand')
              }
            >
              {opt.label}
              <span className="ml-1.5 text-xs opacity-70">{opt.hint}</span>
            </button>
          );
        })}
      </div>

      <PromptTemplates onSelect={handleSelectTemplate} />

      <label htmlFor="prompt" className="sr-only">
        自然语言需求
      </label>
      <textarea
        id="prompt"
        name="prompt"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="描述你想要的 Agent 或 Workflow…"
        rows={6}
        className="w-full resize-y rounded-xl border border-slate-300 bg-white p-4 text-sm shadow-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
        data-testid="prompt-input"
      />

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={fillExample}
          className="text-xs text-slate-500 underline-offset-2 hover:underline"
          data-testid="fill-example"
        >
          填充示例
        </button>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500" data-testid="mode-label">
            模式：Auto
          </span>
          <button
            type="submit"
            disabled={submitting || !prompt.trim()}
            className="rounded-lg bg-brand px-5 py-2 text-sm font-semibold text-white shadow transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50"
            data-testid="submit-button"
          >
            {submitting ? '生成中…' : '开始生成'}
          </button>
        </div>
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600" data-testid="submit-error">
          {error}
        </p>
      )}
    </form>
  );
}
