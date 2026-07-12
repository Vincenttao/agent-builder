import { PromptComposer } from '@/components/prompt/PromptComposer';
import { TaskHistory } from '@/components/history/TaskHistory';
import { Diagnostics } from '@/components/Diagnostics';

/**
 * Home page (PRD §6.1). The workbench-first entry: a prompt composer that
 * switches between Agent / Workflow and starts a generation.
 *
 * Phase 14: task history is shown below the prompt composer.
 */
export default function HomePage() {
  return (
    <main className="min-h-screen bg-zinc-100 px-5 py-5 text-zinc-950">
      <div className="mx-auto flex max-w-7xl flex-col gap-5">
        <header className="flex items-center justify-between border-b border-zinc-200 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-brand text-sm font-semibold text-white">
              AB
            </div>
            <div>
              <h1 className="text-base font-semibold text-zinc-950">Agent Builder</h1>
              <p className="text-xs text-zinc-500">OpenJiuwen Agent / Workflow 工程生成控制台</p>
            </div>
          </div>
          <div className="hidden items-center gap-2 text-xs text-zinc-500 sm:flex">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <span>Demo workspace</span>
          </div>
        </header>

        <section className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="surface rounded-lg p-4">
            <p className="section-label">Demo Flow</p>
            <ol className="mt-4 space-y-3 text-xs text-zinc-600">
              {[
                ['01', '选择 Agent 或 Workflow'],
                ['02', '输入自然语言需求'],
                ['03', '生成代码并运行 smoke test'],
                ['04', '查看源码、测试效果、导出工程'],
              ].map(([step, label]) => (
                <li key={step} className="flex gap-3">
                  <span className="flex h-5 w-7 shrink-0 items-center justify-center rounded border border-zinc-200 bg-zinc-50 font-mono text-[10px] text-zinc-500">
                    {step}
                  </span>
                  <span>{label}</span>
                </li>
              ))}
            </ol>
            <div className="mt-5 border-t border-zinc-200 pt-4">
              <Diagnostics />
            </div>
          </aside>

          <PromptComposer />
        </section>

        <TaskHistory />
      </div>
    </main>
  );
}
