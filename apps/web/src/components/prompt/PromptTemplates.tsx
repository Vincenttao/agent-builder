'use client';

const TEMPLATES = [
  {
    title: '天气查询 Agent',
    type: 'agent' as const,
    prompt: '做一个天气查询 Agent，用户输入城市名，调用 get_weather 工具返回该城市的实时天气（温度、湿度、风力），并给出穿衣建议。',
  },
  {
    title: '简历优化 Agent',
    type: 'agent' as const,
    prompt: '做一个简历优化 Agent，用户上传简历文本，调用 analyze_resume 工具分析简历亮点和不足，调用 suggest_improvements 工具给出具体修改建议，最后输出优化后的简历。',
  },
  {
    title: '会议纪要 Agent',
    type: 'agent' as const,
    prompt: '做一个会议纪要 Agent，用户输入会议录音转写文本，调用 extract_topics 工具提取议题，调用 summarize_decisions 工具总结决议和待办事项，最后生成结构化会议纪要。',
  },
  {
    title: '合同审核 Workflow',
    type: 'workflow' as const,
    prompt: '做一个合同审核 Workflow：输入合同文本 -> 提取关键条款（金额、期限、违约责任） -> 逐条风险评估 -> 生成审核报告。',
  },
  {
    title: '客诉分级 Workflow',
    type: 'workflow' as const,
    prompt: '做一个客诉分级 Workflow：输入客户投诉内容 -> 分析严重程度和影响范围 -> 按优先级分级（紧急/高/中/低） -> 分配处理建议 -> 生成分级报告。',
  },
  {
    title: '内容审核 Workflow',
    type: 'workflow' as const,
    prompt: '做一个内容审核 Workflow：输入待审核文本 -> 检查违规内容（色情、暴力、政治敏感） -> 检查广告营销内容 -> 综合打分 -> 输出审核结论和修改建议。',
  },
];

export function PromptTemplates({
  onSelect,
}: {
  onSelect: (template: { prompt: string; type: 'agent' | 'workflow' }) => void;
}) {
  const demoTitles = new Set(['天气查询 Agent', '合同审核 Workflow']);
  return (
    <div data-testid="prompt-templates">
      <div className="mb-3">
        <p className="section-label">Prompt Templates</p>
        <p className="mt-1 text-xs text-zinc-500">选择模板后可继续编辑需求。</p>
      </div>
      <div className="space-y-2">
      {TEMPLATES.map((t) => (
        <button
          key={t.title}
          type="button"
          onClick={() => onSelect({ prompt: t.prompt, type: t.type })}
          className="group w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-left transition hover:border-brand/40 hover:bg-brand/5"
          data-testid="template-chip"
        >
          <span className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-zinc-800 group-hover:text-brand-ink">{t.title}</span>
            <span className="rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-[10px] uppercase text-zinc-500">
              {t.type}
            </span>
          </span>
          <span className="mt-1 line-clamp-2 block text-[11px] leading-4 text-zinc-500">
            {demoTitles.has(t.title) ? '推荐演示模板' : t.prompt}
          </span>
        </button>
      ))}
      </div>
    </div>
  );
}

export { TEMPLATES };
