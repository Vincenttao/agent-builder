/** Read-only code viewer (PRD FR-009 — P0 source view is read-only). */
export function CodeViewer({ path, content }: { path: string | null; content: string | null }) {
  if (!path || content == null) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-slate-400" data-testid="codeviewer-empty">
        选择左侧文件以查看源码
      </div>
    );
  }
  return (
    <div className="flex h-full flex-col" data-testid="codeviewer">
      <div className="border-b border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
        {path}
      </div>
      <pre className="flex-1 overflow-auto bg-white p-3 text-xs leading-relaxed text-slate-800">
        {content}
      </pre>
    </div>
  );
}
