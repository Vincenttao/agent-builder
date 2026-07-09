import { PromptComposer } from '@/components/prompt/PromptComposer';
import { TaskHistory } from '@/components/history/TaskHistory';

/**
 * Home page (PRD §6.1). The workbench-first entry: a prompt composer that
 * switches between Agent / Workflow and starts a generation.
 *
 * Phase 14: task history is shown below the prompt composer.
 */
export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center gap-8 px-4 py-16">
      <header className="text-center">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          Agent Builder
        </h1>
        <p className="mt-2 max-w-xl text-sm text-slate-600">
          用自然语言生成基于 OpenJiuwen 的 Python Agent / Workflow 工程，自动运行测试、查看源码并导出。
        </p>
      </header>
      <PromptComposer />
      <hr className="w-full max-w-2xl border-slate-200" />
      <TaskHistory />
    </main>
  );
}
