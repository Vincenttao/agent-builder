import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FileTree } from './FileTree';
import { CodeViewer } from './CodeViewer';
import type { FileTreeNode } from '@agent-builder/shared-contracts';

const TREE: FileTreeNode[] = [
  {
    name: 'src',
    path: 'src',
    type: 'directory',
    children: [
      {
        name: 'agents',
        path: 'src/agents',
        type: 'directory',
        children: [{ name: 'agent.py', path: 'src/agents/agent.py', type: 'file' }],
      },
      {
        name: 'workflows',
        path: 'src/workflows',
        type: 'directory',
        children: [{ name: 'workflow.py', path: 'src/workflows/workflow.py', type: 'file' }],
      },
    ],
  },
  { name: 'pyproject.toml', path: 'pyproject.toml', type: 'file' },
];

describe('FileTree + CodeViewer (Phase 7 §11.2 #5)', () => {
  it('renders the project file tree with directories and files', () => {
    render(<FileTree tree={TREE} onSelect={() => {}} selectedPath={null} />);
    expect(screen.getByTestId('file-node-src/agents/agent.py')).toBeInTheDocument();
    expect(screen.getByTestId('file-node-src/workflows/workflow.py')).toBeInTheDocument();
    expect(screen.getByTestId('file-node-pyproject.toml')).toBeInTheDocument();
  });

  it('selecting a file calls onSelect with its path', () => {
    const onSelect = vi.fn();
    render(<FileTree tree={TREE} onSelect={onSelect} selectedPath={null} />);
    fireEvent.click(screen.getByTestId('file-node-src/agents/agent.py'));
    expect(onSelect).toHaveBeenCalledWith('src/agents/agent.py');
  });

  it('highlights the selected file', () => {
    render(<FileTree tree={TREE} onSelect={() => {}} selectedPath="src/agents/agent.py" />);
    const btn = screen.getByTestId('file-node-src/agents/agent.py');
    expect(btn.className).toContain('brand');
  });

  it('CodeViewer shows empty state when no file is selected', () => {
    render(<CodeViewer path={null} content={null} />);
    expect(screen.getByTestId('codeviewer-empty')).toBeInTheDocument();
  });

  it('CodeViewer shows the path and content for the selected file', () => {
    render(<CodeViewer path="src/agents/agent.py" content={'print("hi")'} />);
    expect(screen.getByTestId('codeviewer')).toHaveTextContent('src/agents/agent.py');
    expect(screen.getByTestId('codeviewer')).toHaveTextContent('print("hi")');
  });
});
