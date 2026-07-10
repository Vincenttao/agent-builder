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
      // Route through the draft/spec-confirmation flow so users can review
      // and edit the parsed Spec before code generation starts (P2 D2).
      const res = await fetch('/api/generations/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, prompt: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message ?? '生成失败，请重试');
        return;
      }
      window.location.href = `/drafts/${data.draft_id}?type=${type}`;
    } catch {
      setError('网络错误，请检查后端服务是否启动');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="surface flex min-h-[520px] w-full flex-col rounded-lg"
      data-testid="prompt-composer"
    >
      <div className="flex items-start justify-between border-b border-zinc-200 px-5 py-4">
        <div>
          <p className="section-label">New Generation</p>
          <h2 className="mt-1 text-lg font-semibold text-zinc-950">创建 OpenJiuwen 工程</h2>
          <p className="mt-1 text-xs text-zinc-500">选择对象类型，输入业务需求，生成可运行 Python 项目。</p>
        </div>
        <span className="rounded border border-zinc-200 bg-zinc-50 px-2 py-1 text-[11px] font-medium text-zinc-500">
          Mode Auto
        </span>
      </div>

      <div className="grid flex-1 gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="flex min-w-0 flex-col gap-4">
          <div>
            <p className="mb-2 text-xs font-medium text-zinc-700">生成类型</p>
            <div
              className="inline-grid grid-cols-2 rounded-md border border-zinc-300 bg-zinc-100 p-0.5"
              role="radiogroup"
              aria-label="生成类型"
            >
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
                      'min-w-36 rounded px-3 py-2 text-left transition ' +
                      (active
                        ? 'bg-white text-brand-ink shadow-sm'
                        : 'text-zinc-500 hover:text-zinc-800')
                    }
                  >
                    <span className="block text-xs font-semibold">{opt.label}</span>
                    <span className="mt-0.5 block text-[11px]">{opt.hint}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-1 flex-col">
            <div className="mb-2 flex items-center justify-between">
              <label htmlFor="prompt" className="text-xs font-medium text-zinc-700">
                自然语言需求
              </label>
              <button
                type="button"
                onClick={fillExample}
                className="text-xs font-medium text-brand hover:text-brand-dark"
                data-testid="fill-example"
              >
                填充当前类型示例
              </button>
            </div>
            <textarea
              id="prompt"
              name="prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="例如：读取客户需求，抽取目标和限制条件，匹配可演示方案，输出 Markdown 报告。"
              rows={12}
              className="control min-h-64 w-full flex-1 resize-none rounded-md px-4 py-3 text-[13px] leading-6"
              data-testid="prompt-input"
            />
          </div>
        </div>

        <div className="border-l border-zinc-200 pl-5">
          <PromptTemplates onSelect={handleSelectTemplate} />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-200 px-5 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-medium text-zinc-500">
            OpenJiuwen
          </span>
          <span className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-medium text-zinc-500">
            Context ready
          </span>
          <span
            className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-medium text-zinc-600"
            data-testid="mode-label"
          >
            Auto
          </span>
        </div>
        <button
          type="submit"
          disabled={submitting || !prompt.trim()}
          className="btn-primary rounded-md px-5 py-2 text-xs font-semibold"
          data-testid="submit-button"
        >
          {submitting ? '生成中…' : '开始生成'}
        </button>
      </div>

      {error && (
        <p role="alert" className="border-t border-red-200 bg-red-50 px-5 py-3 text-xs text-red-700" data-testid="submit-error">
          {error}
        </p>
      )}
    </form>
  );
}
