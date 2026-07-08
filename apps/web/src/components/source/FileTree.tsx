import type { FileTreeNode } from '@agent-builder/shared-contracts';

function Tree({ nodes, depth, onSelect, selectedPath }: {
  nodes: FileTreeNode[];
  depth: number;
  onSelect: (path: string) => void;
  selectedPath: string | null;
}) {
  return (
    <ul>
      {nodes.map((n) => (
        <li key={n.path}>
          <button
            type="button"
            onClick={() => n.type === 'file' && onSelect(n.path)}
            className={`flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-sm hover:bg-slate-100 ${
              selectedPath === n.path ? 'bg-brand/10 font-medium text-brand' : 'text-slate-700'
            }`}
            style={{ paddingLeft: `${depth * 12 + 4}px` }}
            data-testid={`file-node-${n.path}`}
            disabled={n.type !== 'file'}
          >
            <span className="text-xs">{n.type === 'directory' ? '📁' : '📄'}</span>
            <span className="truncate">{n.name}</span>
          </button>
          {n.type === 'directory' && n.children && (
            <Tree nodes={n.children} depth={depth + 1} onSelect={onSelect} selectedPath={selectedPath} />
          )}
        </li>
      ))}
    </ul>
  );
}

/** Project file tree (PRD FR-009, §12.5). Presentational. */
export function FileTree({
  tree,
  onSelect,
  selectedPath,
}: {
  tree: FileTreeNode[];
  onSelect: (path: string) => void;
  selectedPath: string | null;
}) {
  if (tree.length === 0) {
    return <p className="p-2 text-xs text-slate-400" data-testid="filetree-empty">尚无文件</p>;
  }
  return (
    <div className="overflow-auto" data-testid="filetree">
      <Tree nodes={tree} depth={0} onSelect={onSelect} selectedPath={selectedPath} />
    </div>
  );
}
