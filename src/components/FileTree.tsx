import { useMemo, useState } from "react";
import type { FileNode } from "../types";

type Props = {
  nodes: FileNode[];
  activePath: string | null;
  onOpenFile: (node: FileNode) => void;
};

function TreeNode({
  node,
  depth,
  activePath,
  onOpenFile,
}: {
  node: FileNode;
  depth: number;
  activePath: string | null;
  onOpenFile: (node: FileNode) => void;
}) {
  const [open, setOpen] = useState(depth < 1);

  if (node.type === "directory") {
    return (
      <div>
        <button
          type="button"
          className="tree-item"
          style={{ paddingLeft: 8 + depth * 12 }}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="chev">{open ? "▾" : "▸"}</span>
          <span className="icon">📂</span>
          <span className="label">{node.name}</span>
        </button>
        {open &&
          node.children?.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              activePath={activePath}
              onOpenFile={onOpenFile}
            />
          ))}
      </div>
    );
  }

  return (
    <button
      type="button"
      className={`tree-item ${activePath === node.path ? "active" : ""}`}
      style={{ paddingLeft: 8 + depth * 12 }}
      onClick={() => onOpenFile(node)}
    >
      <span className="chev" />
      <span className="icon">📄</span>
      <span className="label">{node.name}</span>
    </button>
  );
}

export function FileTree({ nodes, activePath, onOpenFile }: Props) {
  const empty = useMemo(() => nodes.length === 0, [nodes]);

  if (empty) {
    return (
      <div className="empty-sidebar">
        <strong>No files yet</strong>
        Open a folder to browse your project.
      </div>
    );
  }

  return (
    <div className="file-tree">
      {nodes.map((node) => (
        <TreeNode
          key={node.path}
          node={node}
          depth={0}
          activePath={activePath}
          onOpenFile={onOpenFile}
        />
      ))}
    </div>
  );
}
