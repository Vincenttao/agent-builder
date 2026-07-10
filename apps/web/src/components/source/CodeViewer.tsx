/** Read-only code viewer (PRD FR-009 — P0 source view is read-only). */
export function CodeViewer({ path, content }: { path: string | null; content: string | null }) {
  if (!path || content == null) {
    return (
      <div className="flex h-full items-center justify-center bg-white text-xs text-zinc-400" data-testid="codeviewer-empty">
        选择左侧文件以查看源码
      </div>
    );
  }
  return (
    <div className="flex h-full flex-col" data-testid="codeviewer">
      <div className="border-b border-zinc-200 bg-zinc-50 px-3 py-2 font-mono text-[11px] font-medium text-zinc-600">
        {path}
      </div>
      <pre className="flex-1 overflow-auto bg-white p-4 text-[12px] leading-6 text-zinc-800">
        {content}
      </pre>
    </div>
  );
}
