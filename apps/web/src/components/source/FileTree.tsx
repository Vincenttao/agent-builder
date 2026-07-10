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
            className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-white ${
              selectedPath === n.path ? 'bg-white font-semibold text-brand-ink shadow-sm' : 'text-zinc-600'
            }`}
            style={{ paddingLeft: `${depth * 12 + 4}px` }}
            data-testid={`file-node-${n.path}`}
            disabled={n.type !== 'file'}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${n.type === 'directory' ? 'bg-amber-500' : 'bg-zinc-400'}`}
            />
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
    return <p className="p-3 text-xs text-zinc-400" data-testid="filetree-empty">尚无文件</p>;
  }
  return (
    <div className="overflow-auto p-2" data-testid="filetree">
      <Tree nodes={tree} depth={0} onSelect={onSelect} selectedPath={selectedPath} />
    </div>
  );
}
