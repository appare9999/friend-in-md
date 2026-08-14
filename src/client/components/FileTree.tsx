import type { FileTreeNode } from "@shared/types.js";

interface Props {
  nodes: FileTreeNode[];
  selectedPath: string | null;
  onSelect: (path: string) => void;
}

export function FileTree({ nodes, selectedPath, onSelect }: Props) {
  return (
    <ul className="tree">
      {nodes.map((node) => (
        <TreeNode key={node.path} node={node} selectedPath={selectedPath} onSelect={onSelect} />
      ))}
    </ul>
  );
}

interface NodeProps {
  node: FileTreeNode;
  selectedPath: string | null;
  onSelect: (path: string) => void;
}

function TreeNode({ node, selectedPath, onSelect }: NodeProps) {
  if (node.type === "dir") {
    return (
      <li className="tree-dir">
        <div className="tree-dir-label">{node.name}</div>
        <ul>
          {(node.children ?? []).map((child) => (
            <TreeNode key={child.path} node={child} selectedPath={selectedPath} onSelect={onSelect} />
          ))}
        </ul>
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
