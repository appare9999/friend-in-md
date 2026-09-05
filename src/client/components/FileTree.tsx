import { useCallback, useState } from "react";
import type { FileTreeNode } from "@shared/types.js";

const COLLAPSED_DIRS_KEY = "friend-in-md:collapsedDirs";

function loadCollapsedDirs(): Set<string> {
  try {
    const raw = localStorage.getItem(COLLAPSED_DIRS_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

function saveCollapsedDirs(paths: Set<string>): void {
  try {
    localStorage.setItem(COLLAPSED_DIRS_KEY, JSON.stringify([...paths]));
  } catch {
    // localStorage unavailable (private mode etc) - just skip persistence
  }
}

interface Props {
  nodes: FileTreeNode[];
  selectedPath: string | null;
  onSelect: (path: string) => void;
}

export function FileTree({ nodes, selectedPath, onSelect }: Props) {
  const [collapsedDirs, setCollapsedDirs] = useState<Set<string>>(() => loadCollapsedDirs());

  const toggleDir = useCallback((path: string) => {
    setCollapsedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      saveCollapsedDirs(next);
      return next;
    });
  }, []);

  return (
    <ul className="tree">
      {nodes.map((node) => (
        <TreeNode
          key={node.path}
          node={node}
          selectedPath={selectedPath}
          onSelect={onSelect}
          collapsedDirs={collapsedDirs}
          onToggleDir={toggleDir}
        />
      ))}
    </ul>
  );
}

interface NodeProps {
  node: FileTreeNode;
  selectedPath: string | null;
  onSelect: (path: string) => void;
  collapsedDirs: Set<string>;
  onToggleDir: (path: string) => void;
}

function TreeNode({ node, selectedPath, onSelect, collapsedDirs, onToggleDir }: NodeProps) {
  if (node.type === "dir") {
    const isCollapsed = collapsedDirs.has(node.path);
    return (
      <li className="tree-dir">
        <button
          type="button"
          className="tree-dir-label"
          onClick={() => onToggleDir(node.path)}
          aria-expanded={!isCollapsed}
        >
          <span className={`tree-dir-caret ${isCollapsed ? "" : "open"}`}>▶</span>
          {node.name}
        </button>
        {!isCollapsed && (
          <ul>
            {(node.children ?? []).map((child) => (
              <TreeNode
                key={child.path}
                node={child}
                selectedPath={selectedPath}
                onSelect={onSelect}
                collapsedDirs={collapsedDirs}
                onToggleDir={onToggleDir}
              />
            ))}
          </ul>
        )}
      </li>
    );
  }

  const isSelected = node.path === selectedPath;
  const isCsv = node.fileKind === "csv";
  return (
    <li>
      <button
        className={`tree-file ${isSelected ? "selected" : ""} ${node.locked ? "locked" : ""} ${
          node.tooLarge ? "too-large" : ""
        }`}
        onClick={() => !node.tooLarge && onSelect(node.path)}
        disabled={node.tooLarge}
        title={node.tooLarge ? "File too large to open" : undefined}
      >
        {node.locked && <span className="lock-icon" title="locked">🔒</span>}
        {isCsv && <span className="file-kind-icon" title="csv">📊</span>}
        {node.name}
      </button>
    </li>
  );
}
